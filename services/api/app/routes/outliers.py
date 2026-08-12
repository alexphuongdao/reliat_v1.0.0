"""Outliers endpoints — feed the Outliers triage inbox and channel history table."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agent_threads import record_diagnosis_run
from ..auth import Principal, get_principal
from ..db import get_session
from ..diagnostic_agent import DiagnosticAgentError, run_diagnosis
from ..models import Channel, Measurement, Outlier, OutlierDiagnosis
from ..schemas import DiagnosisOut, OutlierOut, OutlierPatch

router = APIRouter(prefix="/api/outliers", tags=["outliers"])


def _owned_outlier(session: Session, outlier_id: str, principal: Principal) -> Outlier:
    """Fetch an outlier the caller's tenant owns, or 404.

    Ownership is inherited from the outlier's channel — that's the only place
    `tenant_id` lives. 404 rather than 403 so ids from another tenant aren't
    confirmable.
    """
    q = (
        session.query(Outlier)
        .join(Channel, Channel.id == Outlier.channel_id)
        .filter(Outlier.id == outlier_id)
    )
    if principal.tenant_id is not None:
        q = q.filter(Channel.tenant_id == principal.tenant_id)
    o = q.first()
    if o is None:
        raise HTTPException(404, f"no outlier {outlier_id}")
    return o


def _diagnosis_out(d: OutlierDiagnosis) -> DiagnosisOut:
    return DiagnosisOut(
        id=d.id,
        outlierId=d.outlier_id,
        createdAt=int(d.created_at.timestamp() * 1000),
        status=d.status,  # type: ignore[arg-type]
        model=d.model,
        rootCause=d.root_cause,
        confidence=d.confidence,
        hypotheses=d.hypotheses,  # type: ignore[arg-type]
        recommendedAction=d.recommended_action,
        evidenceSummary=d.evidence_summary,
        inputTokens=d.input_tokens,
        outputTokens=d.output_tokens,
        costUsd=d.cost_usd,
        error=d.error,
    )


def _series_index_for(session: Session, channel_id: str, t_dt) -> int:
    """`indexInSeries` is the position of the outlier's measurement inside the
    channel's full series (matches what the chart marker layer expects)."""
    n_before = (
        session.query(Measurement)
        .filter(Measurement.channel_id == channel_id, Measurement.t < t_dt)
        .count()
    )
    return n_before


@router.get("", response_model=list[OutlierOut])
def list_outliers(
    sev: list[str] | None = Query(None),
    status: list[str] | None = Query(None),
    channel_id: str | None = Query(None),
    classification: str | None = Query(None, alias="type"),
    limit: int = Query(500, le=2000),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[OutlierOut]:
    stmt = (
        select(Outlier, Channel)
        .join(Channel, Channel.id == Outlier.channel_id)
        .order_by(Outlier.t.desc())
        .limit(limit)
    )
    if principal.tenant_id is not None:
        stmt = stmt.where(Channel.tenant_id == principal.tenant_id)
    if sev:
        stmt = stmt.where(Outlier.sev.in_(sev))
    if status:
        stmt = stmt.where(Outlier.status.in_(status))
    if channel_id:
        stmt = stmt.where(Outlier.channel_id == channel_id)
    if classification:
        stmt = stmt.where(Outlier.type == classification)

    out: list[OutlierOut] = []
    for o, c in session.execute(stmt).all():
        out.append(OutlierOut(
            id=o.id,
            channelId=o.channel_id,
            channelName=c.name,
            t=int(o.t.timestamp() * 1000),
            metric=o.metric,
            unit=o.unit,
            value=o.value,
            baseline=o.baseline,
            deviation=o.deviation,
            sev=o.sev,  # type: ignore[arg-type]
            type=o.type,
            confidence=o.confidence,
            status=o.status,  # type: ignore[arg-type]
            assignee=o.assignee,
            summary=o.summary,
            action=o.action,
            indexInSeries=_series_index_for(session, o.channel_id, o.t),
        ))
    return out


@router.patch("/{outlier_id}", response_model=OutlierOut)
def patch_outlier(
    outlier_id: str,
    body: OutlierPatch,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> OutlierOut:
    o = _owned_outlier(session, outlier_id, principal)
    if body.status is not None:
        o.status = body.status
    if body.assignee is not None:
        o.assignee = body.assignee
    session.commit()
    session.refresh(o)
    c = session.query(Channel).filter(Channel.id == o.channel_id).first()
    return OutlierOut(
        id=o.id,
        channelId=o.channel_id,
        channelName=c.name if c else o.channel_id,
        t=int(o.t.timestamp() * 1000),
        metric=o.metric,
        unit=o.unit,
        value=o.value,
        baseline=o.baseline,
        deviation=o.deviation,
        sev=o.sev,  # type: ignore[arg-type]
        type=o.type,
        confidence=o.confidence,
        status=o.status,  # type: ignore[arg-type]
        assignee=o.assignee,
        summary=o.summary,
        action=o.action,
        indexInSeries=_series_index_for(session, o.channel_id, o.t),
    )


@router.post("/{outlier_id}/diagnose", response_model=DiagnosisOut)
def diagnose_outlier(
    outlier_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> DiagnosisOut:
    """Run the Diagnostic Agent on one outlier and persist the result."""
    # Ownership check before the model call — this endpoint spends real
    # Anthropic credits, so an unauthorised id must not get that far.
    outlier = _owned_outlier(session, outlier_id, principal)
    try:
        diagnosis = run_diagnosis(session, outlier_id)
    except DiagnosticAgentError as exc:
        raise HTTPException(404, str(exc)) from exc
    session.add(diagnosis)
    session.flush()

    # Also record the run as conversation. The response shape is unchanged —
    # the Outliers screen keeps working exactly as before — but the run now
    # survives as something the Agent screen can list and reopen instead of
    # being reachable only from the one outlier it belonged to.
    channel = session.query(Channel).filter(Channel.id == outlier.channel_id).first()
    tenant_id = principal.tenant_id or (channel.tenant_id if channel else None)
    if tenant_id is not None:
        record_diagnosis_run(
            session,
            tenant_id=tenant_id,
            outlier=outlier,
            channel=channel,
            diagnosis=diagnosis,
            user_id=principal.user.id,
        )

    session.commit()
    session.refresh(diagnosis)
    return _diagnosis_out(diagnosis)


@router.get("/{outlier_id}/diagnoses", response_model=list[DiagnosisOut])
def list_diagnoses(
    outlier_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[DiagnosisOut]:
    _owned_outlier(session, outlier_id, principal)
    rows = (
        session.query(OutlierDiagnosis)
        .filter(OutlierDiagnosis.outlier_id == outlier_id)
        .order_by(OutlierDiagnosis.created_at.desc())
        .all()
    )
    return [_diagnosis_out(d) for d in rows]

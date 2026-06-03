"""Outliers endpoints — real excursions from PsdRow + persistent triage state.

The excursion *events* are derived from PsdRow on the fly (the analytics
engine recomputes them per request — fast at our scale). Triage state
(ack / resolve / assign) lives in the `excursion_triage` table, keyed
by a deterministic hash of (channel, t, metric) so the same event keeps
its status across re-detections.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..analytics import excursions as compute_excursions
from ..db import get_session
from ..models import ExcursionTriage, PsdRow, User
from ..schemas import OutlierOut, OutlierPatch
from ..security import get_current_user

router = APIRouter(prefix="/api/outliers", tags=["outliers"])

# Map analytics severity → schemas severity (which excludes "ok").
_SEV_OK_FALLBACK = "info"


def _excursion_id(channel: str, t_ms: int, metric: str) -> str:
    """Deterministic id — stable as long as cadence config doesn't move."""
    raw = f"{channel}|{t_ms}|{metric}".encode()
    return hashlib.sha1(raw).hexdigest()[:16]


def _series_index_for(session: Session, channel_name: str, t_ms: int) -> int:
    t_dt = datetime.utcfromtimestamp(t_ms / 1000.0)
    return session.query(PsdRow).filter(
        PsdRow.channel_name == channel_name,
        PsdRow.synthesized_t < t_dt,
    ).count()


def _summary_for(metric: str, value: float, baseline: float, z: float, sev: str) -> str:
    direction = "above" if value > baseline else "below"
    return f"{metric} {direction} baseline by {abs(z):.1f}σ ({value:.2f} vs μ {baseline:.2f})"


def _action_for(metric: str, sev: str) -> str:
    if sev == "critical":
        return f"Investigate {metric} excursion immediately"
    if sev == "warn":
        return f"Review {metric} trend in next hour"
    return f"Monitor {metric}"


@router.get("", response_model=list[OutlierOut])
def list_outliers(
    sev: list[str] | None = Query(None),
    status: list[str] | None = Query(None),
    channel_id: str | None = Query(None),
    classification: str | None = Query(None, alias="type"),
    limit: int = Query(500, le=2000),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[OutlierOut]:
    # Compute every >=2σ event in the last 7 days. Re-runs on every
    # request; cheap at our cadence (≤ 1/min × N channels × 7d).
    cutoff = datetime.utcnow() - timedelta(days=7)
    events = compute_excursions(
        session,
        channel_name=channel_id,
        t_from=cutoff,
        threshold=2.0,
        limit=limit,
    )

    # Overlay any persisted triage state. One bulk query.
    ids = [_excursion_id(e["channel"], e["t"], e["metric"]) for e in events]
    triage_by_id: dict[str, ExcursionTriage] = {}
    if ids:
        for t in session.scalars(
            select(ExcursionTriage).where(ExcursionTriage.id.in_(ids))
        ).all():
            triage_by_id[t.id] = t

    out: list[OutlierOut] = []
    for e in events:
        eid = _excursion_id(e["channel"], e["t"], e["metric"])
        triage = triage_by_id.get(eid)
        event_sev = e["severity"] if e["severity"] != "ok" else _SEV_OK_FALLBACK

        if sev and event_sev not in sev:
            continue
        current_status = triage.status if triage else "open"
        if status and current_status not in status:
            continue
        if classification and classification != e["metric"]:
            continue

        out.append(OutlierOut(
            id=eid,
            channelId=e["channel"],
            channelName=e["channel"],
            t=int(e["t"]),
            metric=e["metric"],
            unit="in" if e["metric"].startswith(("f", "topsize")) else "",
            value=float(e["value"]),
            baseline=float(e["baseline"]),
            deviation=float(abs(e["z"])),
            sev=event_sev,  # type: ignore[arg-type]
            type=f"{e['metric']}_excursion",
            confidence=min(1.0, abs(e["z"]) / 4.0),
            status=current_status,  # type: ignore[arg-type]
            assignee=triage.assignee if triage else None,
            summary=(triage.summary if triage and triage.summary else
                     _summary_for(e["metric"], float(e["value"]), float(e["baseline"]),
                                  float(e["z"]), event_sev)),
            action=(triage.action if triage and triage.action else
                    _action_for(e["metric"], event_sev)),
            indexInSeries=_series_index_for(session, e["channel"], int(e["t"])),
        ))
    return out


@router.patch("/{outlier_id}", response_model=OutlierOut)
def patch_outlier(
    outlier_id: str,
    body: OutlierPatch,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> OutlierOut:
    # Find the event by re-running detection and matching by id. We bound
    # the search to 7d so this is cheap; if you ack something older the
    # frontend would have had to load it from somewhere with that window.
    cutoff = datetime.utcnow() - timedelta(days=7)
    events = compute_excursions(
        session, channel_name=None, t_from=cutoff, threshold=2.0, limit=2000,
    )
    match = None
    for e in events:
        if _excursion_id(e["channel"], e["t"], e["metric"]) == outlier_id:
            match = e
            break
    if match is None:
        raise HTTPException(404, f"no outlier {outlier_id}")

    triage = session.get(ExcursionTriage, outlier_id)
    if triage is None:
        triage = ExcursionTriage(
            id=outlier_id,
            channel_name=match["channel"],
            t=datetime.utcfromtimestamp(match["t"] / 1000.0),
            metric=match["metric"],
            status=body.status or "open",
            assignee=body.assignee,
            updated_by_user_id=user.id,
        )
        session.add(triage)
    else:
        if body.status is not None:
            triage.status = body.status
        if body.assignee is not None:
            triage.assignee = body.assignee
        triage.updated_by_user_id = user.id
    session.commit()
    session.refresh(triage)

    event_sev = match["severity"] if match["severity"] != "ok" else _SEV_OK_FALLBACK
    return OutlierOut(
        id=outlier_id,
        channelId=match["channel"],
        channelName=match["channel"],
        t=int(match["t"]),
        metric=match["metric"],
        unit="in" if match["metric"].startswith(("f", "topsize")) else "",
        value=float(match["value"]),
        baseline=float(match["baseline"]),
        deviation=float(abs(match["z"])),
        sev=event_sev,  # type: ignore[arg-type]
        type=f"{match['metric']}_excursion",
        confidence=min(1.0, abs(match["z"]) / 4.0),
        status=triage.status,  # type: ignore[arg-type]
        assignee=triage.assignee,
        summary=triage.summary or _summary_for(
            match["metric"], float(match["value"]), float(match["baseline"]),
            float(match["z"]), event_sev,
        ),
        action=triage.action or _action_for(match["metric"], event_sev),
        indexInSeries=_series_index_for(session, match["channel"], int(match["t"])),
    )

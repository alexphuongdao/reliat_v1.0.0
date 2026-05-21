"""Outliers endpoints — feed the Outliers triage inbox and channel history table."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Channel, Measurement, Outlier
from ..schemas import OutlierOut, OutlierPatch

router = APIRouter(prefix="/api/outliers", tags=["outliers"])


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
    session: Session = Depends(get_session),
) -> list[OutlierOut]:
    stmt = (
        select(Outlier, Channel)
        .join(Channel, Channel.id == Outlier.channel_id)
        .order_by(Outlier.t.desc())
        .limit(limit)
    )
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
    session: Session = Depends(get_session),
) -> OutlierOut:
    o = session.query(Outlier).filter(Outlier.id == outlier_id).first()
    if o is None:
        raise HTTPException(404, f"no outlier {outlier_id}")
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

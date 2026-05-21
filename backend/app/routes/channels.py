"""Channels endpoints — feed the Channels screen and the cross-screen sidebar."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Channel, Measurement, Outlier
from ..schemas import ChannelOut, PsdPercentile, PsdSieve, PsdSnapshot, SeriesPoint

router = APIRouter(prefix="/api/channels", tags=["channels"])

RANGE_MINUTES = {
    "1h": 60,
    "shift": 480,
    "24h": 1440,
    "7d": 1440 * 7,
    "30d": 1440 * 30,
}


@router.get("", response_model=list[ChannelOut])
def list_channels(session: Session = Depends(get_session)) -> list[ChannelOut]:
    rows = session.query(Channel).order_by(Channel.id).all()
    return [
        ChannelOut(
            id=c.id, name=c.name, belt=c.belt, color=c.color,
            baseF80=c.base_f80, baseTopsize=c.base_topsize,
            online=c.online, shift=c.shift,
        )
        for c in rows
    ]


@router.get("/{channel_id}/series", response_model=list[SeriesPoint])
def get_series(
    channel_id: str,
    range: str = Query("24h", description="One of 1h, shift, 24h, 7d, 30d"),
    session: Session = Depends(get_session),
) -> list[SeriesPoint]:
    if range not in RANGE_MINUTES:
        raise HTTPException(400, f"unknown range '{range}'")
    minutes = RANGE_MINUTES[range]

    ms = (
        session.query(Measurement)
        .filter(Measurement.channel_id == channel_id)
        .order_by(Measurement.t.desc())
        .limit(minutes)
        .all()
    )
    if not ms:
        raise HTTPException(404, f"no series for channel {channel_id}")
    ms.reverse()

    # Tag points that correspond to outliers — the chart marker layer reads this.
    times = {m.t: m.id for m in ms}
    if times:
        out_rows = (
            session.query(Outlier)
            .filter(Outlier.channel_id == channel_id)
            .filter(Outlier.t >= ms[0].t, Outlier.t <= ms[-1].t)
            .all()
        )
    else:
        out_rows = []
    outliers_by_t = {o.t: o for o in out_rows}

    points: list[SeriesPoint] = []
    for m in ms:
        o = outliers_by_t.get(m.t)
        points.append(SeriesPoint(
            t=int(m.t.timestamp() * 1000),
            v=m.f80,
            outlier={"sev": o.sev, "deviation": o.deviation} if o else None,
            color=m.color_hsl,
        ))
    return points


@router.get("/{channel_id}/psd", response_model=PsdSnapshot)
def get_psd(
    channel_id: str,
    t: int | None = Query(None, description="epoch ms; defaults to latest sample"),
    session: Session = Depends(get_session),
) -> PsdSnapshot:
    q = session.query(Measurement).filter(Measurement.channel_id == channel_id)
    if t is not None:
        target = datetime.fromtimestamp(t / 1000.0, tz=timezone.utc)
        # closest sample to t — bounded scan around the target
        window_start = target - timedelta(minutes=2)
        window_end = target + timedelta(minutes=2)
        m = (
            q.filter(Measurement.t >= window_start, Measurement.t <= window_end)
             .order_by(Measurement.t.desc())
             .first()
        )
        if m is None:
            m = q.order_by(Measurement.t.desc()).first()
    else:
        m = q.order_by(Measurement.t.desc()).first()

    if m is None:
        raise HTTPException(404, f"no measurement for channel {channel_id}")

    psd = m.psd or {}
    pct_map = psd.get("percentiles", {}) if isinstance(psd, dict) else {}
    pcts = [
        PsdPercentile(name=k, x=float(k[1:]), y=float(pct_map.get(k, 0.0)))
        for k in ("F10", "F20", "F30", "F40", "F50", "F60", "F70", "F80", "F90")
    ]
    sieves = [
        PsdSieve(size=float(s.get("size", 0.0)), passing=float(s.get("passing", 0.0)))
        for s in (psd.get("sieves") or [])
    ]
    return PsdSnapshot(pcts=pcts, sieves=sieves)

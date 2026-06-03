"""Channels endpoints — now driven by real PsdRow data.

These were the mock-substrate endpoints; in E.4 they were rewritten to
read from the ingest pipeline. Frontend response shapes are unchanged
so the existing screens continue to consume them without an adapter.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from ..db import get_session
from ..models import SIEVE_COLUMNS, ChannelConfig, PsdRow
from ..schemas import ChannelOut, PsdPercentile, PsdSieve, PsdSnapshot, SeriesPoint
from ..security import get_current_user
from ..models import User

router = APIRouter(prefix="/api/channels", tags=["channels"])

# Frontend ranges → how far back we slice. Backend doesn't enforce a row
# cap because PsdRow is indexed on synthesized_t and customer cadence is
# ≤ 1/min — a week is ≈ 10k rows, plenty cheap.
RANGE_MINUTES = {
    "1h": 60,
    "shift": 480,
    "24h": 1440,
    "7d": 1440 * 7,
    "30d": 1440 * 30,
}

# Palette tokens used to color channels in the locked design. Hash the
# channel name to one of them so a given channel always shows the same
# color across screens.
_PALETTE = (
    "var(--ch-1)", "var(--ch-2)", "var(--ch-3)",
    "var(--ch-4)", "var(--ch-5)", "var(--ch-6)",
)


def _channel_color(name: str) -> str:
    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
    return _PALETTE[h % len(_PALETTE)]


def _shift_label(now: datetime) -> str:
    # Mining sites typically run A/B/C 8-hour shifts. We don't know
    # the customer's exact schedule yet — use UTC hour as a stand-in
    # so the value is at least stable per request.
    h = now.hour
    if 6 <= h < 14:
        return "A"
    if 14 <= h < 22:
        return "B"
    return "C"


def _to_iso_color(r: PsdRow) -> str:
    """Build the hsl() string the existing charts consume from per-row HSL."""
    # avg_hue is 0–1 in the customer's export; convert to 0–360 for CSS.
    h = (r.avg_hue or 0.0) * 360.0
    s = max(0.0, min(1.0, r.avg_saturation or 0.0)) * 100.0
    l = max(0.0, min(1.0, r.avg_lightness or 0.0)) * 100.0
    # Clamp lightness to a visible band so the strip doesn't go black.
    l = max(12.0, min(88.0, l))
    return f"hsl({h:.0f}, {s:.0f}%, {l:.0f}%)"


@router.get("", response_model=list[ChannelOut])
def list_channels(session: Session = Depends(get_session)) -> list[ChannelOut]:
    """List ingested channels with baseline values derived from their rows.

    `id` is the URL-safe channel_name (the frontend treats id as opaque).
    `baseF80` / `baseTopsize` come from the channel's full-history mean.
    `online` = saw a row in the last hour.
    """
    cfgs = {c.channel_name: c for c in session.scalars(select(ChannelConfig)).all()}
    names = [
        r[0]
        for r in session.execute(
            select(PsdRow.channel_name).distinct().order_by(PsdRow.channel_name)
        ).all()
    ]

    now = datetime.utcnow()
    out: list[ChannelOut] = []
    for name in names:
        last = session.scalar(
            select(PsdRow.synthesized_t)
            .where(PsdRow.channel_name == name)
            .order_by(PsdRow.synthesized_t.desc())
            .limit(1)
        )
        # Quick aggregates — small enough to hit the DB twice rather than
        # pulling everything into pandas just for two means.
        from sqlalchemy import func
        mean_f80 = session.scalar(
            select(func.avg(PsdRow.f80)).where(PsdRow.channel_name == name)
        ) or 0.0
        mean_topsize = session.scalar(
            select(func.avg(PsdRow.topsize)).where(PsdRow.channel_name == name)
        ) or 0.0

        cfg = cfgs.get(name)
        online = last is not None and (now - last).total_seconds() < 3600

        out.append(ChannelOut(
            id=name,
            name=(cfg.display_name if cfg else None) or name,
            belt=(cfg.belt if cfg else None) or name,
            color=_channel_color(name),
            baseF80=float(mean_f80),
            baseTopsize=float(mean_topsize),
            online=online,
            shift=_shift_label(now),
        ))
    return out


@router.get("/{channel_id}/series", response_model=list[SeriesPoint])
def get_series(
    channel_id: str,
    range: str = Query("24h", description="One of 1h, shift, 24h, 7d, 30d"),
    session: Session = Depends(get_session),
) -> list[SeriesPoint]:
    if range not in RANGE_MINUTES:
        raise HTTPException(400, f"unknown range '{range}'")
    minutes = RANGE_MINUTES[range]

    # Anchor the window to the channel's latest row so demos with sparse
    # data still show something instead of an empty chart.
    latest = session.scalar(
        select(PsdRow.synthesized_t)
        .where(PsdRow.channel_name == channel_id)
        .order_by(PsdRow.synthesized_t.desc())
        .limit(1)
    )
    if latest is None:
        return []

    cutoff = latest - timedelta(minutes=minutes)
    rows = session.scalars(
        select(PsdRow)
        .where(PsdRow.channel_name == channel_id)
        .where(PsdRow.synthesized_t >= cutoff)
        .order_by(PsdRow.synthesized_t.asc())
    ).all()
    if not rows:
        return []

    # Outlier flag derived in-line from a rolling mean ± 2σ window over
    # the points we're returning. Cheap when the slice is bounded.
    vals = [r.f80 for r in rows]
    n = len(vals)
    points: list[SeriesPoint] = []
    for i, r in enumerate(rows):
        lo = max(0, i - 30)
        window = vals[lo : i + 1]
        if len(window) >= 3:
            m = sum(window) / len(window)
            var = sum((x - m) ** 2 for x in window) / max(len(window) - 1, 1)
            sd = var ** 0.5
        else:
            m = vals[i]
            sd = 0.0
        z = (vals[i] - m) / sd if sd > 0 else 0.0
        sev: str | None = None
        if abs(z) >= 3:
            sev = "critical"
        elif abs(z) >= 2:
            sev = "warn"
        elif abs(z) >= 1.5:
            sev = "info"

        points.append(SeriesPoint(
            t=int(r.synthesized_t.replace(tzinfo=timezone.utc).timestamp() * 1000),
            v=float(r.f80),
            outlier=({"sev": sev, "deviation": float(abs(z))} if sev else None),
            color=_to_iso_color(r),
        ))
    return points


@router.get("/{channel_id}/psd", response_model=PsdSnapshot)
def get_psd(
    channel_id: str,
    t: int | None = Query(None, description="epoch ms; defaults to latest sample"),
    session: Session = Depends(get_session),
) -> PsdSnapshot:
    q = select(PsdRow).where(PsdRow.channel_name == channel_id)
    if t is not None:
        target = datetime.utcfromtimestamp(t / 1000.0)
        window_start = target - timedelta(minutes=2)
        window_end = target + timedelta(minutes=2)
        r = session.scalars(
            q.where(PsdRow.synthesized_t >= window_start)
             .where(PsdRow.synthesized_t <= window_end)
             .order_by(PsdRow.synthesized_t.desc())
             .limit(1)
        ).first()
        if r is None:
            r = session.scalars(q.order_by(PsdRow.synthesized_t.desc()).limit(1)).first()
    else:
        r = session.scalars(q.order_by(PsdRow.synthesized_t.desc()).limit(1)).first()

    if r is None:
        raise HTTPException(404, f"no data for channel {channel_id}")

    # Percentiles: name=F10..F90, x = the percentile number, y = particle size.
    # The customer file stores sizes in inches; report as-is — the chart
    # doesn't care about units, only consistent ordering.
    pcts = [
        PsdPercentile(name=f"F{i}", x=float(i), y=float(getattr(r, f"f{i}")))
        for i in (10, 20, 30, 40, 50, 60, 70, 80, 90)
    ]
    sieves = [
        PsdSieve(size=float(size), passing=float(getattr(r, col)))
        for col, size in SIEVE_COLUMNS
    ]
    return PsdSnapshot(pcts=pcts, sieves=sieves)


# ---------------------------------------------------------------------------
# Channel config — lets the user set iterations_per_minute and display
# metadata. The cadence directly affects every synthesized timestamp on
# subsequent ingests; existing rows keep their original timestamps.
# ---------------------------------------------------------------------------


class ChannelConfigOut(BaseModel):
    channel_name: str
    display_name: str | None
    belt: str | None
    iterations_per_minute: float
    rows_total: int


class ChannelConfigPatch(BaseModel):
    display_name: str | None = None
    belt: str | None = None
    iterations_per_minute: float | None = Field(default=None, gt=0, le=600)


@router.get("/configs", response_model=list[ChannelConfigOut])
def list_channel_configs(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[ChannelConfigOut]:
    """List configs for every channel that has either a config row or any data."""
    from sqlalchemy import func
    configs = {c.channel_name: c for c in session.scalars(select(ChannelConfig)).all()}
    counts_q = session.execute(
        select(PsdRow.channel_name, func.count(PsdRow.id))
        .group_by(PsdRow.channel_name)
    ).all()
    counts = {name: int(n) for name, n in counts_q}

    all_names = sorted(set(configs.keys()) | set(counts.keys()))
    out: list[ChannelConfigOut] = []
    for name in all_names:
        cfg = configs.get(name)
        out.append(ChannelConfigOut(
            channel_name=name,
            display_name=cfg.display_name if cfg else None,
            belt=cfg.belt if cfg else None,
            iterations_per_minute=cfg.iterations_per_minute if cfg else 1.0,
            rows_total=counts.get(name, 0),
        ))
    return out


@router.patch("/configs/{channel_name}", response_model=ChannelConfigOut)
def update_channel_config(
    channel_name: str,
    body: ChannelConfigPatch,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> ChannelConfigOut:
    cfg = session.get(ChannelConfig, channel_name)
    if cfg is None:
        cfg = ChannelConfig(channel_name=channel_name, iterations_per_minute=1.0)
        session.add(cfg)
    if body.display_name is not None:
        cfg.display_name = body.display_name
    if body.belt is not None:
        cfg.belt = body.belt
    if body.iterations_per_minute is not None:
        cfg.iterations_per_minute = body.iterations_per_minute
    session.commit()
    session.refresh(cfg)

    from sqlalchemy import func
    n = session.scalar(
        select(func.count(PsdRow.id)).where(PsdRow.channel_name == channel_name)
    ) or 0
    return ChannelConfigOut(
        channel_name=cfg.channel_name,
        display_name=cfg.display_name,
        belt=cfg.belt,
        iterations_per_minute=cfg.iterations_per_minute,
        rows_total=int(n),
    )

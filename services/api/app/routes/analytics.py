"""Analytics endpoints over ingested PsdRow data.

GET /api/analytics/channels              channel summary + KPIs
GET /api/analytics/series                metric series with rolling band
GET /api/analytics/spc                   SPC chart (mean + 1σ/2σ/3σ bands)
GET /api/analytics/psd                   averaged sieve curve
GET /api/analytics/excursions            out-of-band events
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import analytics as A
from ..db import get_session
from ..models import METRIC_COLUMNS, User
from ..security import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

_METRIC_NAMES = {m for m, _ in METRIC_COLUMNS}


def _parse_epoch_ms(v: int | None) -> datetime | None:
    if v is None:
        return None
    return datetime.utcfromtimestamp(v / 1000.0)


@router.get("/channels")
def list_channel_summaries(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    return A.channel_summary(session)


@router.get("/series")
def get_series(
    channel: str = Query(..., description="channel_name as ingested"),
    metric: str = Query("topsize"),
    window: str = Query("10m", description="1m|5m|10m|30m|1h|1d"),
    t_from: int | None = Query(None, description="epoch ms"),
    t_to: int | None = Query(None, description="epoch ms"),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    if metric not in _METRIC_NAMES:
        raise HTTPException(400, f"unknown metric '{metric}'")
    try:
        return A.series_with_bands(
            session, channel, metric, window,
            _parse_epoch_ms(t_from), _parse_epoch_ms(t_to),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/spc")
def get_spc(
    channel: str = Query(...),
    metric: str = Query("topsize"),
    window: str = Query("1h"),
    t_from: int | None = Query(None),
    t_to: int | None = Query(None),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    if metric not in _METRIC_NAMES:
        raise HTTPException(400, f"unknown metric '{metric}'")
    try:
        return A.spc_series(
            session, channel, metric, window,
            _parse_epoch_ms(t_from), _parse_epoch_ms(t_to),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/psd")
def get_psd_curve(
    channel: str = Query(...),
    t_from: int | None = Query(None),
    t_to: int | None = Query(None),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    return A.psd_curve(
        session, channel,
        _parse_epoch_ms(t_from), _parse_epoch_ms(t_to),
    )


@router.get("/excursions")
def get_excursions(
    channel: str | None = Query(None),
    threshold: float = Query(2.0, ge=0.5, le=6.0),
    t_from: int | None = Query(None),
    t_to: int | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    return A.excursions(
        session, channel,
        _parse_epoch_ms(t_from), _parse_epoch_ms(t_to),
        threshold=threshold, limit=limit,
    )


@router.get("/metrics")
def list_metrics(
    _: User = Depends(get_current_user),
) -> list[dict[str, str]]:
    """Available metrics + display labels (drives the chart's metric picker)."""
    return [{"id": m, "label": label} for m, label in METRIC_COLUMNS]

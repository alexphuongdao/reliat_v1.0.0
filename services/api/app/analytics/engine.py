"""Pandas-backed analytics over ingested PsdRow data.

Each entry point loads the rows it needs into a DataFrame, runs the
computation, and returns plain Python structures the FastAPI route
serializes verbatim. The dashboard's chart components consume these
shapes directly — no adapter layer.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import METRIC_COLUMNS, SIEVE_COLUMNS, ChannelConfig, PsdRow


def _f(v: Any, default: float = 0.0) -> float:
    """Float coercion that turns NaN / Inf into a safe default.

    Critical: the default `json` encoder writes NaN as the literal token
    `NaN`, which is invalid JSON, so any pandas NaN bleeding into a
    response makes `res.json()` throw on the client. This kills the
    whole Promise.all even if only one metric had no samples. Every
    float that leaves a return statement should pass through here.
    """
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    if math.isnan(x) or math.isinf(x):
        return default
    return x


def _scrub(obj: Any) -> Any:
    """Recursively replace NaN / Inf floats with None inside a JSON-bound payload.

    Belt-and-braces for any place we forget `_f()` — applied at each
    route entry point so the response is always valid JSON.
    """
    if isinstance(obj, dict):
        return {k: _scrub(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_scrub(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
    return obj

# Default lookback when a caller doesn't specify one. Tuned for the
# expected analyzer cadence (≤ 1 iter/min) — at 1/min this is 24h × 60 = 1440 rows.
DEFAULT_LOOKBACK_HOURS = 24

# The window labels the dashboard exposes. Mapped to pandas offset aliases.
WINDOW_TO_OFFSET: dict[str, str] = {
    "1m": "1min",
    "5m": "5min",
    "10m": "10min",
    "30m": "30min",
    "1h": "1h",
    "1d": "1D",
}

# Severity tiers based on absolute z-score (rolling-σ standard).
SEV_INFO = 1.5
SEV_WARN = 2.0
SEV_CRIT = 3.0

# Metrics that travel together for channel KPIs.
KPI_METRICS: tuple[str, ...] = ("topsize", "f80", "f50", "f10", "avg_lightness")


def _load_rows(
    session: Session,
    channel_name: str,
    t_from: datetime | None,
    t_to: datetime | None,
) -> pd.DataFrame:
    """Pull rows for one channel into a DataFrame indexed by synthesized_t."""
    q = select(PsdRow).where(PsdRow.channel_name == channel_name)
    if t_from is not None:
        q = q.where(PsdRow.synthesized_t >= t_from)
    if t_to is not None:
        q = q.where(PsdRow.synthesized_t <= t_to)
    q = q.order_by(PsdRow.synthesized_t.asc())
    rows = session.scalars(q).all()
    if not rows:
        return pd.DataFrame()

    # Pull every column we might chart on. Sieve + metric + identity columns.
    records = [
        {
            "t": r.synthesized_t,
            "iteration_count": r.iteration_count,
            **{m: getattr(r, m) for m, _ in METRIC_COLUMNS},
            **{s: getattr(r, s) for s, _ in SIEVE_COLUMNS},
        }
        for r in rows
    ]
    df = pd.DataFrame.from_records(records)
    df["t"] = pd.to_datetime(df["t"])
    df = df.set_index("t").sort_index()
    return df


def _epoch_ms(ts: pd.Timestamp | datetime) -> int:
    if isinstance(ts, pd.Timestamp):
        ts = ts.to_pydatetime()
    return int(ts.timestamp() * 1000)


# ---------------------------------------------------------------------------
# Channel summary — drives the dashboard KPI strip + channel grid.
# ---------------------------------------------------------------------------


def channel_summary(session: Session) -> list[dict[str, Any]]:
    """One summary row per ingested channel.

    Includes count, time bounds, configured cadence, and a per-metric
    digest (current, last-hour mean/std, range status) for the KPIs the
    dashboard renders.
    """
    configs = {c.channel_name: c for c in session.scalars(select(ChannelConfig)).all()}

    # Distinct channel_names that actually have data.
    channel_names: list[str] = [
        r[0] for r in session.execute(
            select(PsdRow.channel_name).distinct().order_by(PsdRow.channel_name)
        ).all()
    ]

    out: list[dict[str, Any]] = []
    for name in channel_names:
        df = _load_rows(session, name, None, None)
        if df.empty:
            continue
        cfg = configs.get(name)
        last_seen = df.index.max()
        first_seen = df.index.min()
        # Last-hour slice for fresh stats; fall back to the whole frame
        # for short samples that don't reach an hour yet.
        cutoff = last_seen - pd.Timedelta(hours=1)
        recent = df[df.index >= cutoff]
        if len(recent) < 5:
            recent = df

        metrics: dict[str, Any] = {}
        for col in KPI_METRICS:
            if col not in df.columns:
                continue
            current = float(df[col].iloc[-1])
            mean_recent = float(recent[col].mean())
            std_recent = float(recent[col].std() or 0.0)
            mean_all = float(df[col].mean())
            std_all = float(df[col].std() or 0.0)
            z = (current - mean_all) / std_all if std_all > 0 else 0.0
            metrics[col] = {
                "current": current,
                "mean_recent": mean_recent,
                "std_recent": std_recent,
                "mean_all": mean_all,
                "std_all": std_all,
                "z": z,
                "in_range": abs(z) < SEV_CRIT,
                "severity": _z_to_severity(z),
            }

        out.append({
            "channel_name": name,
            "display_name": (cfg.display_name if cfg else None) or name,
            "belt": cfg.belt if cfg else None,
            "iterations_per_minute": cfg.iterations_per_minute if cfg else 1.0,
            "rows_total": int(len(df)),
            "first_seen": _epoch_ms(first_seen),
            "last_seen": _epoch_ms(last_seen),
            "online": (datetime.utcnow() - last_seen.to_pydatetime()).total_seconds() < 3600,
            "metrics": metrics,
        })
    return out


def _z_to_severity(z: float) -> str:
    az = abs(z)
    if az >= SEV_CRIT:
        return "critical"
    if az >= SEV_WARN:
        return "warn"
    if az >= SEV_INFO:
        return "info"
    return "ok"


# ---------------------------------------------------------------------------
# Series — point time series with rolling mean / std overlay for one metric.
# ---------------------------------------------------------------------------


def series_with_bands(
    session: Session,
    channel_name: str,
    metric: str,
    window: str = "10m",
    t_from: datetime | None = None,
    t_to: datetime | None = None,
) -> dict[str, Any]:
    """Per-iteration values with a rolling mean + 1σ band overlay.

    `window` selects the rolling baseline length (1m/5m/10m/30m/1h/1d).
    Returns raw points (every iteration) plus a same-length rolling
    mean/std so the chart can shade a band underneath the line.
    """
    if metric not in {m for m, _ in METRIC_COLUMNS}:
        raise ValueError(f"unknown metric: {metric}")
    offset = WINDOW_TO_OFFSET.get(window, "10min")

    if t_from is None or t_to is None:
        # Default: last 24h relative to the most recent data point.
        latest = session.scalar(
            select(PsdRow.synthesized_t)
            .where(PsdRow.channel_name == channel_name)
            .order_by(PsdRow.synthesized_t.desc())
            .limit(1)
        )
        if latest is None:
            return {"channel": channel_name, "metric": metric, "window": window, "points": [], "baseline": None}
        t_to = t_to or latest
        t_from = t_from or (latest - timedelta(hours=DEFAULT_LOOKBACK_HOURS))

    df = _load_rows(session, channel_name, t_from, t_to)
    if df.empty:
        return {"channel": channel_name, "metric": metric, "window": window, "points": [], "baseline": None}

    s = df[metric].astype(float)
    roll = s.rolling(offset, min_periods=1)
    mean = roll.mean()
    std = roll.std().fillna(0.0)

    points = [
        {
            "t": _epoch_ms(idx),
            "v": float(v),
            "mean": float(mean.loc[idx]),
            "std": float(std.loc[idx]),
        }
        for idx, v in s.items()
    ]

    baseline_mean = float(s.mean())
    baseline_std = float(s.std() or 0.0)

    return {
        "channel": channel_name,
        "metric": metric,
        "window": window,
        "points": points,
        "baseline": {"mean": baseline_mean, "std": baseline_std, "n": int(len(s))},
    }


# ---------------------------------------------------------------------------
# SPC — series with mean / 1σ / 2σ / 3σ control bands and excursion flags.
# ---------------------------------------------------------------------------


def spc_series(
    session: Session,
    channel_name: str,
    metric: str,
    window: str = "1h",
    t_from: datetime | None = None,
    t_to: datetime | None = None,
) -> dict[str, Any]:
    """Statistical Process Control: line + μ + UCL/LCL bands at 1σ/2σ/3σ.

    The baseline is a rolling window so the band tracks slow drift rather
    than treating the entire history as one population (which would either
    over-trigger or under-trigger as conditions change).
    """
    if metric not in {m for m, _ in METRIC_COLUMNS}:
        raise ValueError(f"unknown metric: {metric}")
    offset = WINDOW_TO_OFFSET.get(window, "1h")

    if t_from is None or t_to is None:
        latest = session.scalar(
            select(PsdRow.synthesized_t)
            .where(PsdRow.channel_name == channel_name)
            .order_by(PsdRow.synthesized_t.desc())
            .limit(1)
        )
        if latest is None:
            return {"channel": channel_name, "metric": metric, "window": window, "points": []}
        t_to = t_to or latest
        t_from = t_from or (latest - timedelta(hours=DEFAULT_LOOKBACK_HOURS))

    df = _load_rows(session, channel_name, t_from, t_to)
    if df.empty:
        return {"channel": channel_name, "metric": metric, "window": window, "points": []}

    s = df[metric].astype(float)
    roll = s.rolling(offset, min_periods=3)
    mean = roll.mean()
    std = roll.std()

    # For early points where the window hasn't filled, fall back to expanding stats
    # so the chart shows bands from the very first sample instead of blank.
    expand = s.expanding(min_periods=3)
    mean = mean.fillna(expand.mean())
    std = std.fillna(expand.std()).fillna(0.0)

    pts: list[dict[str, Any]] = []
    for idx, v in s.items():
        m = float(mean.loc[idx]) if not np.isnan(mean.loc[idx]) else float(v)
        sd = float(std.loc[idx]) if not np.isnan(std.loc[idx]) else 0.0
        z = (float(v) - m) / sd if sd > 0 else 0.0
        pts.append({
            "t": _epoch_ms(idx),
            "v": float(v),
            "mean": m,
            "ucl1": m + sd, "lcl1": m - sd,
            "ucl2": m + 2 * sd, "lcl2": m - 2 * sd,
            "ucl3": m + 3 * sd, "lcl3": m - 3 * sd,
            "z": z,
            "severity": _z_to_severity(z),
        })

    return {
        "channel": channel_name,
        "metric": metric,
        "window": window,
        "points": pts,
        "baseline_window": window,
    }


# ---------------------------------------------------------------------------
# PSD curve — averaged sieve curve (% passing vs aperture).
# ---------------------------------------------------------------------------


def psd_curve(
    session: Session,
    channel_name: str,
    t_from: datetime | None = None,
    t_to: datetime | None = None,
) -> dict[str, Any]:
    """Mean sieve passing curve + F-percentiles over a time window.

    The signature chart for a PSD product: y = % passing, x = sieve
    aperture (inches), log-x by convention.
    """
    df = _load_rows(session, channel_name, t_from, t_to)
    if df.empty:
        return {
            "channel": channel_name,
            "rows_aggregated": 0,
            "sieve_curve": [],
            "percentiles": {},
        }

    sieve_cols = [c for c, _ in SIEVE_COLUMNS]
    sieve_means = df[sieve_cols].mean()
    curve = [
        {"size_in": float(size), "passing_pct": float(sieve_means[col])}
        for col, size in SIEVE_COLUMNS
    ]

    pct_cols = ["f10", "f20", "f30", "f40", "f50", "f60", "f70", "f80", "f90"]
    percentiles = {p.upper(): float(df[p].mean()) for p in pct_cols if p in df.columns}

    return {
        "channel": channel_name,
        "rows_aggregated": int(len(df)),
        "from": _epoch_ms(df.index.min()),
        "to": _epoch_ms(df.index.max()),
        "sieve_curve": curve,
        "percentiles": percentiles,
    }


# ---------------------------------------------------------------------------
# Excursions — discrete out-of-band events across all metrics for a channel.
# ---------------------------------------------------------------------------


def excursions(
    session: Session,
    channel_name: str | None = None,
    t_from: datetime | None = None,
    t_to: datetime | None = None,
    threshold: float = SEV_WARN,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Find rows where ANY KPI metric is more than `threshold` σ from its rolling baseline.

    Consecutive excursions on the same metric/channel collapse into one
    event (we keep the worst offender in the run). This keeps the
    triage queue small and actionable.
    """
    channel_names: list[str]
    if channel_name is not None:
        channel_names = [channel_name]
    else:
        channel_names = [
            r[0] for r in session.execute(select(PsdRow.channel_name).distinct()).all()
        ]

    all_events: list[dict[str, Any]] = []
    for name in channel_names:
        df = _load_rows(session, name, t_from, t_to)
        if df.empty:
            continue
        for col in KPI_METRICS:
            if col not in df.columns:
                continue
            s = df[col].astype(float)
            # Use a rolling baseline so we don't trip on slow drift.
            roll = s.rolling("1h", min_periods=5)
            mean = roll.mean().fillna(s.expanding(min_periods=3).mean())
            std = roll.std().fillna(s.expanding(min_periods=3).std()).fillna(0.0)
            z = (s - mean) / std.where(std > 0, np.nan)
            z = z.fillna(0.0)
            mask = z.abs() >= threshold

            # Collapse consecutive True runs into events, keep the worst z.
            in_run = False
            run_best: dict[str, Any] | None = None
            for idx, hit in mask.items():
                if hit:
                    candidate = {
                        "t": _epoch_ms(idx),
                        "channel": name,
                        "metric": col,
                        "value": float(s.loc[idx]),
                        "baseline": float(mean.loc[idx]),
                        "std": float(std.loc[idx]),
                        "z": float(z.loc[idx]),
                        "severity": _z_to_severity(float(z.loc[idx])),
                    }
                    if not in_run or abs(candidate["z"]) > abs(run_best["z"]):
                        run_best = candidate
                    in_run = True
                else:
                    if in_run and run_best is not None:
                        all_events.append(run_best)
                    in_run = False
                    run_best = None
            if in_run and run_best is not None:
                all_events.append(run_best)

    all_events.sort(key=lambda e: (-abs(e["z"]), -e["t"]))
    return all_events[:limit]

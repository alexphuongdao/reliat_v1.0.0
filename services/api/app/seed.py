"""Seed — generate plausible 24h of measurements per channel through the real ETL.

Run via `python -m app.seed` or implicitly on app startup. Replaces nothing in
the ETL — the synthesized rows go through `ingest_rows` exactly the way a real
CSV would. When the real sample data lands, point this at `parse_csv()` instead.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from .db import init_db, session_scope
from .etl import PERCENTILE_KEYS, RawRow, ingest_csv, ingest_rows
from .models import Channel, Measurement, Outlier

# Channel registry — matches the design's CHANNELS list.
CHANNEL_REGISTRY = [
    ("cv42", "CV42 Tunnel",      "Primary",   "var(--ch-1)",  78.2,  142, True),
    ("cv18", "CV18 Mill Feed",   "Mill",      "var(--ch-4)",  64.8,  118, True),
    ("cv07", "CV07 Stockpile",   "Stockpile", "var(--ch-6)",  92.4,  164, True),
    ("cv33", "CV33 Crusher Out", "Crusher",   "var(--ch-3)",  84.1,  156, True),
    ("cv51", "CV51 Reclaim",     "Reclaim",   "var(--ch-2)",  71.6,  132, True),
    ("cv09", "CV09 ROM",         "ROM",       "var(--ch-5)",  116.4, 218, True),
    ("cv24", "CV24 Conveyor B",  "Transfer",  "var(--ch-7)",  68.2,  124, True),
    ("cv12", "CV12 Tertiary",    "Tertiary",  "var(--ch-8)",  52.8,   96, True),
    ("cv66", "CV66 Screening",   "Screen",    "var(--ch-10)", 38.4,   74, True),
    ("cv28", "CV28 SAG Feed",    "SAG",       "var(--ch-9)",  88.9,  168, False),
    ("cv03", "CV03 Pebble",      "Pebble",    "var(--ch-11)", 42.1,   82, True),
    ("cv77", "CV77 Fines",       "Fines",     "var(--ch-12)", 21.6,   42, True),
]

PSD_RATIOS = {
    "F10": 0.22, "F20": 0.32, "F30": 0.42, "F40": 0.52,
    "F50": 0.62, "F60": 0.72, "F70": 0.84, "F80": 1.00, "F90": 1.18,
}


def upsert_channels(session: Session) -> None:
    existing = {row.id for row in session.query(Channel).all()}
    for cid, name, belt, color, base_f80, base_top, online in CHANNEL_REGISTRY:
        if cid in existing:
            continue
        session.add(Channel(
            id=cid, name=name, belt=belt, color=color,
            base_f80=base_f80, base_topsize=base_top, online=online, shift="A",
        ))


def _synth_rows_for_channel(
    cid: str, base_f80: float, base_topsize: float, points: int = 1440, now: datetime | None = None
) -> list[RawRow]:
    """Generate `points` minute-resolution rows. Same structural shape as the
    designed mock data, but real PSD curves and a color drift event."""
    now = now or datetime.now(tz=timezone.utc)
    r = random.Random(sum(ord(ch) for ch in cid))

    n_outliers = r.randint(2, 6)
    outlier_idx = {r.randint(MIN_WARMUP_GUARD, points - 1) for _ in range(n_outliers)}
    drift = None
    if r.random() > 0.45:
        drift_start = r.randint(0, int(points * 0.7))
        drift = (drift_start, r.randint(60, 240))

    walk = 0.0
    rows: list[RawRow] = []
    for i in range(points):
        walk += (r.random() - 0.5) * 0.4
        walk *= 0.985
        diurnal = math.sin((i / points) * math.pi * 2) * (base_f80 * 0.04)
        f80 = base_f80 + walk + diurnal + (r.random() - 0.5) * (base_f80 * 0.012)

        # Injected outlier — magnitude calibrated so detector picks it up.
        if i in outlier_idx:
            sev_r = r.random()
            sign = 1 if r.random() > 0.5 else -1
            mag = (0.34 if sev_r < 0.18 else 0.18 if sev_r < 0.55 else 0.10) * base_f80
            f80 += sign * mag

        # PSD percentiles derived from F80 ratio.
        ratio = f80 / base_f80 if base_f80 else 1.0
        percentiles = {
            k: max(0.1, base_f80 * PSD_RATIOS[k] * ratio + (r.random() - 0.5) * 1.5)
            for k in PERCENTILE_KEYS
        }
        percentiles["F80"] = f80
        topsize = base_topsize * ratio + (r.random() - 0.5) * 2

        # Color drift band.
        hue = 24 + math.sin(i / 60) * 6 + (r.random() - 0.5) * 4
        sat = 24 + math.sin(i / 120) * 6 + (r.random() - 0.5) * 4
        light = 28 + math.sin(i / 180) * 4 + (r.random() - 0.5) * 3
        if drift is not None:
            d_start, d_len = drift
            if d_start <= i < d_start + d_len:
                t = (i - d_start) / d_len
                bell = math.sin(t * math.pi)
                hue_kick = {"cv42": -14, "cv33": 28}.get(cid, 18)
                light_kick = -6 if cid == "cv66" else 6
                hue += bell * hue_kick
                sat += bell * 18
                light += bell * light_kick

        rows.append(RawRow(
            channel_id=cid,
            t=now - timedelta(minutes=(points - i)),
            percentiles=percentiles,
            topsize=topsize,
            color_hue=hue,
            color_sat=sat,
            color_light=light,
        ))
    return rows


MIN_WARMUP_GUARD = 20  # don't drop outliers inside the detector warmup window


def seed_demo(session: Session, points_per_channel: int = 1440) -> dict[str, int]:
    upsert_channels(session)
    session.flush()
    all_rows: list[RawRow] = []
    for cid, _, _, _, base_f80, base_top, _ in CHANNEL_REGISTRY:
        all_rows.extend(_synth_rows_for_channel(cid, base_f80, base_top, points_per_channel))
    return ingest_rows(session, all_rows)


def is_seeded(session: Session) -> bool:
    return session.query(Measurement).first() is not None


def main() -> None:
    init_db()
    sample = Path(__file__).resolve().parent.parent / "sample_data.tsv"
    with session_scope() as s:
        if is_seeded(s):
            print("[seed] DB already seeded, skipping.")
            return
        if sample.exists():
            print(f"[seed] ingesting real sample: {sample}")
            upsert_channels(s)
            s.flush()
            counts = ingest_csv(s, sample)
            print(f"[seed] real sample: {counts}")
        counts = seed_demo(s)
        n_out = s.query(Outlier).count()
        print(f"[seed] synthesized 24h x {len(CHANNEL_REGISTRY)} channels: {counts}; outliers in DB={n_out}")


if __name__ == "__main__":
    main()

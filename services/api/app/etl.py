"""ETL — turn raw measurement rows into stored Measurements + detected Outliers.

A row is the platform's atomic unit:
    channel_id, t, F10..F90, topsize, sieves[], color (HSL).

`ingest_rows()` is the SINGLE entry point: production CSV loaders, the seeder,
and ad-hoc test fixtures all go through it.
"""
from __future__ import annotations

import csv
import json
import math
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from .detector import detect_outliers
from .models import Channel, Measurement, Outlier

PERCENTILE_KEYS = ("F10", "F20", "F30", "F40", "F50", "F60", "F70", "F80", "F90")
SIEVE_SIZES_MM = (1.0, 2.5, 4.0, 6.3, 9.5, 12.5, 19.0, 25.0, 31.5, 45.0, 63.0, 80.0, 100.0, 125.0, 160.0)


@dataclass
class RawRow:
    channel_id: str
    t: datetime
    percentiles: dict[str, float]
    topsize: float
    sieves: dict[float, float] = field(default_factory=dict)
    color_hue: float = 24.0
    color_sat: float = 24.0
    color_light: float = 28.0

    @property
    def color_hsl(self) -> str:
        return f"hsl({self.color_hue:.1f} {self.color_sat:.1f}% {self.color_light:.1f}%)"

    def to_psd(self) -> dict:
        return {
            "percentiles": {k: round(self.percentiles[k], 4) for k in PERCENTILE_KEYS},
            "sieves": [
                {"size": sz, "passing": round(self.sieves.get(sz, _interp_passing(sz, self.percentiles["F80"])), 3)}
                for sz in SIEVE_SIZES_MM
            ],
        }


def _interp_passing(sieve_mm: float, f80: float) -> float:
    """Logistic passing curve when a real sieve column is absent."""
    if f80 <= 0:
        return 0.0
    center = f80 * 0.55
    width = max(center * 0.32, 1e-3)
    return float(100.0 / (1.0 + math.exp(-(sieve_mm - center) / width)))


def parse_csv(path: Path) -> Iterator[RawRow]:
    """Parse a CSV/TSV with the documented schema.

    Required columns: channel_id, ts, F10..F90, topsize, color_hue, color_sat, color_light.
    Optional: sieve_{size}_passing for each canonical sieve.
    """
    delim = "\t" if path.suffix.lower() in (".tsv", ".tab") else ","
    with path.open() as fh:
        reader = csv.DictReader(fh, delimiter=delim)
        for raw in reader:
            yield RawRow(
                channel_id=raw["channel_id"],
                t=_parse_ts(raw["ts"]),
                percentiles={k: float(raw[k]) for k in PERCENTILE_KEYS},
                topsize=float(raw["topsize"]),
                sieves={sz: float(raw[f"sieve_{sz}_passing"]) for sz in SIEVE_SIZES_MM if f"sieve_{sz}_passing" in raw},
                color_hue=float(raw.get("color_hue", 24.0)),
                color_sat=float(raw.get("color_sat", 24.0)),
                color_light=float(raw.get("color_light", 28.0)),
            )


def _parse_ts(raw: str) -> datetime:
    raw = raw.strip()
    if raw.isdigit():
        ms = int(raw)
        return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    # ISO 8601, e.g. "2026-05-21T02:47:14Z"
    return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc)


def ingest_rows(session: Session, rows: Iterable[RawRow]) -> dict[str, int]:
    """Persist rows as Measurements; run the detector; persist Outliers.

    Channels are auto-upserted on first sight (so a freshly-seeded DB works);
    in production this should be driven from an asset registry.
    """
    counts = {"measurements": 0, "outliers": 0}
    by_channel: dict[str, list[Measurement]] = {}

    channels_seen: dict[str, Channel] = {
        c.id: c for c in session.query(Channel).all()
    }

    for row in rows:
        ch = channels_seen.get(row.channel_id)
        if ch is None:
            # Fallback registration — production sets these via a real config.
            ch = Channel(
                id=row.channel_id,
                name=row.channel_id.upper(),
                belt="Unknown",
                color="var(--ch-1)",
                base_f80=row.percentiles["F80"],
                base_topsize=row.topsize,
                online=True,
                shift="A",
            )
            session.add(ch)
            channels_seen[row.channel_id] = ch

        m = Measurement(
            channel_id=row.channel_id,
            t=row.t,
            f80=row.percentiles["F80"],
            topsize=row.topsize,
            psd=row.to_psd(),
            color_hsl=row.color_hsl,
            color_hue=row.color_hue,
            color_sat=row.color_sat,
            color_light=row.color_light,
        )
        session.add(m)
        by_channel.setdefault(row.channel_id, []).append(m)
        counts["measurements"] += 1

    session.flush()  # gives measurements IDs

    # Detector runs per-channel on the freshly-ingested window.
    for ch_id, ms in by_channel.items():
        ch = channels_seen[ch_id]
        for ev in detect_outliers(ch, ms):
            session.add(ev)
            counts["outliers"] += 1

    return counts


def ingest_csv(session: Session, path: Path) -> dict[str, int]:
    return ingest_rows(session, parse_csv(path))


def dump_measurements_jsonl(session: Session, path: Path) -> int:
    """Diagnostic — write all measurements as JSONL. Not used by the API."""
    n = 0
    with path.open("w") as fh:
        for m in session.query(Measurement).order_by(Measurement.channel_id, Measurement.t):
            fh.write(json.dumps({
                "channel_id": m.channel_id,
                "t": m.t.isoformat(),
                "f80": m.f80,
                "topsize": m.topsize,
                "color": m.color_hsl,
            }) + "\n")
            n += 1
    return n

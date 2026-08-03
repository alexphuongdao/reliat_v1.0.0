"""One-off loader for real vendor exports in MINITAB `.xls` format.

Run via `python -m app.ingest_minitab <path-to-xls> [--channel-id cv42]`.
Requires the `xls` extra (`pip install ".[xls]"`).

Column contract (matches `docs/v1.0.0-plan.md` §11 appendix exactly):
    ChannelName, IterationTime (Excel serial), ChannelIterationCount,
    Topsize, F90..F10, 17 sieve-passing % columns (inches, e.g. "6_000in"),
    SDRatio10_5, 3 raw video RGB averages, AverageHue/Saturation/Lightness.
"""
from __future__ import annotations

import argparse
import statistics
from datetime import datetime, timezone
from pathlib import Path

from .db import init_db, session_scope
from .etl import PERCENTILE_KEYS, RawRow, ingest_rows
from .models import Channel
from .seed import CHANNEL_REGISTRY, upsert_channels
from .tenancy import ensure_default_tenant

SIEVE_COLUMNS = (
    "6_000in", "5_000in", "4_000in", "3_500in", "3_000in", "2_500in",
    "2_000in", "1_750in", "1_500in", "1_250in", "1_000in", "0_750in",
    "0_500in", "0_250in", "0_187in", "0_0937in", "0_0165in",
)

# ChannelName (as it appears in the export) -> our channel_id (registry key).
NAME_TO_CHANNEL_ID = {name: cid for cid, name, *_ in CHANNEL_REGISTRY}


def _read_rows(path: Path) -> tuple[list[RawRow], dict[str, list[float]]]:
    import xlrd

    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    header = sh.row_values(0)
    col = {name: i for i, name in enumerate(header)}

    rows: list[RawRow] = []
    stats: dict[str, list[float]] = {}  # channel_id -> [f80, ...] for baseline calc
    topsize_stats: dict[str, list[float]] = {}

    for r in range(1, sh.nrows):
        vals = sh.row_values(r)
        name = str(vals[col["ChannelName"]]).strip()
        channel_id = NAME_TO_CHANNEL_ID.get(name, name.lower().replace(" ", "_"))

        t = xlrd.xldate.xldate_as_datetime(vals[col["IterationTime"]], wb.datemode)
        t = t.replace(tzinfo=timezone.utc)

        percentiles = {k: float(vals[col[k]]) for k in PERCENTILE_KEYS}
        topsize = float(vals[col["Topsize"]])
        sieve_raw = {c: float(vals[col[c]]) for c in SIEVE_COLUMNS if c in col}

        row = RawRow(
            channel_id=channel_id,
            t=t,
            percentiles=percentiles,
            topsize=topsize,
            color_hue=float(vals[col["AverageHue"]]),
            color_sat=float(vals[col["AverageSaturation"]]),
            color_light=float(vals[col["AverageLightness"]]),
            source="cemex_minitab",
            iteration_count=int(vals[col["ChannelIterationCount"]]),
            sd_ratio_10_5=float(vals[col["SDRatio10_5"]]) if "SDRatio10_5" in col else None,
            video_r=float(vals[col["Videoaverageredintensity"]]) if "Videoaverageredintensity" in col else None,
            video_g=float(vals[col["Videoaveragegreenintensity"]]) if "Videoaveragegreenintensity" in col else None,
            video_b=float(vals[col["Videoaverageblueintensity"]]) if "Videoaverageblueintensity" in col else None,
            sieve_passing_raw=sieve_raw or None,
        )
        rows.append(row)
        stats.setdefault(channel_id, []).append(percentiles["F80"])
        topsize_stats.setdefault(channel_id, []).append(topsize)

    rows.sort(key=lambda r: r.t)
    return rows, {"f80": stats, "topsize": topsize_stats}  # type: ignore[dict-item]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path", type=Path, help="Path to the .xls export")
    args = ap.parse_args()

    init_db()
    print(f"[ingest_minitab] reading {args.path} …")
    rows, stat_lists = _read_rows(args.path)
    f80_by_channel: dict[str, list[float]] = stat_lists["f80"]  # type: ignore[assignment]
    topsize_by_channel: dict[str, list[float]] = stat_lists["topsize"]  # type: ignore[assignment]
    print(f"[ingest_minitab] parsed {len(rows)} rows across {len(f80_by_channel)} channel(s)")

    with session_scope() as s:
        upsert_channels(s)
        s.flush()
        # Calibrate each real channel's baseline to its own data — the
        # detector's sigma floor is a fraction of `base_f80`, and the
        # curated registry defaults are tuned for synthetic demo data on a
        # completely different scale than real instrument readings.
        for cid, f80s in f80_by_channel.items():
            ch = s.query(Channel).filter(Channel.id == cid).first()
            mean_f80 = statistics.mean(f80s)
            mean_topsize = statistics.mean(topsize_by_channel[cid])
            if ch is None:
                ch = Channel(
                    id=cid, tenant_id=ensure_default_tenant(s).id,
                    name=cid.upper(), belt="Unknown", color="var(--ch-1)",
                    base_f80=mean_f80, base_topsize=mean_topsize, online=True, shift="A",
                )
                s.add(ch)
            else:
                ch.base_f80 = mean_f80
                ch.base_topsize = mean_topsize
            print(f"[ingest_minitab] {cid}: base_f80={mean_f80:.3f} base_topsize={mean_topsize:.3f} "
                  f"n={len(f80s)}")
        s.flush()

        counts = ingest_rows(s, rows)
        print(f"[ingest_minitab] ingested: {counts}")


if __name__ == "__main__":
    main()

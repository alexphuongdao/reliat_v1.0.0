"""Parse and clean analyzer CSV exports.

The analyzer exports come in two locales we've seen so far:
  - tab-separated, dot-decimal (US sample)
  - tab-separated, comma-decimal (EU sample)

We sniff the delimiter and decimal style from the file header + first data
row, log what we detected on the IngestBatch, then parse with pandas. Row
validation is conservative — anything that fails goes into a per-row error
report rather than the database. Rows are uniquely keyed on
(channel_name, iteration_count) so re-uploading the same file is idempotent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from io import StringIO
from typing import Iterable

import pandas as pd

# Canonical Python-safe column names, in the order the CSV header emits them.
CANONICAL_COLUMNS: tuple[str, ...] = (
    "channel_name", "iteration_date_raw", "iteration_count",
    "topsize", "f90", "f80", "f70", "f60", "f50", "f40", "f30", "f20", "f10",
    "sieve_6000", "sieve_5000", "sieve_4000", "sieve_3500", "sieve_3000",
    "sieve_2500", "sieve_2000", "sieve_1750", "sieve_1500", "sieve_1250",
    "sieve_1000", "sieve_0750", "sieve_0500", "sieve_0250", "sieve_0187",
    "sieve_00937", "sieve_00165",
    "sd_ratio_10_5",
    "video_red", "video_green", "video_blue",
    "avg_hue", "avg_saturation", "avg_lightness",
)

# Map from header strings the customer emits → our canonical names. We
# accept both decimal styles for sieve apertures ("0_500in" and "0.500in").
HEADER_ALIASES: dict[str, str] = {
    "ChannelName": "channel_name",
    "IterationTime": "iteration_date_raw",
    "ChannelIterationCount": "iteration_count",
    "Topsize": "topsize",
    "F90": "f90", "F80": "f80", "F70": "f70", "F60": "f60", "F50": "f50",
    "F40": "f40", "F30": "f30", "F20": "f20", "F10": "f10",
    "6_000in": "sieve_6000", "5_000in": "sieve_5000", "4_000in": "sieve_4000",
    "3_500in": "sieve_3500", "3_000in": "sieve_3000", "2_500in": "sieve_2500",
    "2_000in": "sieve_2000", "1_750in": "sieve_1750", "1_500in": "sieve_1500",
    "1_250in": "sieve_1250", "1_000in": "sieve_1000", "0_750in": "sieve_0750",
    "0_500in": "sieve_0500", "0_250in": "sieve_0250", "0_187in": "sieve_0187",
    "0_0937in": "sieve_00937", "0_0165in": "sieve_00165",
    "SDRatio10_5": "sd_ratio_10_5",
    "Videoaverageredintensity": "video_red",
    "Videoaveragegreenintensity": "video_green",
    "Videoaverageblueintensity": "video_blue",
    "AverageHue": "avg_hue",
    "AverageSaturation": "avg_saturation",
    "AverageLightness": "avg_lightness",
}


@dataclass
class ParseError:
    row_number: int          # 1-based, as a human counts in the source file
    reason: str


@dataclass
class ParseResult:
    rows: list[dict]                                # cleaned, typed rows ready for insert
    errors: list[ParseError] = field(default_factory=list)
    detected_delimiter: str = "\t"
    detected_decimal: str = "."
    detected_date_format: str | None = None         # "M/D/YYYY" or "D/M/YYYY"

    @property
    def rows_ingested(self) -> int:
        return len(self.rows)

    @property
    def rows_skipped(self) -> int:
        return len(self.errors)


def _sniff(text: str) -> tuple[str, str]:
    """Return (delimiter, decimal) by peeking at the first two lines."""
    head = text.splitlines()[:2]
    if len(head) < 2:
        # Default to tab+dot; downstream parse will surface a real error.
        return "\t", "."
    header, first = head[0], head[1]
    delim = "\t" if "\t" in header else ","
    # Comma-as-decimal only makes sense if the delimiter isn't comma. When the
    # delimiter is a tab, ',' in numeric fields must be the decimal separator.
    decimal = "," if delim == "\t" and "," in first and "." not in first else "."
    return delim, decimal


def _detect_date_format(samples: Iterable[str]) -> str:
    """Pick M/D/YYYY vs D/M/YYYY based on which interpretation has any value > 12 in the first slot.

    If every sample's first number is ≤ 12 we can't disambiguate; default to
    M/D/YYYY (US site convention) and rely on customer confirmation.
    """
    for s in samples:
        parts = s.strip().split("/")
        if len(parts) != 3:
            continue
        try:
            first = int(parts[0])
        except ValueError:
            continue
        if first > 12:
            return "D/M/YYYY"
    return "M/D/YYYY"


def _parse_date(raw: str, fmt: str) -> date:
    # Accept 2-digit OR 4-digit year. pandas' to_datetime is more lenient
    # than strptime but we still want a fixed interpretation per file.
    raw = raw.strip()
    for year_fmt in ("%Y", "%y"):
        try:
            if fmt == "M/D/YYYY":
                return datetime.strptime(raw, f"%m/%d/{year_fmt}").date()
            return datetime.strptime(raw, f"%d/%m/{year_fmt}").date()
        except ValueError:
            continue
    raise ValueError(f"unrecognized date: {raw!r}")


def _validate_row(d: dict) -> str | None:
    """Return a reason-string if the row is bad, else None.

    Cheap sanity checks only — anything that would corrupt analytics. We do
    NOT enforce business rules here (those belong in the analytics layer).
    """
    if not d.get("channel_name"):
        return "missing channel_name"
    if d.get("iteration_count") is None:
        return "missing iteration_count"
    # Sieve passing % must be in [0, 100]; allow tiny rounding overshoot.
    for col in d:
        if col.startswith("sieve_"):
            v = d[col]
            if v is None or v < -0.01 or v > 100.01:
                return f"{col} out of [0,100]: {v}"
    # RGB intensities are 0–255.
    for col in ("video_red", "video_green", "video_blue"):
        v = d.get(col)
        if v is None or v < 0 or v > 255:
            return f"{col} out of [0,255]: {v}"
    return None


def parse_csv(raw_bytes: bytes) -> ParseResult:
    """Parse an analyzer CSV/TSV upload into clean PsdRow-ready dicts.

    The returned rows have:
      - channel_name, iteration_date (date), iteration_count (int)
      - all metric columns typed as float
    `synthesized_t` is NOT computed here; it depends on per-channel cadence
    config and is filled in at the insert layer.
    """
    text = raw_bytes.decode("utf-8-sig", errors="replace")
    delim, decimal = _sniff(text)

    df = pd.read_csv(
        StringIO(text),
        sep=delim,
        decimal=decimal,
        dtype={"ChannelName": str, "IterationTime": str},
        keep_default_na=False,
        na_values=["", "NA", "NaN", "nan"],
    )

    # Strip whitespace from headers (some exports add a trailing space).
    df.columns = [c.strip() for c in df.columns]

    # Rename to canonical, drop any columns we don't recognize.
    rename = {src: dst for src, dst in HEADER_ALIASES.items() if src in df.columns}
    df = df.rename(columns=rename)
    missing = [c for c in CANONICAL_COLUMNS if c not in df.columns]
    if missing:
        return ParseResult(
            rows=[],
            errors=[ParseError(0, f"missing required columns: {missing}")],
            detected_delimiter=delim,
            detected_decimal=decimal,
        )
    df = df[list(CANONICAL_COLUMNS)]

    date_fmt = _detect_date_format(df["iteration_date_raw"].dropna().head(50).tolist())

    out: list[dict] = []
    errors: list[ParseError] = []
    for i, raw in enumerate(df.to_dict(orient="records"), start=2):  # row 1 is header
        try:
            d = {k: raw[k] for k in CANONICAL_COLUMNS}
            d["iteration_date"] = _parse_date(d.pop("iteration_date_raw"), date_fmt)
            d["iteration_count"] = int(d["iteration_count"])
            d["channel_name"] = str(d["channel_name"]).strip()
            for k in list(d.keys()):
                if k in ("channel_name", "iteration_date", "iteration_count"):
                    continue
                # pandas hands us NaN for blanks even with na_values set; coerce.
                v = d[k]
                d[k] = None if pd.isna(v) else float(v)
            reason = _validate_row(d)
            if reason:
                errors.append(ParseError(i, reason))
                continue
            out.append(d)
        except (ValueError, TypeError, KeyError) as e:
            errors.append(ParseError(i, str(e)))

    return ParseResult(
        rows=out,
        errors=errors,
        detected_delimiter=delim,
        detected_decimal=decimal,
        detected_date_format=date_fmt,
    )


def synthesize_timestamp(
    iteration_date: date,
    iteration_count: int,
    first_count_of_day: int,
    iterations_per_minute: float,
) -> datetime:
    """Convert (date, count) → wall-clock datetime using channel cadence.

    We anchor count 0 at midnight of `iteration_date` and step forward at
    `1 / iterations_per_minute` minutes per iteration. `first_count_of_day`
    is the smallest count we've seen for this channel on this date — it
    becomes the zero for that day so the time axis starts at 00:00.
    """
    rate = max(iterations_per_minute, 0.001)
    minutes = (iteration_count - first_count_of_day) / rate
    return datetime.combine(iteration_date, time.min) + timedelta(minutes=minutes)

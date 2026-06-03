"""Parser tests against real analyzer exports.

Fixtures live alongside this test file and are pulled directly from a
customer-provided CSV so the parser exercises real shapes — not synthetic.
"""
from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

from app.ingest.csv_parser import parse_csv, synthesize_timestamp

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_parse_us_locale_dot_decimal() -> None:
    result = parse_csv(_load("cv42_sample.tsv"))

    assert result.detected_delimiter == "\t"
    assert result.detected_decimal == "."
    assert result.detected_date_format == "M/D/YYYY"
    assert result.rows_skipped == 0
    assert result.rows_ingested == 5

    first = result.rows[0]
    assert first["channel_name"] == "CV42 Tunnel"
    assert first["iteration_date"] == date(2026, 5, 3)
    assert first["iteration_count"] == 32983
    assert first["topsize"] == 6.971983
    assert first["sieve_6000"] == 86.615852
    assert first["video_red"] == 142.0


def test_parse_eu_locale_comma_decimal() -> None:
    result = parse_csv(_load("cv42_sample_eu.tsv"))

    assert result.detected_delimiter == "\t"
    assert result.detected_decimal == ","
    assert result.rows_skipped == 0
    assert result.rows_ingested == 2

    first = result.rows[0]
    assert first["channel_name"] == "CV42 Tunnel"
    assert first["topsize"] == 6.971983
    assert first["sieve_6000"] == 86.615852


def test_synthesize_timestamp_anchors_at_first_count() -> None:
    # At 1 iter/min, count N is N - first_count minutes past midnight.
    t = synthesize_timestamp(
        iteration_date=date(2026, 5, 3),
        iteration_count=32990,
        first_count_of_day=32983,
        iterations_per_minute=1.0,
    )
    assert t == datetime(2026, 5, 3, 0, 7, 0)


def test_synthesize_timestamp_respects_rate() -> None:
    # At 6 iter/min (one row per 10s), 60 iters = 10 minutes.
    t = synthesize_timestamp(
        iteration_date=date(2026, 5, 3),
        iteration_count=60,
        first_count_of_day=0,
        iterations_per_minute=6.0,
    )
    assert t == datetime(2026, 5, 3, 0, 10, 0)


def test_rejects_missing_required_columns() -> None:
    bad = b"foo\tbar\n1\t2\n"
    result = parse_csv(bad)
    assert result.rows_ingested == 0
    assert result.errors and "missing required columns" in result.errors[0].reason

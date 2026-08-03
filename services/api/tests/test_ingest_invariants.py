"""Invariants the ingest path must hold before it is pointed at customer data.

Three of these fail today. They are marked `xfail(strict=True)` rather than
deleted or commented out, which means:

  - the suite stays green, so a red run still means "you broke something";
  - the defect is documented as executable code, not as a TODO;
  - when the fix lands, the test PASSES, `strict=True` turns that into a
    failure, and whoever fixed it is forced to remove the marker.

An xfail marker here is a debt record with a tripwire on it. See
docs/DataArchitecture.md §1 for the probe these were derived from, and §8 for
which build slice retires each one.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.etl import PERCENTILE_KEYS, RawRow, ingest_rows
from app.models import Base, Measurement, Tenant
from app.tenancy import DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME, DEFAULT_TENANT_SLUG

CHANNEL = "cv-invariant"


@pytest.fixture()
def session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    s = Session(engine)
    s.add(Tenant(
        id=DEFAULT_TENANT_ID, slug=DEFAULT_TENANT_SLUG, name=DEFAULT_TENANT_NAME,
        active=True, created_at=datetime(2026, 1, 1),
    ))
    s.commit()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


def rows(n: int = 40, *, f80_override: float | None = None) -> list[RawRow]:
    """A deterministic batch. Same arguments always produce the same readings."""
    out = []
    for i in range(n):
        percentiles = {key: float(rank + 1) for rank, key in enumerate(PERCENTILE_KEYS)}
        if f80_override is not None:
            percentiles["F80"] = f80_override
        out.append(RawRow(
            channel_id=CHANNEL,
            t=datetime(2026, 5, 1, 0, i, tzinfo=timezone.utc),
            percentiles=percentiles,
            topsize=12.0,
        ))
    return out


@pytest.mark.xfail(
    strict=True,
    reason="No file-hash check and no UNIQUE(channel_id, t). "
           "Retired by DataArchitecture.md §8 slice 1.",
)
def test_ingesting_the_same_readings_twice_does_not_duplicate(session: Session) -> None:
    """Historians re-export overlapping windows. That is the normal delivery
    pattern, not an edge case — and duplicated rows corrupt every baseline,
    z-score and count the agent later reports."""
    ingest_rows(session, rows())
    session.commit()
    after_first = session.query(Measurement).count()

    ingest_rows(session, rows())  # byte-identical readings
    session.commit()

    assert session.query(Measurement).count() == after_first


@pytest.mark.xfail(
    strict=True,
    reason="No domain invariants in the canonicalizer. "
           "Retired by DataArchitecture.md §8 slice 3.",
)
def test_percentiles_must_be_monotonic(session: Session) -> None:
    """F10..F90 are percentiles of one particle-size distribution, so they are
    non-decreasing by definition. A row where F80 sits below F10 is physically
    impossible and is the signature of a mis-mapped column — the single most
    likely error when onboarding a new customer's file."""
    impossible = rows(n=20, f80_override=0.1)  # F10 is 1.0
    ingest_rows(session, impossible)
    session.commit()

    assert session.query(Measurement).filter(Measurement.f80 == 0.1).count() == 0


@pytest.mark.xfail(
    strict=True,
    reason="Columns are DateTime, not DateTime(timezone=True). "
           "Retired by DataArchitecture.md §8 slice 2.",
)
def test_timestamps_round_trip_as_utc(session: Session) -> None:
    """Readings go in timezone-aware UTC and come back naive, so the offset is
    inferred by convention from here on. Every headline query is time-bounded
    ('last 3 hours', 'yesterday's night shift') and shifts are plant-local."""
    ingest_rows(session, rows(n=13))
    session.commit()

    stored = session.query(Measurement).order_by(Measurement.t).first()
    assert stored is not None
    assert stored.t.tzinfo is not None
    assert stored.t == datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)


def test_ingest_stamps_a_tenant_on_auto_registered_channels(session: Session) -> None:
    """This one passes, and is here to stay passing: a channel invented by the
    ETL fallback path must still land inside a tenant. An untenanted channel
    would be invisible to every scoped query and visible to none — or, worse,
    to all of them."""
    ingest_rows(session, rows(n=13))
    session.commit()

    measurement = session.query(Measurement).first()
    assert measurement is not None
    assert measurement.channel.tenant_id == DEFAULT_TENANT_ID

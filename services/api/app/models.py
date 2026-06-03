from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """A person who can sign in — via password or a linked OAuth provider.

    Password and OAuth users share one row, keyed by email. `password_hash`
    is null for OAuth-only accounts; `provider`/`provider_sub` are null for
    password-only accounts. A user who later signs in with Google using the
    same email is matched on email and the provider fields are filled in.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    username: Mapped[str] = mapped_column(String(64), nullable=False)

    # null for OAuth-only accounts
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # null for password-only accounts; identifies the external identity
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)  # google|github
    provider_sub: Mapped[str | None] = mapped_column(String(255), nullable=True)

    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)

    __table_args__ = (
        UniqueConstraint("provider", "provider_sub", name="uq_users_provider_identity"),
    )


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    belt: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(64), nullable=False)
    base_f80: Mapped[float] = mapped_column(Float, nullable=False)
    base_topsize: Mapped[float] = mapped_column(Float, nullable=False)
    online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    shift: Mapped[str] = mapped_column(String(8), nullable=False, default="A")

    measurements: Mapped[list[Measurement]] = relationship(
        back_populates="channel", cascade="all, delete-orphan", passive_deletes=True
    )
    outliers: Mapped[list[Outlier]] = relationship(
        back_populates="channel", cascade="all, delete-orphan", passive_deletes=True
    )


class Measurement(Base):
    """One PSD + color sample for a channel at a moment in time."""

    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[str] = mapped_column(
        ForeignKey("channels.id", ondelete="CASCADE"), nullable=False
    )
    t: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    f80: Mapped[float] = mapped_column(Float, nullable=False)
    topsize: Mapped[float] = mapped_column(Float, nullable=False)
    # Full PSD percentiles (F10..F90) + sieve passing array stored as JSON for v1.
    # When this dataset grows past a few million rows, migrate to Timescale
    # hypertable with normalized child tables.
    psd: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    color_hsl: Mapped[str] = mapped_column(String(40), nullable=False)
    color_hue: Mapped[float] = mapped_column(Float, nullable=False)
    color_sat: Mapped[float] = mapped_column(Float, nullable=False)
    color_light: Mapped[float] = mapped_column(Float, nullable=False)

    channel: Mapped[Channel] = relationship(back_populates="measurements")

    __table_args__ = (
        Index("ix_measurements_channel_t", "channel_id", "t"),
    )


class Outlier(Base):
    __tablename__ = "outliers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    channel_id: Mapped[str] = mapped_column(
        ForeignKey("channels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    t: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    metric: Mapped[str] = mapped_column(String(32), nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False, default="mm")
    value: Mapped[float] = mapped_column(Float, nullable=False)
    baseline: Mapped[float] = mapped_column(Float, nullable=False)
    deviation: Mapped[float] = mapped_column(Float, nullable=False)  # sigma
    sev: Mapped[str] = mapped_column(String(16), nullable=False)  # critical|warn|info
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    assignee: Mapped[str | None] = mapped_column(String(64), nullable=True)
    summary: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    action: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    measurement_id: Mapped[int | None] = mapped_column(
        ForeignKey("measurements.id", ondelete="SET NULL"), nullable=True
    )

    channel: Mapped[Channel] = relationship(back_populates="outliers")


# ---------------------------------------------------------------------------
# Real customer data pipeline (E.1+). These tables hold ingested PSD/color
# data from the analyzer CSV exports, separate from the mock `Channel` /
# `Measurement` substrate above. The old tables stay until the new pipeline
# fully replaces the mock-serving routes.
# ---------------------------------------------------------------------------


class ChannelConfig(Base):
    """Per-channel config that's needed to interpret raw rows.

    The CSV gives us `ChannelIterationCount` (a monotonic counter) and
    `IterationTime` (date only — no hour/minute/second). To produce a real
    timestamp for rolling-window analytics we need to know how often the
    analyzer fires for this channel; that lives here.
    """

    __tablename__ = "channel_configs"

    channel_name: Mapped[str] = mapped_column(String(128), primary_key=True)

    # Analyzer rate in iterations per minute. Customer-confirmed where possible;
    # default of 1.0 (one row per minute) is a safe starting guess.
    iterations_per_minute: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    # Optional display metadata so the UI can show something human-friendly.
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    belt: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow, onupdate=_utcnow
    )


class IngestBatch(Base):
    """One CSV upload. Tracks who, what, when, and how it went."""

    __tablename__ = "ingest_batches"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    uploaded_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)

    rows_ingested: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_duplicate: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Locale + format we detected during parse, surfaced so a human can sanity-check.
    detected_decimal: Mapped[str] = mapped_column(String(8), nullable=False, default=".")
    detected_delimiter: Mapped[str] = mapped_column(String(8), nullable=False, default="\t")
    detected_date_format: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Per-row issues, kept small: {"row_number": "reason", ...} capped at ~50 entries.
    error_report: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


class PsdRow(Base):
    """One analyzer iteration: PSD percentiles + sieve passing + color, for one channel.

    Schema mirrors the customer's CSV columns 1:1, with normalized Python-safe
    names. Sieve columns are stored as numeric `sieve_<aperture>` fields rather
    than JSON so analytics queries can use SQL aggregation and pandas can pull
    them straight into a DataFrame.
    """

    __tablename__ = "psd_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    channel_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    iteration_date: Mapped[date] = mapped_column(Date, nullable=False)
    iteration_count: Mapped[int] = mapped_column(Integer, nullable=False)

    # Wall-clock time synthesized from iteration_date + iteration_count and the
    # channel's configured iterations_per_minute. Indexed because every
    # analytics query is time-bounded.
    synthesized_t: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    # --- particle-size descriptors ---
    topsize: Mapped[float] = mapped_column(Float, nullable=False)
    f90: Mapped[float] = mapped_column(Float, nullable=False)
    f80: Mapped[float] = mapped_column(Float, nullable=False)
    f70: Mapped[float] = mapped_column(Float, nullable=False)
    f60: Mapped[float] = mapped_column(Float, nullable=False)
    f50: Mapped[float] = mapped_column(Float, nullable=False)
    f40: Mapped[float] = mapped_column(Float, nullable=False)
    f30: Mapped[float] = mapped_column(Float, nullable=False)
    f20: Mapped[float] = mapped_column(Float, nullable=False)
    f10: Mapped[float] = mapped_column(Float, nullable=False)

    # --- sieve passing % at each aperture (inches) ---
    sieve_6000: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_5000: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_4000: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_3500: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_3000: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_2500: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_2000: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_1750: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_1500: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_1250: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_1000: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_0750: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_0500: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_0250: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_0187: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_00937: Mapped[float] = mapped_column(Float, nullable=False)
    sieve_00165: Mapped[float] = mapped_column(Float, nullable=False)

    # --- shape + color ---
    sd_ratio_10_5: Mapped[float] = mapped_column(Float, nullable=False)
    video_red: Mapped[float] = mapped_column(Float, nullable=False)
    video_green: Mapped[float] = mapped_column(Float, nullable=False)
    video_blue: Mapped[float] = mapped_column(Float, nullable=False)
    avg_hue: Mapped[float] = mapped_column(Float, nullable=False)
    avg_saturation: Mapped[float] = mapped_column(Float, nullable=False)
    avg_lightness: Mapped[float] = mapped_column(Float, nullable=False)

    ingest_batch_id: Mapped[str] = mapped_column(
        ForeignKey("ingest_batches.id", ondelete="CASCADE"), nullable=False, index=True
    )

    __table_args__ = (
        UniqueConstraint("channel_name", "iteration_count", name="uq_psd_channel_count"),
        Index("ix_psd_channel_t", "channel_name", "synthesized_t"),
    )


# Canonical sieve column order (largest aperture → smallest), for the PSD
# curve endpoint and any chart that walks the sieve series.
SIEVE_COLUMNS: tuple[tuple[str, float], ...] = (
    ("sieve_6000", 6.000),
    ("sieve_5000", 5.000),
    ("sieve_4000", 4.000),
    ("sieve_3500", 3.500),
    ("sieve_3000", 3.000),
    ("sieve_2500", 2.500),
    ("sieve_2000", 2.000),
    ("sieve_1750", 1.750),
    ("sieve_1500", 1.500),
    ("sieve_1250", 1.250),
    ("sieve_1000", 1.000),
    ("sieve_0750", 0.750),
    ("sieve_0500", 0.500),
    ("sieve_0250", 0.250),
    ("sieve_0187", 0.187),
    ("sieve_00937", 0.0937),
    ("sieve_00165", 0.0165),
)

class ExcursionTriage(Base):
    """Persistent triage state for a computed excursion.

    Excursions are derived from PsdRow on the fly (no rows of their own),
    so the ack / resolve / assign workflow can't key off a natural row id.
    We hash (channel, t, metric) to a 16-char id that's stable across
    re-detections, and store triage state here. A row exists only once
    a user has interacted with the excursion — the absence of a row
    means status = "open".
    """

    __tablename__ = "excursion_triage"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    channel_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    t: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    metric: Mapped[str] = mapped_column(String(64), nullable=False)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    assignee: Mapped[str | None] = mapped_column(String(128), nullable=True)
    summary: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    action: Mapped[str | None] = mapped_column(String(512), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow, onupdate=_utcnow
    )
    updated_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


# Metrics the UI can chart / alert on. The first element is the DB column,
# the second is a human label.
METRIC_COLUMNS: tuple[tuple[str, str], ...] = (
    ("topsize", "Topsize"),
    ("f90", "F90"), ("f80", "F80"), ("f70", "F70"), ("f60", "F60"),
    ("f50", "F50"), ("f40", "F40"), ("f30", "F30"), ("f20", "F20"), ("f10", "F10"),
    ("sd_ratio_10_5", "SD Ratio 10/5"),
    ("video_red", "Video Red"),
    ("video_green", "Video Green"),
    ("video_blue", "Video Blue"),
    ("avg_hue", "Average Hue"),
    ("avg_saturation", "Average Saturation"),
    ("avg_lightness", "Average Lightness"),
)

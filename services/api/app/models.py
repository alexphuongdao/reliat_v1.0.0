from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

DEFAULT_SOURCE = "synthetic"


class Tenant(Base):
    """A customer. Every piece of plant data belongs to exactly one."""

    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    users: Mapped[list["User"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan", passive_deletes=True
    )
    channels: Mapped[list["Channel"]] = relationship(back_populates="tenant")


class User(Base):
    """Someone who logs in.

    `tenant_id` is NULL for platform staff (role `superadmin`), who are not
    scoped to any one customer. Everyone else must have one.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    tenant_id: Mapped[str | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    username: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    # NULL when the account exists only for OAuth — no password to verify.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="member")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    tenant: Mapped[Tenant | None] = relationship(back_populates="users")
    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class UserSession(Base):
    """One live login.

    Server-side so it can be revoked — the whole reason this isn't a JWT.
    Only the SHA-256 of the cookie value is stored: a database leak then
    doesn't hand over usable session tokens.
    """

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")


class OAuthAccount(Base):
    """An external identity (Google, Entra ID, …) linked to a local user.

    Links are only ever created for an email that already maps to a
    provisioned user — see `docs/AuthPlan.md`. No self-signup.
    """

    __tablename__ = "oauth_accounts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_account_id: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped[User] = relationship(back_populates="oauth_accounts")

    __table_args__ = (
        Index("ix_oauth_provider_account", "provider", "provider_account_id", unique=True),
    )


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    # The tenant boundary. `measurements`, `outliers` and `outlier_diagnoses`
    # all hang off a channel, so scoping here scopes the whole tree.
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    belt: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(64), nullable=False)
    base_f80: Mapped[float] = mapped_column(Float, nullable=False)
    base_topsize: Mapped[float] = mapped_column(Float, nullable=False)
    online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    shift: Mapped[str] = mapped_column(String(8), nullable=False, default="A")

    tenant: Mapped[Tenant] = relationship(back_populates="channels")
    measurements: Mapped[list[Measurement]] = relationship(
        back_populates="channel", cascade="all, delete-orphan", passive_deletes=True
    )
    outliers: Mapped[list[Outlier]] = relationship(
        back_populates="channel", cascade="all, delete-orphan", passive_deletes=True
    )


class SourceAsset(Base):
    """Immutable uploaded/source file metadata used for provenance and replay."""

    __tablename__ = "source_assets"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    byte_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage_uri: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    profile_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    profile_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="received")
    received_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    received_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    ingested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rows_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_written: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_rejected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_duplicate: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(String(4096), nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "sha256", name="uq_source_assets_tenant_sha256"),
    )


class Measurement(Base):
    """One PSD + color sample for a channel at a moment in time."""

    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[str] = mapped_column(
        ForeignKey("channels.id", ondelete="CASCADE"), nullable=False
    )
    source_asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("source_assets.id", ondelete="SET NULL"), nullable=True, index=True
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

    # Real-instrument fields present in vendor exports (e.g. the CEMEX/MINITAB
    # CV42 export) but absent from synthetic seed rows — nullable so both
    # sources share one table.
    source: Mapped[str] = mapped_column(String(32), nullable=False, default=DEFAULT_SOURCE)
    iteration_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sd_ratio_10_5: Mapped[float | None] = mapped_column(Float, nullable=True)
    video_r: Mapped[float | None] = mapped_column(Float, nullable=True)
    video_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    video_b: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Raw vendor sieve columns (e.g. "6_000in" -> 86.6 % passing), keyed by
    # the original column name. Distinct from `psd.sieves`, which is the
    # canonical mm-keyed set the charts render (interpolated for synthetic
    # rows, real values here for vendor rows that report them).
    sieve_passing_raw: Mapped[dict[str, float] | None] = mapped_column(JSON, nullable=True)

    channel: Mapped[Channel] = relationship(back_populates="measurements")

    __table_args__ = (
        Index("ix_measurements_channel_t", "channel_id", "t"),
        UniqueConstraint("channel_id", "t", name="uq_measurements_channel_t"),
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
    diagnoses: Mapped[list["OutlierDiagnosis"]] = relationship(
        back_populates="outlier", cascade="all, delete-orphan", passive_deletes=True,
        order_by="OutlierDiagnosis.created_at.desc()",
    )


class OutlierDiagnosis(Base):
    """Diagnostic Agent output for one outlier — the phase-1 root-cause pass.

    One outlier can accumulate several runs (re-run after new evidence, model
    upgrade, etc.); the API surfaces the latest by `created_at`.
    """

    __tablename__ = "outlier_diagnoses"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    outlier_id: Mapped[str] = mapped_column(
        ForeignKey("outliers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="complete")  # complete|error
    model: Mapped[str] = mapped_column(String(64), nullable=False)

    root_cause: Mapped[str] = mapped_column(String(2048), nullable=False, default="")
    hypotheses: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    recommended_action: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    evidence_summary: Mapped[str] = mapped_column(String(4096), nullable=False, default="")

    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    error: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    outlier: Mapped[Outlier] = relationship(back_populates="diagnoses")

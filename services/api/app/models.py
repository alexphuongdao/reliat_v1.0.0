from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


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

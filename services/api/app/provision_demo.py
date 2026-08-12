"""Provision the `demo` tenant and separate it from CEMEX's real data.

Run: `python -m app.provision_demo`

Before this, one tenant (CEMEX) owned all 12 channels: `cv42` with 21,138 real
MINITAB rows, and 11 empty shells left over from a seeding run. Every screen
therefore showed CEMEX a fleet that mostly didn't exist, and the only way to
demo a populated UI was to fall back to fabricated data.

After this:

    cemex  →  cv42 only, real instrument rows, nothing synthetic
    demo   →  the 11 synthetic channels, seeded through the real ETL,
              reachable with the `test` account

Nothing is invented for CEMEX. Where CEMEX has no data, the UI says so.

Idempotent: re-running moves nothing that has already moved and never
overwrites an existing user's password.
"""
from __future__ import annotations

import argparse
import logging

from sqlalchemy.orm import Session

from .auth import ROLE_OWNER
from .bootstrap import _ensure_user
from .db import init_db, session_scope
from .etl import ingest_rows
from .models import Channel, Measurement, Outlier, Tenant
from .seed import CHANNEL_REGISTRY, _synth_rows_for_channel
from .tenancy import DEFAULT_TENANT_SLUG, ensure_tenant

logger = logging.getLogger("reliat.provision")

DEMO_TENANT_ID = "tn_demo"
DEMO_TENANT_SLUG = "demo"
DEMO_TENANT_NAME = "Demo Plant"

#: The channel that carries real customer data. Everything else in the
#: registry is synthetic and belongs to the demo tenant.
REAL_CHANNEL_IDS = {"cv42"}

DEMO_PASSWORD = "Test-Reliat-2026!"


def _demo_channel_ids() -> list[str]:
    return [cid for cid, *_ in CHANNEL_REGISTRY if cid not in REAL_CHANNEL_IDS]


def provision(session: Session, points_per_channel: int = 1440) -> dict[str, object]:
    report: dict[str, object] = {}

    demo = ensure_tenant(
        session, tenant_id=DEMO_TENANT_ID, slug=DEMO_TENANT_SLUG, name=DEMO_TENANT_NAME
    )
    session.flush()
    report["tenant"] = demo.slug

    _, created = _ensure_user(
        session,
        username="test",
        email="test@reliat.local",
        name="Demo Operator",
        password=DEMO_PASSWORD,
        role=ROLE_OWNER,
        tenant_id=demo.id,
    )
    report["test_user"] = "created" if created else "exists"

    # ── move the synthetic channels out of CEMEX ──
    moved = []
    for cid in _demo_channel_ids():
        ch = session.query(Channel).filter(Channel.id == cid).first()
        if ch is None:
            continue
        if ch.tenant_id != demo.id:
            ch.tenant_id = demo.id
            moved.append(cid)
    session.flush()
    report["channels_moved"] = moved

    # ── seed the demo channels that have no measurements ──
    empty = [
        cid for cid in _demo_channel_ids()
        if session.query(Measurement).filter(Measurement.channel_id == cid).first() is None
    ]
    if empty:
        by_id = {cid: (f80, top) for cid, _, _, _, f80, top, _ in CHANNEL_REGISTRY}
        rows = []
        for cid in empty:
            base_f80, base_top = by_id[cid]
            rows.extend(_synth_rows_for_channel(cid, base_f80, base_top, points_per_channel))
        counts = ingest_rows(session, rows)
        report["seeded"] = {"channels": len(empty), **counts}
    else:
        report["seeded"] = "already populated"

    # The session is autoflush=False, so freshly-added Outlier rows are
    # invisible to the counts below until they're flushed. Without this the
    # report says "0 outliers" for data it just created.
    session.flush()

    # ── report what CEMEX is actually left holding ──
    cemex = session.query(Tenant).filter(Tenant.slug == DEFAULT_TENANT_SLUG).first()
    if cemex is not None:
        cemex_channels = session.query(Channel).filter(Channel.tenant_id == cemex.id).all()
        report["cemex_channels"] = [c.id for c in cemex_channels]
        report["cemex_measurements"] = (
            session.query(Measurement)
            .join(Channel, Channel.id == Measurement.channel_id)
            .filter(Channel.tenant_id == cemex.id)
            .count()
        )
        report["cemex_outliers"] = (
            session.query(Outlier)
            .join(Channel, Channel.id == Outlier.channel_id)
            .filter(Channel.tenant_id == cemex.id)
            .count()
        )

    demo_channels = session.query(Channel).filter(Channel.tenant_id == demo.id).all()
    report["demo_channels"] = len(demo_channels)
    report["demo_measurements"] = (
        session.query(Measurement)
        .join(Channel, Channel.id == Measurement.channel_id)
        .filter(Channel.tenant_id == demo.id)
        .count()
    )
    report["demo_outliers"] = (
        session.query(Outlier)
        .join(Channel, Channel.id == Outlier.channel_id)
        .filter(Channel.tenant_id == demo.id)
        .count()
    )
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--points", type=int, default=1440,
                    help="minute-resolution samples per demo channel (default 1440 = 24h)")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO)
    init_db()
    with session_scope() as s:
        report = provision(s, points_per_channel=args.points)
    for key, value in report.items():
        print(f"[provision] {key}: {value}")


if __name__ == "__main__":
    main()

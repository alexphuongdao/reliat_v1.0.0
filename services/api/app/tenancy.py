"""Tenant constants and the ingest-side default.

Every ingest path (seed, CSV ETL, MINITAB import) has to put its channels
somewhere. Until multi-customer ingest exists, they all land in the default
tenant — which is CEMEX, the only customer whose data we actually hold.

Kept free of any auth imports so the ETL modules can depend on it without
dragging in password hashing.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import Tenant

# Must match the backfill in alembic revision b7f31c904e2a.
DEFAULT_TENANT_ID = "tn_cemex"
DEFAULT_TENANT_SLUG = "cemex"
DEFAULT_TENANT_NAME = "CEMEX"


def ensure_tenant(session: Session, tenant_id: str, slug: str, name: str) -> Tenant:
    """Idempotent tenant upsert — returns the existing row if there is one."""
    t = session.query(Tenant).filter(Tenant.id == tenant_id).first()
    if t is None:
        t = Tenant(
            id=tenant_id,
            slug=slug,
            name=name,
            active=True,
            created_at=datetime.now(tz=timezone.utc).replace(tzinfo=None),
        )
        session.add(t)
        session.flush()
    return t


def ensure_default_tenant(session: Session) -> Tenant:
    return ensure_tenant(
        session, DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG, DEFAULT_TENANT_NAME
    )

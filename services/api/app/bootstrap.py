"""First-boot identity bootstrap.

Creates the CEMEX tenant and the two demo profiles if they don't exist.
Idempotent: safe on every startup, and it never touches a user that is
already there (so a changed password stays changed).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .auth import ROLE_OWNER, ROLE_SUPERADMIN, hash_password, new_id
from .config import settings
from .models import Channel, User
from .tenancy import ensure_default_tenant

logger = logging.getLogger("reliat.bootstrap")


def _ensure_user(
    session: Session,
    *,
    username: str,
    email: str,
    name: str,
    password: str,
    role: str,
    tenant_id: str | None,
) -> tuple[User, bool]:
    existing = session.query(User).filter(User.username == username).first()
    if existing is not None:
        return existing, False
    user = User(
        id=new_id("us"),
        tenant_id=tenant_id,
        username=username,
        email=email,
        name=name,
        password_hash=hash_password(password),
        role=role,
        active=True,
        created_at=datetime.now(tz=timezone.utc).replace(tzinfo=None),
    )
    session.add(user)
    session.flush()
    return user, True


def bootstrap_identity(session: Session) -> dict[str, str]:
    """Ensure the CEMEX tenant + the `cemex` and `admin` profiles exist."""
    tenant = ensure_default_tenant(session)

    # Any channel that predates tenancy (or was ingested by a script that
    # skipped it) belongs to CEMEX — they're the only customer with data.
    orphans = session.query(Channel).filter(Channel.tenant_id.is_(None)).all()
    for ch in orphans:
        ch.tenant_id = tenant.id
    if orphans:
        logger.info("adopted %d untenanted channel(s) into %s", len(orphans), tenant.slug)

    _, cemex_created = _ensure_user(
        session,
        username="cemex",
        email="cemex@reliat.local",
        name="CEMEX Operations",
        password=settings.seed_cemex_password,
        role=ROLE_OWNER,
        tenant_id=tenant.id,
    )
    _, admin_created = _ensure_user(
        session,
        username="admin",
        email="admin@reliat.local",
        name="Reliat Admin",
        password=settings.seed_admin_password,
        # Platform staff belong to no tenant — that's what makes them
        # cross-tenant. See `Principal.tenant_id`.
        role=ROLE_SUPERADMIN,
        tenant_id=None,
    )

    return {
        "tenant": tenant.slug,
        "cemex": "created" if cemex_created else "exists",
        "admin": "created" if admin_created else "exists",
    }

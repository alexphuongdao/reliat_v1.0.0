"""Identity: password hashing, server-side sessions, request principal.

Design notes live in `docs/AuthPlan.md`. The two things worth restating here:

1. Sessions are opaque tokens backed by a `sessions` row, not JWTs — so an
   admin can revoke one instantly. Only the SHA-256 of the token is stored.
2. The tenant a request is allowed to see is resolved from the database on
   every call, never from the cookie. A demotion or a tenant switch takes
   effect on the next request rather than at token expiry.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .config import settings
from .db import get_session
from .models import Tenant, User, UserSession

SESSION_COOKIE = "reliat_session"

ROLE_SUPERADMIN = "superadmin"
ROLE_OWNER = "owner"
ROLE_MEMBER = "member"

# How stale `sessions.last_seen_at` is allowed to get before we write it.
LAST_SEEN_THROTTLE = timedelta(minutes=5)

# argon2-cffi's defaults track the current OWASP guidance; `check_needs_rehash`
# below means raising them later silently upgrades hashes on next login.
_hasher = PasswordHasher()


def _utcnow() -> datetime:
    # Columns are naive DateTime (the baseline schema's choice) — keep every
    # write in UTC-naive so comparisons stay meaningful.
    return datetime.now(tz=timezone.utc).replace(tzinfo=None)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


# ─── passwords ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(user: User, password: str) -> bool:
    """Constant-work verification.

    When the user has no password hash (OAuth-only account, or no such user)
    we still burn a hash cycle so response timing doesn't reveal whether the
    account exists.
    """
    if not user.password_hash:
        _hasher.hash(password)
        return False
    try:
        _hasher.verify(user.password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False
    return True


def rehash_if_needed(session: Session, user: User, password: str) -> None:
    if user.password_hash and _hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        session.flush()


def dummy_verify(password: str) -> None:
    """Burn the same work as a real verify for a username that doesn't exist."""
    _hasher.hash(password)


# ─── sessions ───────────────────────────────────────────────────────────

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(
    session: Session,
    user: User,
    ip: str | None = None,
    user_agent: str | None = None,
) -> str:
    """Create a session row and return the raw token (only time it exists)."""
    token = secrets.token_urlsafe(32)
    now = _utcnow()
    session.add(UserSession(
        id=new_id("se"),
        user_id=user.id,
        token_hash=_token_hash(token),
        created_at=now,
        expires_at=now + timedelta(days=settings.session_ttl_days),
        last_seen_at=now,
        ip=ip,
        user_agent=(user_agent or "")[:512] or None,
    ))
    user.last_login_at = now
    session.flush()
    return token


def revoke_session(session: Session, token: str) -> None:
    row = (
        session.query(UserSession)
        .filter(UserSession.token_hash == _token_hash(token))
        .first()
    )
    if row is not None and row.revoked_at is None:
        row.revoked_at = _utcnow()
        session.flush()


def lookup_session(session: Session, token: str) -> UserSession | None:
    row = (
        session.query(UserSession)
        .filter(UserSession.token_hash == _token_hash(token))
        .first()
    )
    if row is None or row.revoked_at is not None:
        return None
    if row.expires_at <= _utcnow():
        return None
    return row


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_ttl_days * 24 * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        domain=settings.cookie_domain or None,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        domain=settings.cookie_domain or None,
        path="/",
    )


# ─── request principal ──────────────────────────────────────────────────

@dataclass(frozen=True)
class Principal:
    """Who is calling, and what they're allowed to see."""

    user: User
    tenant: Tenant | None

    @property
    def is_superadmin(self) -> bool:
        return self.user.role == ROLE_SUPERADMIN

    @property
    def tenant_id(self) -> str | None:
        """The tenant to filter data by — `None` means 'all tenants'.

        Only a superadmin ever gets `None`; every other role is pinned to
        their own tenant by the loader below.
        """
        return self.tenant.id if self.tenant else None


def _bearer_token(request: Request) -> str | None:
    """Cookie first, `Authorization: Bearer` as a fallback.

    The header path exists so scripts and the docs' "Try it out" button can
    authenticate without a browser cookie jar.
    """
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        return token
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def get_principal_optional(
    request: Request,
    session: Session = Depends(get_session),
) -> Principal | None:
    token = _bearer_token(request)
    if not token:
        return None
    row = lookup_session(session, token)
    if row is None:
        return None

    user = session.query(User).filter(User.id == row.user_id).first()
    if user is None or not user.active:
        return None

    # Liveness tracking, throttled — a write on every single request would
    # turn every GET into a read-write transaction for no real benefit.
    now = _utcnow()
    if (now - row.last_seen_at) > LAST_SEEN_THROTTLE:
        session.query(UserSession).filter(UserSession.id == row.id).update(
            {"last_seen_at": now}
        )
        session.commit()

    tenant: Tenant | None = None
    if user.role == ROLE_SUPERADMIN:
        # Superadmins default to seeing everything, and can pin a single
        # tenant with `?tenant=<slug>` or an `X-Reliat-Tenant` header.
        wanted = request.query_params.get("tenant") or request.headers.get("x-reliat-tenant")
        if wanted:
            tenant = session.query(Tenant).filter(Tenant.slug == wanted).first()
            if tenant is None:
                raise HTTPException(404, f"no tenant '{wanted}'")
    else:
        if user.tenant_id is None:
            # A non-superadmin with no tenant can see nothing — refuse rather
            # than fall through to an unscoped query.
            return None
        tenant = session.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant is None or not tenant.active:
            return None

    return Principal(user=user, tenant=tenant)


def get_principal(
    principal: Principal | None = Depends(get_principal_optional),
) -> Principal:
    if principal is None:
        raise HTTPException(401, "not authenticated")
    return principal


def require_superadmin(
    principal: Principal = Depends(get_principal),
) -> Principal:
    if not principal.is_superadmin:
        raise HTTPException(403, "superadmin only")
    return principal

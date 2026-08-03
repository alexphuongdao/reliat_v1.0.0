"""Auth endpoints — login, logout, whoami, OAuth handshake."""
from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import (
    Principal,
    clear_session_cookie,
    create_session,
    dummy_verify,
    get_principal,
    get_principal_optional,
    hash_password,
    rehash_if_needed,
    revoke_session,
    set_session_cookie,
    verify_password,
    SESSION_COOKIE,
    new_id,
)
from ..config import settings
from ..db import get_session
from ..models import OAuthAccount, Tenant, User
from ..oauth import available_providers, get_client

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ─── schemas ────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    # Accepts either the username or the email — operators shouldn't have to
    # remember which one we asked them for.
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)


class TenantOut(BaseModel):
    id: str
    slug: str
    name: str


class MeOut(BaseModel):
    id: str
    username: str
    email: str
    name: str
    role: str
    tenant: TenantOut | None
    # True when this principal sees every tenant rather than one.
    allTenants: bool


class ProviderOut(BaseModel):
    id: str
    label: str


def _me(principal: Principal) -> MeOut:
    t = principal.tenant
    return MeOut(
        id=principal.user.id,
        username=principal.user.username,
        email=principal.user.email,
        name=principal.user.name or principal.user.username,
        role=principal.user.role,
        tenant=TenantOut(id=t.id, slug=t.slug, name=t.name) if t else None,
        allTenants=principal.is_superadmin and t is None,
    )


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


# ─── credential login ───────────────────────────────────────────────────

@router.post("/login", response_model=MeOut)
def login(
    body: LoginIn,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> MeOut:
    ident = body.username.strip().lower()
    user = (
        session.query(User)
        .filter((User.username == ident) | (User.email == ident))
        .first()
    )

    # Same error and roughly the same cost whether the user exists or the
    # password is wrong — no account enumeration through the login form.
    if user is None:
        dummy_verify(body.password)
        raise HTTPException(401, "invalid username or password")
    if not verify_password(user, body.password):
        raise HTTPException(401, "invalid username or password")
    if not user.active:
        raise HTTPException(403, "account disabled")

    rehash_if_needed(session, user, body.password)
    token = create_session(
        session, user,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    session.commit()
    set_session_cookie(response, token)

    tenant = (
        session.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if user.tenant_id else None
    )
    return _me(Principal(user=user, tenant=tenant))


@router.post("/logout")
def logout(request: Request, response: Response, session: Session = Depends(get_session)) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        revoke_session(session, token)
        session.commit()
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=MeOut)
def me(principal: Principal = Depends(get_principal)) -> MeOut:
    return _me(principal)


@router.get("/providers", response_model=list[ProviderOut])
def providers() -> list[ProviderOut]:
    """Which OAuth buttons the login page should render."""
    return [ProviderOut(id=p.id, label=p.label) for p in available_providers()]


# ─── OAuth ──────────────────────────────────────────────────────────────

@router.get("/oauth/{provider}/authorize")
async def oauth_authorize(provider: str, request: Request):
    client = get_client(provider)
    if client is None:
        raise HTTPException(404, f"oauth provider '{provider}' is not configured")
    redirect_uri = str(request.url_for("oauth_callback", provider=provider))
    return await client.authorize_redirect(request, redirect_uri)


def _login_redirect(error: str) -> RedirectResponse:
    qs = urlencode({"error": error})
    return RedirectResponse(f"{settings.web_app_origin.rstrip('/')}/login?{qs}", status_code=303)


@router.get("/oauth/{provider}/callback", name="oauth_callback")
async def oauth_callback(
    provider: str,
    request: Request,
    session: Session = Depends(get_session),
):
    client = get_client(provider)
    if client is None:
        raise HTTPException(404, f"oauth provider '{provider}' is not configured")

    try:
        token = await client.authorize_access_token(request)
    except Exception:
        return _login_redirect("oauth_failed")

    claims = token.get("userinfo") or {}
    if not claims:
        try:
            claims = await client.userinfo(token=token)
        except Exception:
            return _login_redirect("oauth_failed")

    subject = str(claims.get("sub") or "")
    email = (claims.get("email") or "").strip().lower()
    if not subject or not email:
        return _login_redirect("oauth_no_email")

    link = (
        session.query(OAuthAccount)
        .filter(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_account_id == subject,
        )
        .first()
    )
    user = session.query(User).filter(User.id == link.user_id).first() if link else None

    if user is None:
        # First time through: attach to an *existing* provisioned account
        # with the same email. No account is ever created here.
        user = session.query(User).filter(User.email == email).first()
        if user is None:
            return _login_redirect("oauth_not_provisioned")
        session.add(OAuthAccount(
            id=new_id("oa"),
            user_id=user.id,
            provider=provider,
            provider_account_id=subject,
            email=email,
            created_at=datetime.now(tz=timezone.utc).replace(tzinfo=None),
        ))

    if not user.active:
        return _login_redirect("account_disabled")

    session_token = create_session(
        session, user,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    session.commit()

    redirect = RedirectResponse(f"{settings.web_app_origin.rstrip('/')}/pulse", status_code=303)
    set_session_cookie(redirect, session_token)
    return redirect


# ─── admin: tenants and users ───────────────────────────────────────────

class TenantCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    name: str = Field(min_length=1, max_length=128)


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=10, max_length=1024)
    name: str = Field(default="", max_length=128)
    role: str = Field(default="member", pattern=r"^(owner|member)$")


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    name: str
    role: str
    active: bool
    tenantId: str | None


def _require_admin_of(principal: Principal, tenant_id: str) -> None:
    """Superadmins manage any tenant; owners manage only their own."""
    if principal.is_superadmin:
        return
    if principal.user.role == "owner" and principal.user.tenant_id == tenant_id:
        return
    raise HTTPException(403, "not permitted to manage this tenant")


@router.get("/tenants", response_model=list[TenantOut])
def list_tenants(
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[TenantOut]:
    q = session.query(Tenant).order_by(Tenant.name)
    if not principal.is_superadmin:
        q = q.filter(Tenant.id == principal.user.tenant_id)
    return [TenantOut(id=t.id, slug=t.slug, name=t.name) for t in q.all()]


@router.post("/tenants", response_model=TenantOut, status_code=201)
def create_tenant(
    body: TenantCreate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> TenantOut:
    if not principal.is_superadmin:
        raise HTTPException(403, "superadmin only")
    if session.query(Tenant).filter(Tenant.slug == body.slug).first():
        raise HTTPException(409, f"tenant '{body.slug}' already exists")
    t = Tenant(
        id=new_id("tn"), slug=body.slug, name=body.name, active=True,
        created_at=datetime.now(tz=timezone.utc).replace(tzinfo=None),
    )
    session.add(t)
    session.commit()
    return TenantOut(id=t.id, slug=t.slug, name=t.name)


@router.post("/tenants/{tenant_id}/users", response_model=UserOut, status_code=201)
def create_user(
    tenant_id: str,
    body: UserCreate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> UserOut:
    _require_admin_of(principal, tenant_id)
    if session.query(Tenant).filter(Tenant.id == tenant_id).first() is None:
        raise HTTPException(404, f"no tenant {tenant_id}")

    username = body.username.strip().lower()
    email = body.email.strip().lower()
    clash = (
        session.query(User)
        .filter((User.username == username) | (User.email == email))
        .first()
    )
    if clash is not None:
        raise HTTPException(409, "username or email already in use")

    u = User(
        id=new_id("us"),
        tenant_id=tenant_id,
        username=username,
        email=email,
        name=body.name or username,
        password_hash=hash_password(body.password),
        role=body.role,
        active=True,
        created_at=datetime.now(tz=timezone.utc).replace(tzinfo=None),
    )
    session.add(u)
    session.commit()
    return UserOut(
        id=u.id, username=u.username, email=u.email, name=u.name,
        role=u.role, active=u.active, tenantId=u.tenant_id,
    )


@router.get("/session-status")
def session_status(
    principal: Principal | None = Depends(get_principal_optional),
) -> dict:
    """Unauthenticated-safe probe — the web app's guard uses it."""
    return {"authenticated": principal is not None}

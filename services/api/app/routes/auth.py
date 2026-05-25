"""Authentication: password register/login + Google/GitHub OAuth.

Token flow: every successful sign-in (password or OAuth) ends with a signed
JWT. Password endpoints return it as JSON; OAuth callbacks bounce the browser
to `${FRONTEND_URL}/auth/callback#token=<jwt>` (fragment, so the token is not
sent to any server or written to access logs) where the SPA reads it.
"""
from __future__ import annotations

from authlib.integrations.starlette_client import OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_session
from ..models import User
from ..oauth import oauth
from ..schemas import AuthProvidersOut, LoginIn, RegisterIn, TokenOut, UserOut
from ..security import (
    create_access_token,
    get_current_user,
    hash_password,
    new_user_id,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_response(user: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/providers", response_model=AuthProvidersOut)
def providers() -> AuthProvidersOut:
    """Which sign-in methods are configured — lets the UI show only what works."""
    return AuthProvidersOut(google=settings.google_enabled, github=settings.github_enabled)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, session: Session = Depends(get_session)) -> TokenOut:
    email = body.email.lower()
    if session.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(
        id=new_user_id(),
        email=email,
        username=body.username,
        password_hash=hash_password(body.password),
        name=body.username,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _token_response(user)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, session: Session = Depends(get_session)) -> TokenOut:
    user = session.query(User).filter(User.email == body.email.lower()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")
    return _token_response(user)


# --- OAuth ------------------------------------------------------------------


def _client(provider: str):
    client = oauth.create_client(provider)
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{provider} sign-in is not configured")
    return client


def _upsert_oauth_user(
    session: Session,
    provider: str,
    sub: str,
    email: str,
    name: str | None,
    avatar: str | None,
) -> User:
    # Prefer matching the exact external identity; fall back to email so a
    # password account can later link an OAuth provider with the same email.
    user = (
        session.query(User)
        .filter(User.provider == provider, User.provider_sub == sub)
        .first()
    )
    if user is None:
        user = session.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            id=new_user_id(),
            email=email,
            username=name or email.split("@")[0],
            name=name,
            avatar_url=avatar,
            provider=provider,
            provider_sub=sub,
        )
        session.add(user)
    else:
        user.provider = provider
        user.provider_sub = sub
        if name and not user.name:
            user.name = name
        if avatar and not user.avatar_url:
            user.avatar_url = avatar
    session.commit()
    session.refresh(user)
    return user


@router.get("/{provider}/login")
async def oauth_login(provider: str, request: Request):
    client = _client(provider)
    redirect_uri = f"{settings.backend_url}/api/auth/{provider}/callback"
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/{provider}/callback")
async def oauth_callback(provider: str, request: Request, session: Session = Depends(get_session)):
    client = _client(provider)
    try:
        token = await client.authorize_access_token(request)
    except OAuthError:
        return RedirectResponse(f"{settings.frontend_url}/login?error=oauth")

    if provider == "google":
        info = token.get("userinfo") or await client.userinfo(token=token)
        sub = info["sub"]
        email = info.get("email")
        name = info.get("name")
        avatar = info.get("picture")
    else:  # github
        profile = (await client.get("user", token=token)).json()
        sub = str(profile["id"])
        name = profile.get("name") or profile.get("login")
        avatar = profile.get("avatar_url")
        email = profile.get("email")
        if not email:
            emails = (await client.get("user/emails", token=token)).json()
            email = next(
                (e["email"] for e in emails if e.get("primary") and e.get("verified")),
                None,
            )

    if not email:
        return RedirectResponse(f"{settings.frontend_url}/login?error=email")

    user = _upsert_oauth_user(session, provider, sub, email.lower(), name, avatar)
    jwt_token = create_access_token(user)
    return RedirectResponse(f"{settings.frontend_url}/auth/callback#token={jwt_token}")

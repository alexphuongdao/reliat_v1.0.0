"""Password hashing, JWT issuing/verifying, and the auth dependency.

Tokens are short JWTs carrying the user id (`sub`) and are sent by the
frontend as `Authorization: Bearer <token>`. We deliberately do NOT use
cookies yet: the SPA on *.vercel.app and the API on *.up.railway.app are
cross-site, which makes cookies (SameSite=None, Secure, ITP) fiddly. Once
both live under one registrable domain (reliat.com / api.reliat.com), an
httpOnly cookie is the stronger choice and this is where we'd switch.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_session
from .models import User


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def new_user_id() -> str:
    return uuid.uuid4().hex


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


_bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if creds is None:
        raise _UNAUTHORIZED
    try:
        payload = jwt.decode(
            creds.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError:
        raise _UNAUTHORIZED
    user = session.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise _UNAUTHORIZED
    return user

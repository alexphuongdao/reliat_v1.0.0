"""Authlib OAuth client registry for Google and GitHub.

Providers register only when their credentials are configured, so the app
boots fine with neither, one, or both set. The actual redirect/callback
endpoints live in routes/auth.py.
"""
from __future__ import annotations

from authlib.integrations.starlette_client import OAuth

from .config import settings

oauth = OAuth()

if settings.google_enabled:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

if settings.github_enabled:
    oauth.register(
        name="github",
        client_id=settings.github_client_id,
        client_secret=settings.github_client_secret,
        access_token_url="https://github.com/login/oauth/access_token",
        authorize_url="https://github.com/login/oauth/authorize",
        api_base_url="https://api.github.com/",
        client_kwargs={"scope": "read:user user:email"},
    )

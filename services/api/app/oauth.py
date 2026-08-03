"""OAuth / OIDC layer.

Providers are registered from config, so enabling Google or a customer's
Microsoft Entra ID directory is two env vars rather than a code change.
Unconfigured providers simply don't exist as far as the API is concerned.

The deliberate constraint (see `docs/AuthPlan.md`): an OAuth login only ever
*attaches to* a user that has already been provisioned. There is no
self-signup path — a stranger with a Google account must not be able to
create themselves an account inside a customer's plant data.
"""
from __future__ import annotations

from dataclasses import dataclass

from authlib.integrations.starlette_client import OAuth

from .config import settings


@dataclass(frozen=True)
class ProviderInfo:
    id: str
    label: str


_oauth = OAuth()
_registered: dict[str, ProviderInfo] = {}


def _register_all() -> None:
    if settings.oauth_google_client_id and settings.oauth_google_client_secret:
        _oauth.register(
            name="google",
            client_id=settings.oauth_google_client_id,
            client_secret=settings.oauth_google_client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
        _registered["google"] = ProviderInfo(id="google", label="Google")

    if settings.oauth_microsoft_client_id and settings.oauth_microsoft_client_secret:
        directory = settings.oauth_microsoft_tenant or "common"
        _oauth.register(
            name="microsoft",
            client_id=settings.oauth_microsoft_client_id,
            client_secret=settings.oauth_microsoft_client_secret,
            server_metadata_url=(
                f"https://login.microsoftonline.com/{directory}/v2.0/.well-known/openid-configuration"
            ),
            client_kwargs={"scope": "openid email profile"},
        )
        _registered["microsoft"] = ProviderInfo(id="microsoft", label="Microsoft")


_register_all()


def available_providers() -> list[ProviderInfo]:
    return list(_registered.values())


def get_client(provider: str):
    """Return the Authlib client, or None if the provider isn't configured."""
    if provider not in _registered:
        return None
    return getattr(_oauth, provider, None)

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend settings — overridable via `RELIAT_*` env vars or a `.env` file.

    Production env on Railway/Render needs:
      RELIAT_DATABASE_URL=postgresql+psycopg://<…>      # Neon connection string
      RELIAT_CORS_ORIGINS=https://<your-app>.vercel.app  # comma-separated for >1
      RELIAT_SEED_ON_STARTUP=false                       # don't seed prod DB
    """

    model_config = SettingsConfigDict(env_file=".env", env_prefix="RELIAT_", extra="ignore")

    database_url: str = "sqlite:///./reliat.db"

    # Allowed origins for CORS, comma-separated. The default covers local
    # dev (Next dev server, Vite dev server, file:// pages). In prod set
    # `RELIAT_CORS_ORIGINS=https://yourapp.vercel.app` (commas for >1).
    #
    # Stored as a string instead of list[str] because pydantic-settings
    # tries to JSON-decode list fields from env vars — making
    # comma-separated values awkward on every PaaS UI. The split happens
    # in `cors_origins_list` below.
    cors_origins: str = ",".join([
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "null",  # file:// origins send Origin: null
    ])

    seed_on_startup: bool = True

    # ─── auth ───────────────────────────────────────────────────────────
    # Signs the short-lived OAuth state cookie. Not the login session — that
    # is a random token in the DB. Set a real value in any deployment:
    # `openssl rand -base64 32`.
    session_secret: str = "reliat-dev-only-change-me"
    # Session lifetime. Sessions are server-side rows, so shortening this
    # takes effect for existing logins on their next request.
    session_ttl_days: int = 14

    # Cookie policy. The local default is the loose one: no Secure (http on
    # localhost), Lax (localhost:3300 → localhost:8000 is same-site, since
    # the port is not part of a site). In prod set cookie_secure=true and
    # cookie_domain=.yourdomain.com so app+api share the cookie.
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cookie_domain: str = ""

    # Where the OAuth callback sends the browser once a session exists.
    # Must be the web app's origin, not the API's.
    web_app_origin: str = "http://localhost:3300"

    # Bootstrap profiles created on first startup (see app/bootstrap.py).
    # Overridable so a real deployment never ships the documented defaults.
    seed_cemex_password: str = "Cemex-Reliat-2026!"
    seed_admin_password: str = "Admin-Reliat-2026!"
    bootstrap_on_startup: bool = True

    # ─── OAuth providers ────────────────────────────────────────────────
    # Leave blank to disable a provider — it then never appears in
    # /api/auth/providers and the login page renders no button for it.
    oauth_google_client_id: str = ""
    oauth_google_client_secret: str = ""
    oauth_microsoft_client_id: str = ""
    oauth_microsoft_client_secret: str = ""
    # Entra ID directory: a tenant GUID, or "organizations"/"common".
    oauth_microsoft_tenant: str = "common"

    # Not RELIAT_-prefixed: matches the Anthropic SDK's own default env var
    # name so `ANTHROPIC_API_KEY` set anywhere (shell, .env, compose) works
    # without translation.
    anthropic_api_key: str | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    # Cheapest tier by default — override with RELIAT_DIAGNOSTIC_MODEL to
    # escalate to claude-sonnet-5 for harder cases.
    diagnostic_model: str = "claude-haiku-4-5-20251001"

    @property
    def cors_origins_list(self) -> list[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]


settings = Settings()

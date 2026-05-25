from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend settings — overridable via `RELIAT_*` env vars or a `.env` file.

    Production env on Railway/Render needs:
      RELIAT_DATABASE_URL=<Neon connection string, paste as-is>
      RELIAT_CORS_ORIGINS=https://<your-app>.vercel.app  # comma-separated for >1
      RELIAT_SEED_ON_STARTUP=false                       # don't seed prod DB
    """

    model_config = SettingsConfigDict(env_file=".env", env_prefix="RELIAT_", extra="ignore")

    database_url: str = "sqlite:///./reliat.db"

    @field_validator("database_url", mode="after")
    @classmethod
    def _use_psycopg_driver(cls, v: str) -> str:
        # SQLAlchemy selects its DBAPI from the URL scheme. A bare
        # `postgresql://` (what Neon/Heroku/etc. hand you) defaults to
        # psycopg2, but we ship psycopg v3 — so rewrite the scheme. This
        # lets you paste the provider's raw connection string unedited.
        for bare in ("postgresql://", "postgres://"):
            if v.startswith(bare):
                return "postgresql+psycopg://" + v[len(bare):]
        return v

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

    @property
    def cors_origins_list(self) -> list[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]


settings = Settings()

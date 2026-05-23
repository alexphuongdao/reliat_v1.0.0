from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="RELIAT_", extra="ignore")

    database_url: str = "sqlite:///./reliat.db"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "file://",
        "null",
    ]
    seed_on_startup: bool = True


settings = Settings()

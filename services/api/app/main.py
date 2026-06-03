from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .db import init_db, session_scope
from .routes.analytics import router as analytics_router
from .routes.auth import router as auth_router
from .routes.channels import router as channels_router
from .routes.ingest import router as ingest_router
from .routes.outliers import router as outliers_router
from .security import get_current_user
from .seed import is_seeded, seed_demo

logger = logging.getLogger("reliat")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if settings.seed_on_startup:
        with session_scope() as s:
            if not is_seeded(s):
                logger.info("seeding demo data through ETL …")
                counts = seed_demo(s)
                logger.info("seed complete: %s", counts)
    yield


app = FastAPI(
    title="Reliat",
    version="1.0.0",
    description="Mining outlier substrate.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Holds the short-lived OAuth state between the redirect to the provider and
# the callback. SameSite=Lax so it survives the top-level redirect back from
# Google/GitHub; Secure in prod (Railway terminates TLS).
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.jwt_secret,
    same_site="lax",
    https_only=settings.backend_url.startswith("https"),
)

# Auth endpoints are public (you can't have a token before you log in).
app.include_router(auth_router)

# Everything else requires a valid bearer token.
_protected = [Depends(get_current_user)]
app.include_router(channels_router, dependencies=_protected)
app.include_router(outliers_router, dependencies=_protected)
# Ingest + analytics routers declare auth per-route so they can attribute
# the uploader and surface 401s cleanly. No global injection here.
app.include_router(ingest_router)
app.include_router(analytics_router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "reliat", "version": "1.0.0"}

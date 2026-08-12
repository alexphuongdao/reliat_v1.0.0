from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .bootstrap import bootstrap_identity
from .config import settings
from .db import init_db, session_scope
from .routes.auth import router as auth_router
from .routes.channels import router as channels_router
from .routes.harness import router as harness_router
from .routes.outliers import router as outliers_router
from .routes.usage import router as usage_router
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
    if settings.bootstrap_on_startup:
        with session_scope() as s:
            logger.info("identity bootstrap: %s", bootstrap_identity(s))
    yield


app = FastAPI(
    title="Reliat",
    version="1.0.0",
    description="Mining outlier substrate.",
    lifespan=lifespan,
)

# Authlib stores the OAuth `state` between /authorize and /callback in a
# signed cookie — that's what this is for. It is NOT the app's login
# session, which lives in the `sessions` table (see app/auth.py).
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    session_cookie="reliat_oauth_state",
    same_site="lax",
    https_only=settings.cookie_secure,
)

# Credentialed CORS: the browser will only send the session cookie
# cross-origin when the server names the exact origin back. A wildcard is
# illegal here, which is the correct constraint — keep RELIAT_CORS_ORIGINS
# pointed at the real UI origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(channels_router)
app.include_router(outliers_router)
app.include_router(usage_router)
app.include_router(harness_router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "reliat", "version": "1.0.0"}

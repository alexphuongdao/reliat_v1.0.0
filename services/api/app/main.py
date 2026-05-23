from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db, session_scope
from .routes.channels import router as channels_router
from .routes.outliers import router as outliers_router
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
    allow_origins=settings.cors_origins,
    allow_origin_regex=r".*",  # frontend runs from a local static server or file://
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(channels_router)
app.include_router(outliers_router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "reliat", "version": "1.0.0"}

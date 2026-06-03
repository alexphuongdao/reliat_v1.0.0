"""CSV upload + batch management endpoints.

POST   /api/ingest/csv           upload + parse + insert (auth required)
GET    /api/ingest/batches       list batches with summary stats
DELETE /api/ingest/batches/{id}  rollback a bad upload (cascades to rows)
"""
from __future__ import annotations

import hashlib
import uuid
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..ingest.csv_parser import parse_csv, synthesize_timestamp
from ..models import ChannelConfig, IngestBatch, PsdRow, User
from ..security import get_current_user

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

# Hard cap on per-row error entries we keep in the batch's error_report —
# a malformed 1M-row file shouldn't blow up the row by serializing 1M strings.
MAX_ERROR_ENTRIES = 100


def _ensure_channel_configs(session: Session, channel_names: set[str]) -> dict[str, ChannelConfig]:
    """Return a {name: config} map, creating defaults for any new channels."""
    existing = {
        c.channel_name: c
        for c in session.scalars(
            select(ChannelConfig).where(ChannelConfig.channel_name.in_(channel_names))
        ).all()
    }
    for name in channel_names:
        if name not in existing:
            cfg = ChannelConfig(channel_name=name, iterations_per_minute=1.0, display_name=name)
            session.add(cfg)
            existing[name] = cfg
    session.flush()
    return existing


@router.post("/csv")
async def upload_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty file")

    sha = hashlib.sha256(raw).hexdigest()
    # Idempotent: re-uploading the same bytes returns the prior batch.
    prior = session.scalars(select(IngestBatch).where(IngestBatch.sha256 == sha)).first()
    if prior is not None:
        return _batch_summary(prior, already_ingested=True)

    result = parse_csv(raw)
    if not result.rows and result.errors:
        # Header-level failure (e.g. missing required columns). Surface it.
        raise HTTPException(400, f"could not parse file: {result.errors[0].reason}")

    batch = IngestBatch(
        id=uuid.uuid4().hex,
        filename=file.filename or "upload.csv",
        sha256=sha,
        uploaded_by_user_id=user.id,
        detected_decimal=result.detected_decimal,
        detected_delimiter=result.detected_delimiter,
        detected_date_format=result.detected_date_format,
        rows_ingested=0,
        rows_skipped=result.rows_skipped,
        rows_duplicate=0,
        error_report={
            str(e.row_number): e.reason
            for e in result.errors[:MAX_ERROR_ENTRIES]
        },
    )
    session.add(batch)
    session.flush()

    channel_names = {r["channel_name"] for r in result.rows}
    configs = _ensure_channel_configs(session, channel_names)

    # Per (channel, date) we need the smallest count to anchor the time axis.
    # Combine what's already in the DB with what's in this upload.
    upload_min_counts: dict[tuple[str, Any], int] = {}
    for r in result.rows:
        key = (r["channel_name"], r["iteration_date"])
        prev = upload_min_counts.get(key)
        if prev is None or r["iteration_count"] < prev:
            upload_min_counts[key] = r["iteration_count"]

    db_min_counts: dict[tuple[str, Any], int] = {}
    for (cname, idate), upload_min in upload_min_counts.items():
        db_min = session.scalar(
            select(PsdRow.iteration_count)
            .where(
                PsdRow.channel_name == cname,
                PsdRow.iteration_date == idate,
            )
            .order_by(PsdRow.iteration_count.asc())
            .limit(1)
        )
        db_min_counts[(cname, idate)] = min(upload_min, db_min) if db_min is not None else upload_min

    # Pre-fetch existing (channel, count) pairs to skip duplicates cheaply.
    existing_pairs: set[tuple[str, int]] = set()
    for cname in channel_names:
        counts = session.scalars(
            select(PsdRow.iteration_count).where(PsdRow.channel_name == cname)
        ).all()
        for c in counts:
            existing_pairs.add((cname, c))

    inserted = 0
    duplicates = 0
    for r in result.rows:
        key = (r["channel_name"], r["iteration_count"])
        if key in existing_pairs:
            duplicates += 1
            continue
        cfg = configs[r["channel_name"]]
        anchor = db_min_counts[(r["channel_name"], r["iteration_date"])]
        ts = synthesize_timestamp(
            r["iteration_date"], r["iteration_count"], anchor, cfg.iterations_per_minute
        )
        row = PsdRow(
            **{k: v for k, v in r.items() if k != "iteration_date"},
            iteration_date=r["iteration_date"],
            synthesized_t=ts,
            ingest_batch_id=batch.id,
        )
        session.add(row)
        existing_pairs.add(key)
        inserted += 1

    batch.rows_ingested = inserted
    batch.rows_duplicate = duplicates
    session.commit()
    session.refresh(batch)

    return _batch_summary(batch, already_ingested=False)


@router.get("/batches")
def list_batches(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    batches = session.scalars(
        select(IngestBatch).order_by(IngestBatch.uploaded_at.desc())
    ).all()
    return [_batch_summary(b) for b in batches]


@router.delete("/batches/{batch_id}")
def delete_batch(
    batch_id: str,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    b = session.get(IngestBatch, batch_id)
    if b is None:
        raise HTTPException(404, "batch not found")
    session.delete(b)  # cascades to psd_rows via FK
    session.commit()
    return {"deleted": batch_id}


def _batch_summary(b: IngestBatch, already_ingested: bool = False) -> dict[str, Any]:
    return {
        "id": b.id,
        "filename": b.filename,
        "sha256": b.sha256,
        "uploaded_at": b.uploaded_at.isoformat() if b.uploaded_at else None,
        "uploaded_by_user_id": b.uploaded_by_user_id,
        "rows_ingested": b.rows_ingested,
        "rows_skipped": b.rows_skipped,
        "rows_duplicate": b.rows_duplicate,
        "detected_delimiter": _delim_label(b.detected_delimiter),
        "detected_decimal": b.detected_decimal,
        "detected_date_format": b.detected_date_format,
        "error_report": b.error_report or {},
        "already_ingested": already_ingested,
    }


def _delim_label(d: str) -> str:
    return {"\t": "tab", ",": "comma", ";": "semicolon"}.get(d, d)

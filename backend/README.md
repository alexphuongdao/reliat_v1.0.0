# reliat-backend

FastAPI service that feeds the locked frontend in `/frontend`. Two screens are live in v1.0.0: **Outliers** and **Channels**.

## Quick start (SQLite — zero infra)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

The first run auto-creates `reliat.db` and seeds 24h of measurements for 12 channels through the real ETL pipeline. Browse:

- http://localhost:8000/docs — OpenAPI
- http://localhost:8000/api/health
- http://localhost:8000/api/channels
- http://localhost:8000/api/outliers

## Pointing the frontend at it

Open `frontend/Reliat v1.html`. `data.jsx` reads `RELIAT_API_BASE` from `window` (default `http://localhost:8000`) and populates `window.ReliatData` from the API. If the API is unreachable it falls back to the mock substrate so the design still renders.

## Ingesting real data

Drop a CSV/TSV at `backend/sample_data.tsv` with columns:

```
channel_id  ts  F10  F20  F30  F40  F50  F60  F70  F80  F90  topsize  color_hue  color_sat  color_light  [sieve_<size>_passing …]
```

`ts` accepts ISO 8601 (`2026-05-21T02:47:14Z`) or epoch ms. Then:

```bash
python -m app.seed
```

The seeder ingests the real CSV first (if present), then tops up with synthesized minute-resolution rows so the screens have a full 24h to render.

## Switching to Postgres (target for production)

```bash
pip install -e .[postgres]
export RELIAT_DATABASE_URL=postgresql+psycopg://reliat:reliat@localhost:5432/reliat
uvicorn app.main:app --reload --port 8000
```

The schema is portable — no SQLite-specific code. The migration to Timescale hypertables for `measurements` and to `pgvector` for outlier embeddings is the next planned step (not required to render the two v1.0.0 screens).

## Architecture

```
parse_csv  ─►  ingest_rows ─► Measurement
                       │
                       └─► detect_outliers ─► Outlier
                                          │
api/channels ◄─── Channel + Measurement   │
api/outliers ◄────────────────────────────┘
```

`app/etl.py` is the only persistence path. Seeder and CSV both go through `ingest_rows`. The detector contract (`sev`, `type`, `confidence`, `summary`, `action`) is what the screens depend on — swap `detector.py` for a learned model without changing the API or the frontend.

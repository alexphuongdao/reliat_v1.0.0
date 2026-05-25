# reliat — api

FastAPI service. Feeds the original prototype in `/frontend` and (in-flight) the Next.js app under `/apps/web`. Two screens are live in v1.0.0: **Outliers** and **Channels**.

## Quick start (SQLite — zero infra)

```bash
cd services/api
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

The first run auto-creates `reliat.db` and seeds 24h of measurements for 12 channels through the real ETL pipeline. Browse:

- http://localhost:8000/docs — OpenAPI
- http://localhost:8000/api/health
- http://localhost:8000/api/channels
- http://localhost:8000/api/outliers

## Pointing a client at it

**Prototype** (`/frontend/Reliat v1.html`): `data.jsx` reads `RELIAT_API_BASE` from `window` (default `http://localhost:8000`) and populates `window.ReliatData` from the API. If the API is unreachable it falls back to the mock substrate so the design still renders. Serve it over HTTP (not `file://`): `cd frontend && python3 -m http.server 5173`.

**Next.js app** (`/apps/web`, in-flight): set `NEXT_PUBLIC_API_BASE` in `apps/web/.env.local`. CORS already wide open in dev.

## Ingesting real data

Drop a CSV/TSV at `services/api/sample_data.tsv` with columns:

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

## Deploying to Railway (recommended for v1.0.0)

The repo ships a `Dockerfile` Railway will detect automatically.

1. **Create the DB first** — sign up at [neon.tech](https://neon.tech), create a project, copy the connection string and paste it as-is. Neon hands you a `postgresql://…` URL; the app rewrites the scheme to the psycopg driver automatically (see `_use_psycopg_driver` in `app/config.py`), so no manual editing is needed.

2. **Create a Railway service from the GitHub repo**:
   - Root directory: `services/api`
   - Builder: Dockerfile (auto-detected)

3. **Set environment variables** in Railway:
   ```
   RELIAT_DATABASE_URL=<paste Neon's postgresql:// string as-is>
   RELIAT_CORS_ORIGINS=https://<your-app>.vercel.app
   RELIAT_SEED_ON_STARTUP=false

   # auth
   RELIAT_JWT_SECRET=<openssl rand -hex 32>
   RELIAT_BACKEND_URL=https://<your-railway-app>.up.railway.app
   RELIAT_FRONTEND_URL=https://<your-app>.vercel.app
   RELIAT_GOOGLE_CLIENT_ID=<from Google Cloud console>
   RELIAT_GOOGLE_CLIENT_SECRET=<from Google Cloud console>
   RELIAT_GITHUB_CLIENT_ID=<from GitHub OAuth app>
   RELIAT_GITHUB_CLIENT_SECRET=<from GitHub OAuth app>
   ```
   Don't seed the prod DB with mock data — keep `seed_on_startup` off.

   **Auth notes.** Identity lives in the backend: password accounts (bcrypt)
   and Google/GitHub OAuth (Authlib) share one `users` table, and every
   sign-in returns a signed JWT the SPA sends as `Authorization: Bearer`.
   Each OAuth provider only activates when both its `*_CLIENT_ID` and
   `*_CLIENT_SECRET` are set, so you can ship password-only first and add
   providers later. OAuth **redirect URIs** must be registered with each
   provider as `${RELIAT_BACKEND_URL}/api/auth/{google,github}/callback`.
   All routes except `/api/health` and `/api/auth/*` require a valid token.

4. Railway sets `$PORT` automatically; the Dockerfile `CMD` reads it.

5. Verify: `curl https://<your-railway-url>/api/health` → `{"ok": true, ...}`.

6. Wire the frontend: in Vercel, set `NEXT_PUBLIC_API_BASE` to the Railway URL.

### Why this stack
- **Compute on Railway**: $5/mo hobby plan, git-push-to-deploy, Dockerfile-driven, restart-on-crash, logs in the UI.
- **DB on Neon**: free tier, pgvector built in, decoupled so you can move compute later without touching data.
- **Render** works the same way if you prefer it — same Dockerfile, same env vars.

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

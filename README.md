# Reliat — v1.0.0

Mining outlier substrate. Two screens live: **Outliers** (triage inbox) and **Channels** (deep dive).

## Repo layout

```
services/
  api/        FastAPI backend — measurements, detector, outliers, triage
apps/
  web/        Next.js (App Router + TS) — in-flight migration target
  ios/        Capacitor wrapper — later, once web is stable
packages/
  api/        generated TypeScript API client — later
  config/     shared config — later
frontend/     ORIGINAL design (Babel-in-browser prototype) — source of truth
              during the web port; deleted once apps/web reaches parity
```

`frontend/` is locked: a PreToolUse hook in `.claude/settings.json` hard-blocks edits to the design files (tokens.css, ui.jsx, charts.jsx, app.jsx, screens/*.jsx, the HTML harness). Only `frontend/data.jsx` (the data seam) and new files are mutable. See `.claude/skills/frontend-design-locked/SKILL.md` for the contract.

## Run it locally

Two terminals.

```bash
# api — sqlite, seeds 24h × 12 channels on first boot
cd services/api
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --port 8000
```

```bash
# web — Next.js dev server
cd apps/web
pnpm install   # first run only
pnpm dev       # http://localhost:3000
```

The original prototype still works too, served as static files:

```bash
cd frontend && python3 -m http.server 5173
# open http://localhost:5173/Reliat%20v1.html
```

## Migration status

| Phase | Status | What |
| --- | --- | --- |
| 0 — Restructure + Next.js scaffold | ✓ done | `services/api/`, `apps/web/` scaffolded, tokens.css + Geist wired, boot verified |
| 1 — Visual parity (all screens) | ✓ done | All 6 screens, charts, app shell, routes, ⌘K palette, ⌘J drawer — pixel-faithful port |
| 2.5 — Deploy prep | ✓ done | Dockerfile, env-driven CORS, typed API client in `apps/web/lib/api.ts`, deploy docs |
| 2 — Componentize | | extract `ui/` per-component, split inline screen helpers |
| 3 — API client + live data | | swap `buildMock()` for `api.*()` calls; outlier triage PATCH |
| 4 — Responsiveness | | mobile-web at 390/430 widths |
| 5 — Capacitor prep | | manifest, safe areas, iOS webview audit |

## Deploy

| Tier | Host | Cost (v1.0.0 traffic) |
| --- | --- | --- |
| Frontend (`apps/web`) | **Vercel** — auto-detects Next.js, no config needed | free |
| Backend (`services/api`) | **Railway** — Dockerfile is in the repo | ~$5/mo hobby |
| Database | **Neon** — serverless Postgres with pgvector | free tier |

Deploy order: **DB → backend → frontend**. Each one needs the previous one's URL.

### 1. Database — Neon

Create a project at [neon.tech](https://neon.tech), copy the connection string, convert prefix to `postgresql+psycopg://` (SQLAlchemy driver name).

### 2. Backend — Railway

- New service from GitHub repo, root directory `services/api`.
- Env vars:
  ```
  RELIAT_DATABASE_URL=postgresql+psycopg://<…>?sslmode=require
  RELIAT_CORS_ORIGINS=https://<your-vercel-app>.vercel.app
  RELIAT_SEED_ON_STARTUP=false
  ```
- Railway sets `$PORT` automatically. Verify with `curl https://<railway-url>/api/health`.
- See `services/api/README.md` for the full walkthrough.

### 3. Frontend — Vercel

- New project from GitHub repo, root directory `apps/web`.
- Env vars:
  ```
  NEXT_PUBLIC_API_BASE=https://<your-railway-url>
  ```
- Vercel auto-detects Next.js 16. No `vercel.json` needed.

### Local dev still works exactly as before — the env defaults cover `localhost:8000` ↔ `localhost:3000`.

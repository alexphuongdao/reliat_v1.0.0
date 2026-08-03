# Reliat — System Overview

Three questions this doc answers: how the codebase is laid out, how AI
token usage is measured, and how Docker actually runs this stack. Written
as ground truth for what's on disk right now, not aspirational.

---

## 1. Codebase structure

```
reliat_v1.0.0/
├── docker-compose.yml       # the only way compute runs — see §3
├── .env                     # ANTHROPIC_API_KEY, POSTGRES_PASSWORD (gitignored)
│
├── services/api/            # backend — FastAPI + SQLAlchemy + Alembic
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, router mounting, startup seed
│   │   ├── config.py             # Settings (env-driven: RELIAT_* + ANTHROPIC_API_KEY)
│   │   ├── db.py                 # SQLAlchemy engine/session, Base
│   │   ├── models.py             # ORM tables: Channel, Measurement, Outlier, OutlierDiagnosis
│   │   ├── schemas.py            # Pydantic response shapes (camelCase, mirrors frontend types)
│   │   ├── etl.py                # RawRow → Measurement + Outlier, single ingest entry point
│   │   ├── detector.py           # rule-based z-score outlier detector (placeholder, not ML)
│   │   ├── diagnostic_agent.py   # the AI agent — see §2
│   │   ├── seed.py               # synthetic demo data generator (12 channels, fake PSD curves)
│   │   ├── ingest_minitab.py     # one-off loader for the real CEMEX .xls export
│   │   └── routes/
│   │       ├── channels.py       # GET /api/channels, /series, /psd
│   │       ├── outliers.py       # GET/PATCH /api/outliers, POST .../diagnose
│   │       └── usage.py          # GET /api/usage — token/cost visibility (§2)
│   ├── alembic/                  # schema migrations (source of truth for the DB shape)
│   │   ├── env.py                # wired to app.config.settings + app.models.Base.metadata
│   │   └── versions/             # d322dfbb1a19_baseline_schema.py = all current tables
│   ├── Dockerfile
│   └── pyproject.toml
│
├── apps/web/                # frontend — Next.js 16 (App Router) + React 19
│   ├── app/                      # routes: /channels /outliers /agent /pulse /library /notes
│   ├── components/
│   │   ├── screens/               # one file per screen (OutliersScreen.tsx etc.)
│   │   └── shell/                 # app chrome, nav, command palette context
│   ├── lib/
│   │   ├── api.ts                 # typed fetch client for services/api
│   │   ├── types.ts               # TS types mirroring the backend's Pydantic schemas
│   │   └── mockData.ts            # design-time mock data (fallback if the API is unreachable)
│   └── Dockerfile
│
├── frontend/                # LOCKED design source — do not edit (enforced by a Claude Code
│                             # hook, .claude/hooks/frontend_design_lock.py). apps/web/components
│                             # is a live port of this; new work happens there, not here.
│
├── backend/                 # legacy — pre-monorepo scaffold, superseded by services/api.
│                             # Not built, not run, not referenced by docker-compose.yml.
│
└── docs/v1.0.0-plan.md      # original pre-MVP planning doc (stack recommendations, phased
                              # delivery plan). Some decisions there (Fly.io, Clerk, Timescale)
                              # were superseded by what's actually implemented below.
```

**Data flow, one request:**
`apps/web` (browser) → `NEXT_PUBLIC_API_BASE` (baked in at build time) → `services/api`
FastAPI routes → SQLAlchemy → Postgres. The Diagnostic Agent route additionally calls
out to the Anthropic API mid-request.

**Real data:** `services/api/app/ingest_minitab.py` loaded 21,138 real rows from a MINITAB
`.xls` export (single channel, `CV42 Tunnel`) into `measurements`, with the channel's
baseline (`base_f80`/`base_topsize`) recalibrated to that real data's own mean — the
synthetic seed data's baseline (`78.2`) was on a completely different scale and would
have made the detector useless on real rows.

---

## 2. How token in/out counting works

**The source of truth is the Anthropic API response itself**, not an estimate. Every
call in `diagnostic_agent.py::run_diagnosis()` does:

```python
resp = client.messages.create(model=..., max_tokens=2048, tools=[...], ...)
resp.usage.input_tokens   # exact — Anthropic counts and returns this
resp.usage.output_tokens  # exact — same
```

Those two integers are stored, unmodified, on every row of the `outlier_diagnoses`
table (`input_tokens`, `output_tokens` columns) — one row per Diagnostic Agent run.
Nothing is sampled or averaged; it's a full audit log of every call ever made.

**Cost (`cost_usd`) is a derived estimate, not billing truth.** It's computed as:

```python
cost = input_tokens/1e6 * price_in  +  output_tokens/1e6 * price_out
```

using a per-model price table in `diagnostic_agent.py` (`PRICE_PER_MTOK`). This table
is my best approximation of Anthropic's published rates — it is **not** guaranteed to
match your actual bill. The authoritative number is always
**https://console.anthropic.com/settings/usage**. Treat `cost_usd` as "close enough to
budget by," and reconcile against the console periodically.

**Where to actually look:**

| View | What it shows |
|---|---|
| `GET /api/usage` | Aggregate totals (calls, tokens, cost) across **all** runs, broken down by model, plus the last 50 runs individually. This is the dashboard. |
| Outliers screen → expand an outlier → "AI explanation" | That one diagnosis's model, `input+output tokens`, and `$cost`, inline. |
| `outlier_diagnoses` table directly | `SELECT model, input_tokens, output_tokens, cost_usd, created_at FROM outlier_diagnoses ORDER BY created_at DESC;` — the raw log, if you want to query it yourself. |
| console.anthropic.com/settings/usage | Ground truth billed spend. |

**Model defaults to the cheapest tier** (`claude-haiku-4-5-20251001`, set in
`config.py::Settings.diagnostic_model`), overridable via `RELIAT_DIAGNOSTIC_MODEL` in
`.env` if you want to escalate to Sonnet for harder cases. Measured so far: Haiku
~$0.008/diagnosis, Sonnet ~$0.03/diagnosis, for the same real-data grounding.

**Reliability note:** the agent forces structured output via a single required tool
call (`submit_diagnosis`) rather than free-text JSON parsing. Even so, the model has
been observed to occasionally deviate from the declared schema (a hypothesis returned
as a bare string instead of an object, a response truncated at `max_tokens`). The
parser in `diagnostic_agent.py` defends against both — malformed runs are stored with
`status="error"` and a real `error` message instead of crashing or silently corrupting
data, and every attempt (successful or not) still logs its real token usage.

---

## 3. How Docker runs this stack

**Everything is defined in one file: `docker-compose.yml` at the repo root.** There is
no other way compute runs in this project — no bare `uvicorn`, no bare `next dev`, in
the intended workflow.

```
docker compose up -d --build
```

brings up three containers on a private bridge network (`reliat`):

| Service | Image / build | Host port | What it is |
|---|---|---|---|
| `postgres` | `pgvector/pgvector:pg16` (official image) | `55432` → `5432` | Postgres 16 with the `pgvector` extension pre-installed. Data persists in a named volume `pgdata` — survives `docker compose down` (not `down -v`). |
| `api` | built from `services/api/Dockerfile` | `8000` → `8000` | Python 3.11-slim, installs `services/api` via `pip install ".[postgres,xls]"`. |
| `web` | built from `apps/web/Dockerfile` | `3300` → `3000` | Multi-stage: Node 20.11.1-alpine, pnpm 9.15.4 pinned via `corepack`, Next.js `output: "standalone"` build. |

**Why host ports are non-default (`55432`, `3300` instead of `5432`, `3000`):** other
local processes already held `5432` and `3000` on this machine when the stack was
first brought up. Only the *host*-side mapping changed — containers still talk to each
other on the standard `5432`/`3000`/`8000` internally, via Docker's internal DNS
(`postgres`, `api`, `web` service names resolve to each other automatically on the
`reliat` network).

**Startup ordering:** `depends_on: condition: service_healthy` — `api` won't start
until `postgres` passes its `pg_isready` healthcheck; `web` won't start until `api`
passes its own `/api/health` healthcheck. This is why a fresh `docker compose up`
brings everything up in the right order with no manual steps.

**Migrations run automatically, every start:** the `api` container's command is

```
sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
```

so the schema is always current before the app serves traffic. Migrations live in
`services/api/alembic/versions/` and are the actual source of truth for the DB shape
(not `Base.metadata.create_all`, though that still runs harmlessly on startup too, as
a no-op if Alembic already created everything).

**Dev-mode live reload for the API only:** `services/api/app` is bind-mounted into the
container (`./services/api/app:/app/app`), and uvicorn runs with `--reload`. Editing a
`.py` file on the host takes effect in the running container within ~1 second, no
rebuild needed. The `web` container has no such mount — Next.js's production build is
static, so any frontend change requires `docker compose build web && docker compose up
-d web`.

**Why the frontend needs a rebuild but the API doesn't:** Next.js bakes
`NEXT_PUBLIC_API_BASE` into the compiled client JavaScript bundle at *build* time (it's
passed as a Docker build `arg`, not a runtime `environment` var — see the `web.build.args`
block in `docker-compose.yml`). A runtime env var would have no effect on an
already-built bundle, so this had to be a build-time value from the start.

**Secrets:** `ANTHROPIC_API_KEY` and `POSTGRES_PASSWORD` live in a root `.env` file
(gitignored — confirmed via `git check-ignore`), read by Compose's `${VAR}`
interpolation. The `api` container fails fast at compose-parse time
(`${ANTHROPIC_API_KEY:?...}`) if the key is missing, rather than starting and failing
confusingly later on the first diagnose call.

**What's containerized vs. not:** the real `.xls` ingestion (`ingest_minitab.py`) was
run once, manually, against the Postgres container's published port
(`localhost:55432`) from the host Python environment — not baked into the image or
run automatically on every `docker compose up`. The data it wrote lives in the
`pgdata` volume, so it persists across container rebuilds/restarts regardless of how
it got there.

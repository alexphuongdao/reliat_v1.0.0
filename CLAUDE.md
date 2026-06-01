# Reliat — repo-level context for Claude Code

Mining outlier substrate: a 24/7 web app for surfacing and triaging anomalies
in conveyor-belt particle-size and color data on a mine site. Monorepo
deployed to Vercel (frontend) + Railway (backend) + Neon (Postgres).

Read this file first; it encodes the durable decisions of the project so a
fresh session doesn't have to relearn them.

## Repo layout

```
services/api/   FastAPI backend (Python 3.11). Owns the data + auth.
apps/web/       Next.js 16 (App Router, React 19). The user-facing app.
apps/ios/       Capacitor wrapper — later.
frontend/       ORIGINAL design (vanilla JS prototype). LOCKED — see below.
.claude/        Hooks, skills, settings, the design-lock enforcement.
```

`frontend/` is the source of truth for the design language. `apps/web/` is
an in-flight port that must match it pixel-for-pixel. Once `apps/web/`
reaches parity end-to-end, `frontend/` is deleted.

## Critical rules (don't violate without asking)

1. **Design lock.** `/frontend/tokens.css`, `/frontend/ui.jsx`,
   `/frontend/charts.jsx`, `/frontend/app.jsx`, and `/frontend/screens/*.jsx`
   are immutable. A PreToolUse hook hard-blocks edits to them. Only
   `frontend/data.jsx` (the data seam) and brand-new files reusing the
   existing tokens/primitives are allowed. See
   `.claude/skills/frontend-design-locked/SKILL.md` for the full contract.
2. **`main` is production.** Every push to `main` auto-deploys to Railway
   (backend) and Vercel (frontend). There is no staging. CI runs the build
   gate on each push.
3. **Secrets live in dashboards, never in this repo or chat.** Database
   URLs, JWT secret, OAuth client secrets all live in Railway env vars.
   `.env.example` documents the *names* of vars; `.env` is gitignored.
4. **Don't edit `/frontend` and don't push to feature branches.** Work on
   `main` directly or short-lived branches that PR into `main`.

## Deploy topology

| Tier | Host | Root dir | Triggers on |
|---|---|---|---|
| Frontend (`apps/web`) | Vercel | `apps/web` | push to `main` |
| Backend (`services/api`) | Railway | `services/api` (Dockerfile) | push to `main` |
| Database | Neon (Postgres + pgvector) | — | provisioned once |

`apps/web` calls the backend at `NEXT_PUBLIC_API_BASE`. The backend trusts
the frontend origins listed in `RELIAT_CORS_ORIGINS`. Both must be set on
their respective platforms; nothing else wires them together.

## Env-var contract

**Railway (backend):**
```
RELIAT_DATABASE_URL       postgresql:// from Neon, pasted as-is
                          (config.py rewrites the scheme to use psycopg v3)
RELIAT_CORS_ORIGINS       comma-separated frontend origins
RELIAT_SEED_ON_STARTUP    false in prod
RELIAT_JWT_SECRET         openssl rand -hex 32
RELIAT_BACKEND_URL        https://<railway-url>  (for OAuth redirect_uri)
RELIAT_FRONTEND_URL       https://<vercel-url>   (where OAuth bounces back)
RELIAT_GOOGLE_CLIENT_ID   / _CLIENT_SECRET       (optional; off if blank)
RELIAT_GITHUB_CLIENT_ID   / _CLIENT_SECRET       (optional; off if blank)
```

**Vercel (frontend):**
```
NEXT_PUBLIC_API_BASE      https://<railway-url>
```

## Architecture decisions

**Auth lives on the backend.** FastAPI owns identity: bcrypt for passwords,
Authlib for Google/GitHub OAuth, PyJWT-signed access tokens. The SPA stores
the JWT and sends it as `Authorization: Bearer <token>`. Reasoning: backend
already owns the data (single source of truth); no vendor lock-in; full UI
control to match the locked design. Hardening path: once the app moves to
`reliat.com` + `api.reliat.com` (one registrable domain), switch from Bearer
to httpOnly cookies. Until then cross-site cookies are not worth the
SameSite/ITP pain.

**DB schema evolves via `create_all()`.** No Alembic yet. Adding *new*
tables is safe (auto-created on startup); changing *existing* columns will
need a migration tool — defer that decision until needed.

**Postgres URL normalization.** Neon hands you `postgresql://...` which
SQLAlchemy maps to psycopg2 by default; we ship psycopg v3. A field
validator in `config.py` rewrites the scheme automatically — paste the
provider's string unedited.

## Milestone state

| | Status | What |
|---|---|---|
| Phase 0 — restructure | ✓ | services/api + apps/web scaffolded |
| Phase 1 — visual parity | ✓ | all 6 screens ported with mock data |
| 2.5 — deploy prep | ✓ | Dockerfile, env-driven CORS, deploy docs |
| A — auth backend | ✓ | users table, JWT, gated routes, OAuth scaffolding |
| **B — auth frontend** | **next** | Login/Register screens + auth guard so `/login` is the first screen |
| C — OAuth provider apps | user task | Google Cloud + GitHub OAuth apps; secrets to Railway |
| 2 — componentize | | extract per-component files; split inline screen helpers |
| 3 — wire real data | | swap `buildMock()` → authenticated `api.*()` calls |
| 4 — responsiveness | | mobile-web at 390/430 widths |
| 5 — Capacitor prep | | iOS wrapper |

## Run locally

```bash
# backend (sqlite by default, seeds 24h × 12 channels on first boot)
cd services/api
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000

# frontend
cd apps/web
pnpm install
pnpm dev    # http://localhost:3000
```

The web app uses **pnpm**, not npm. No root `package.json` — each subproject
manages its own deps.

## Conventions

- Commits: imperative subject line, ~70 chars. Body explains *why* if
  non-obvious. The session URL footer is appended automatically.
- No emojis in code, comments, or commit messages unless explicitly asked.
- Comments only when the *why* is non-obvious; don't narrate the *what*.
- Prefer editing existing files over creating new ones.
- TypeScript and Python both target what's actually installed (TS 5, py 3.11).

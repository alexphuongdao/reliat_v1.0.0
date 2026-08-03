# Reliat — Infra / Hosting Plan

Where we are: a 3-container Docker Compose stack (`postgres` w/ pgvector,
FastAPI `api`, Next.js `web`), running locally. This doc is "how do we get
this in front of CEMEX and other prospects without a rewrite."

The original plan (`docs/v1.0.0-plan.md`) assumed a different shape (Fly.io +
Clerk + a separate landing app). That's superseded — we now have exactly the
3 services above, already containerized, already `docker-compose.yml`-defined.
The hosting choice should be "run this same Compose file, hosted," not a
re-architecture.

---

## TL;DR recommendation

**Now (demo/pilot, 0-2 customers):** Railway. It runs Docker Compose-shaped
apps almost as-is, gives you a public HTTPS URL per service, has a managed
Postgres with extension support (pgvector included), and costs single-digit
dollars/month at this scale. Fastest path from "works on my laptop" to
"here's a link, Joshua."

**Later (paying pilot with real plant data flowing continuously, uptime
matters):** move `postgres` to a dedicated managed provider (Neon, Supabase,
or RDS) separate from compute, keep `api`/`web` on Railway or move to
Fly.io/Render — decouple storage from compute so a redeploy can never touch
data.

**Much later (multiple industrial customers, data-residency asks):** proper
cloud (AWS/GCP) with VPC isolation, and a real conversation with CEMEX-type
customers about whether their data can leave their network at all — mining/
cement operators sometimes require on-prem or single-tenant deployment. Don't
build for this now; just don't paint ourselves into a corner (see "Don't
lock in" below).

---

## Options considered

| Option | Fit for current Compose file | Managed Postgres + pgvector | Cost at this scale | Effort to migrate to |
|---|---|---|---|---|
| **Railway** | Near 1:1 — reads `docker-compose.yml`-shaped services, or Dockerfiles directly | Yes, add-on Postgres supports extensions | ~$5-20/mo | Lowest — point it at the repo, set env vars |
| **Render** | Good — one Dockerfile per service (Blueprint YAML) | Yes | ~$7-25/mo (no full free tier for DBs anymore) | Low — similar to Railway |
| **Fly.io** | Good, but Compose → `fly.toml` per service is manual translation | Yes (Fly Postgres or bring-your-own) | ~$0-15/mo (generous free allowances) | Medium — more manual config, more control |
| **AWS/GCP (ECS/Cloud Run + RDS/Cloud SQL)** | Poor fit today — real infra-as-code investment | Yes, most mature option | Higher fixed cost, more ops | High — right move only once we need VPC/compliance |
| **Vercel (web only) + something else (api/db)** | Splits the stack — Next.js on Vercel, API+DB elsewhere | N/A (Vercel doesn't host Postgres) | Cheap for web, adds a second provider to manage | Medium, and adds cross-provider CORS/latency to reason about |

Ruled out for now: full AWS/GCP (no current requirement justifies the ops
overhead), splitting web onto Vercel (adds a second provider for no benefit
while we're still one small stack).

---

## What actually changes when we deploy

1. **`NEXT_PUBLIC_API_BASE`** is baked into the web build at build time
   (see `OVERVIEW.md` §3). Once the API has a real hosted URL, this build
   arg must point to it, not `http://localhost:8000`. Every environment
   (local, staging, prod) needs its own build if the API URL differs.

2. **`RELIAT_CORS_ORIGINS`** on the API must include the real hosted web
   URL(s) — this bit us locally already (Compose had it hardcoded to the
   wrong port). Same class of bug, bigger blast radius if missed in prod:
   the UI would silently fail every API call.

3. **Secrets** (`ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`, DB connection
   string) move from a local `.env` file to the host's secret manager
   (Railway/Render/Fly all have one built in). Never commit them, never put
   them in the Dockerfile.

4. **Migrations on boot** (`alembic upgrade head` in the API's start
   command) already work anywhere — no change needed, this is
   infra-agnostic by design.

5. **The `pgdata` volume** becomes a managed database instead of a local
   Docker volume — this is the one component that isn't "just run the same
   containers somewhere else," because you want backups, point-in-time
   recovery, and no risk of losing the real CEMEX dataset to a bad deploy.

---

## Don't lock in

Two decisions now will save pain later, regardless of which host we pick:

- **Keep Postgres connection config entirely in `RELIAT_DATABASE_URL`**
  (already true, via `config.py`) — this means switching from Railway's
  Postgres to Neon/RDS later is a one-line env var change, not code.
- **Keep both services as plain Dockerfiles**, not provider-specific config
  (already true) — this means we're never more than a few hours from moving
  hosts entirely if pricing or a customer's compliance requirement forces it.

---

## Cost/ops reality check

At current scale (1 real dataset, low query volume, Diagnostic Agent calls
priced in cents — see `OVERVIEW.md` §2), infra cost is not the constraint;
**time-to-a-working-demo-link is.** Railway gets there in under an hour from
this repo. Optimize for that first, revisit the "later" tier once there's a
second paying customer or a specific data-residency requirement on the
table.

# Reliat — Run Manual

Two separate things to start: the **app** (Docker) and the **landing page
prototype** (plain static file, not dockerized). Start both from the repo
root: `~/workfolder/reliat_v1.0.0`.

---

## Part 1 — The app (Docker)

Requires Docker Desktop running and a `.env` file at the repo root (copy
`.env.example`).

### Start

```bash
docker compose up -d --build
```

First run builds all three images (~2-4 min). Subsequent runs are fast
(~10s) unless you changed a Dockerfile or dependencies.

### Check it's healthy

```bash
docker compose ps
```

All three services (`postgres`, `api`, `web`) should show `healthy` or `running`.

### Open it

| What | URL |
|---|---|
| App (UI) | http://localhost:3300 |
| API directly | http://localhost:8000/api/health |
| API docs (Swagger) | http://localhost:8000/docs |

### Sign in

The app requires a login. Two profiles are created automatically on first
startup:

| Username | Password | Sees |
|---|---|---|
| `cemex` | `Cemex-Reliat-2026!` | The CEMEX plant data only |
| `admin` | `Admin-Reliat-2026!` | Every customer (platform superadmin) |

These are **demo credentials in a git-tracked file** — fine for a local demo,
change them before this faces any real network. Override with
`RELIAT_SEED_CEMEX_PASSWORD` / `RELIAT_SEED_ADMIN_PASSWORD` in `.env`.

> Passwords are only applied when a profile is **first created**. Changing
> the env var later won't reset an existing user — wipe with
> `docker compose down -v` (destroys all data) or update the row directly.

**To switch between the two profiles**, use **Switch account** in the account
menu (top right), or go straight to http://localhost:3300/login?switch=1.
Plain `/login` redirects you back into the app while you still have a live
session, so it won't show you a form.

### Add another customer

No UI for this yet — it's API-only. Sign in as `admin` first to get a
session cookie:

```bash
curl -s -c admin.jar -X POST http://localhost:8000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"Admin-Reliat-2026!"}'

curl -s -b admin.jar -X POST http://localhost:8000/api/auth/tenants \
  -H 'content-type: application/json' \
  -d '{"slug":"acme","name":"Acme Cement"}'
# → {"id":"tn_…", …}   use that id below

curl -s -b admin.jar -X POST http://localhost:8000/api/auth/tenants/<TENANT_ID>/users \
  -H 'content-type: application/json' \
  -d '{"username":"acme","email":"ops@acme.local","password":"Acme-Reliat-2026!","role":"owner"}'
```

A new customer starts with **no channels**, so their screens are empty until
data is ingested for them.

### Turn on Google / Microsoft sign-in

Off by default — the login page shows no OAuth buttons until a provider is
configured. Register this redirect URI with the provider:

```
http://localhost:8000/api/auth/oauth/<provider>/callback
```

then fill in `RELIAT_OAUTH_GOOGLE_*` or `RELIAT_OAUTH_MICROSOFT_*` in `.env`
and `docker compose up -d api`. OAuth only signs in users who **already
exist** — it never creates accounts.

### Watch logs

```bash
docker compose logs -f api      # backend + diagnostic agent calls
docker compose logs -f web      # frontend
docker compose logs -f          # everything
```

### Stop

```bash
docker compose down
```

Data persists (Postgres volume `pgdata` is untouched). Use `docker compose
down -v` only if you want to wipe the database too — this deletes the real
ingested CEMEX data, so don't run it casually.

### Made a backend code change?

Nothing to do — `services/api/app` is bind-mounted and uvicorn runs with
`--reload`. Save the file, it's live in ~1s.

### Made a frontend code change?

```bash
docker compose build web && docker compose up -d web
```

Next.js is a static production build, so it needs a rebuild every time
(unlike the API).

---

## Part 2 — Landing page prototype (not dockerized)

Lives in `"Reliat landing-page prototype/"`. Its "Enter platform" / "Explore
historical incidents" links point at the app on `localhost:3300`, so **start
Part 1 first** or those links won't resolve.

The served file (`Reliat Storyboard.dc.html`) is a **build artifact** —
source of truth is the per-scene files in `src/`. Edit those, then:

```bash
cd "Reliat landing-page prototype"
python3 build.py
```

regenerates the served file byte-for-byte from the parts (see that folder's
`README.md` for the full file-by-file breakdown). Never hand-edit `Reliat
Storyboard.dc.html` directly — the next `build.py` run overwrites it.

### Start

```bash
cd "Reliat landing-page prototype"
python3 -m http.server 4173 --bind 127.0.0.1
```

### Open it

http://localhost:4173/Reliat%20Storyboard.dc.html

### Stop

`Ctrl+C` in that terminal (or `pkill -f "http.server 4173"` if backgrounded).

This isn't managed by Docker or any process supervisor — if your machine
sleeps/restarts, just re-run the `http.server` command above.

---

## Common issues

| Symptom | Fix |
|---|---|
| `ANTHROPIC_API_KEY must be set` at startup | Add it to root `.env` (copy `.env.example`) |
| Port already in use | Something else on your machine owns `3300`/`8000`/`55432`/`4173` — stop it, or edit the port mapping |
| UI loads but shows stale/mock data | API call failed silently and the UI fell back to mock data — check `docker compose logs api` |
| "Run Diagnostic Agent" errors | Check `ANTHROPIC_API_KEY` is valid and `docker compose logs api` for the real error |
| Landing page's "Enter platform" link does nothing / errors | Part 1 (Docker app) isn't running — start it first |
| Bounced to `/login` immediately after signing in | Cookie isn't reaching the API. Check `RELIAT_CORS_ORIGINS` names the exact origin you're browsing (`http://localhost:3300`) — with credentials, a wildcard is illegal |
| Signed in but every screen is empty | Expected for a customer with no channels. Confirm with `curl -b <jar> http://localhost:8000/api/channels` |
| Forgot the demo password | It's in the Sign in table above. If it was changed, reset the row in Postgres or `docker compose down -v` to re-bootstrap (destroys all data) |
| Docker containers won't start after sleep/restart | Docker Desktop itself may need relaunching: `open -a Docker`, wait ~15s, then retry `docker compose up -d` |

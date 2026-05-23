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
| 1 — Visual parity (screens, no refactor) | next | Outliers → Channels → Agent → Pulse → Library → Notes |
| 2 — Componentization | | extract `ui/`, `charts/`, `shell/` |
| 3 — API client + data layer | | typed fetch under `apps/web/lib/api.ts` |
| 4 — Responsiveness | | mobile-web at 390/430 widths |
| 5 — Capacitor prep | | manifest, safe areas, iOS webview audit |

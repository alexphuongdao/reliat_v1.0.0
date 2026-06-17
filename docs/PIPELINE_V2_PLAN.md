# Reliat Pipeline V2 — Multi-Machine + Two-Phase AI

> The structural pivot from V1. V1 proved we can turn one machine's raw export
> into a statistical dashboard. V2 wires *three* machine classes — Mills,
> Hammers, Conveyor Belts — into a single cross-correlated graph, then layers
> two distinct AI roles on top: a **Diagnostic Agent** (Phase 1) that explains
> *why* outliers happen, and a **Downtime Predictor** (Phase 2) that turns
> that explanation into a dollar value.

---

## 0 · End-to-end picture

```
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  Mills   │    │ Hammers  │    │  Belts   │   ← machine class
   └────┬─────┘    └────┬─────┘    └────┬─────┘
        │ CSV/SCADA      │ CSV           │ CSV (PsdRow today)
        ▼                ▼               ▼
   ┌──────────────────────────────────────────┐
   │       MachineReading store               │   ← generalized PsdRow
   │   (per-machine schema, common envelope)  │
   └────────────────┬─────────────────────────┘
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
   ┌────────────┐         ┌───────────────────────┐
   │ per-machine│         │ cross-machine analytics│
   │ analytics  │         │ correlations, lag,    │
   │ (V1 reuse) │         │ aggregate KPIs, joins │
   └────┬───────┘         └─────────┬─────────────┘
        │                           │
        ▼                           ▼
   ┌────────────┐         ┌───────────────────────┐
   │  Channels  │         │ Site dashboard        │
   │  surface   │         │ + Cross-machine view  │
   │  (V1 reuse)│         └───────────────────────┘
   └────────────┘
                    ▲
                    │ artifacts
                    │
         ┌──────────┴──────────────┐
         │                         │
   ┌──────────────────┐    ┌──────────────────────┐
   │ Phase 1 — Agent  │    │ Phase 2 — Predictor  │
   │ Diagnostic       │    │ Downtime + \$/min     │
   │  • why outliers? │    │  • next-N-hour P(trip)│
   │  • harm?         │    │  • dollar saved      │
   │  • internet rsch │    │  • intervention sched│
   └──────────────────┘    └──────────────────────┘
```

Both AI phases consume the **same analytics endpoints** the dashboard uses. AI never invents data — it composes existing computed signal + cross-machine joins + targeted external research into artifact-shaped answers.

---

## 1 · What stays, what generalizes, what's new

### 1.1 Stays as-is

- `apps/web` Next.js 16 frontend, shell, auth, locked-design tokens.
- All four V1 chart components: `SpcChart`, `PsdCurveChart`, `MultiMetricGrid`, `MetricRangeBadge`. These are *machine-class-agnostic* by design — they consume a `SeriesWithBands` / `SpcSeries` / `PsdCurve` shape and don't care which machine produced it.
- The 5 V1 analytics engine entry points (`channel_summary`, `series_with_bands`, `spc_series`, `psd_curve`, `excursions`). These become *per-machine-class* implementations behind a common interface.
- `ChannelConfig` becomes `MachineConfig` (generalized).
- `IngestBatch` + sha256 idempotency.

### 1.2 Generalizes

- `PsdRow` (belt-specific 36 columns) → `BeltReading` (specialization of) `MachineReading`. The other two specializations are `MillReading` and `HammerReading`.
- `/api/channels/*` → `/api/machines/*` with `?type=` filter.
- `/api/analytics/*` gains a `machine_type` dimension.
- `Channels` screen → `Machines` screen (Site → Type → Unit nav).

### 1.3 New surfaces

- **Site dashboard** — top-of-funnel surface aggregating Mills + Hammers + Belts into one health summary.
- **Cross-machine view** — correlation / lag / Sankey-style flow across machine classes.
- **Agent screen rebuild** — diagnostic conversation with artifact-shaped returns.
- **Downtime forecast screen** — probability timeline + dollar savings ticker.

---

## 2 · Frontend / UX restructure (uses current design — extends with new types only where required)

### 2.1 New surface map

| Surface | Purpose | Status |
|---|---|---|
| `/pulse` | Design parity, mock data. Unchanged. | ship |
| `/site` *(new)* | Cross-machine aggregate health (Mills+Hammers+Belts) | new |
| `/machines` *(rename from /channels)* | Per-machine analytics dashboard. Same body as V1, with a Machine-Type tab at the top. | refactor |
| `/correlate` *(new)* | Cross-machine correlation / lag explorer | new |
| `/agent` | Conversational diagnostic agent. Renders artifacts. | rebuild |
| `/forecast` *(new)* | Downtime probability timeline + dollar savings ticker | new |
| `/outliers` | Persistent triage feed. Same model, multi-machine. | refactor |
| `/library` | Uploads + machine configs + users + prefs | extend |

### 2.2 New chart components (extend the design)

| Component | Purpose | Reuses |
|---|---|---|
| `SiteHealthRing` | Three concentric arc rings (Mills/Hammers/Belts) with per-class severity | tokens |
| `CrossMachineHeatmap` | Time × machine matrix, cell intensity = z-score | tokens + SpcChart math |
| `LagCorrelationChart` | Two series with adjustable lag slider; Pearson r readout | SpcChart axis primitives |
| `DowntimeProbTimeline` | Stacked-area probability over next N hours, with intervention markers | SpcChart axis primitives |
| `SavingsTicker` | Rolling-7d dollar-saved counter with breakdown by intervention | KPI-card primitives |
| `AgentArtifact` *(wrapper)* | Renders any of the above inline in chat | nothing new — composition only |

### 2.3 What is *not* new

- No new fonts, palette, spacing, or token additions.
- No charting library dependency — all SVG, hand-written.
- No new icon families.

The license to extend the design is being used **only for new chart types that the problem requires**, exactly as authorized.

---

## 3 · Subagent team workstreams

Five teams. Designed to run in parallel after a short shared-foundation phase. Each team has independently-testable acceptance criteria and minimal cross-team dependencies after week 1.

```
       week 1         week 2         week 3         week 4
F (foundation)──┐
                ├─► A (Mills/Hammers ingest)─────────────►
                ├─► B (Multi-machine UI)───────────────────►
                ├─► C (Agent Phase 1)─────────────────────►
                ├─► D (Downtime Phase 2)──────────────────►
                └─► E (Infra/governance)────────────────────►
```

### Team F — Foundation (week 1, blocking)

| ID | Task | Acceptance |
|---|---|---|
| F.1 | Generalize `PsdRow` → `MachineReading` polymorphic base + `BeltReading`/`MillReading`/`HammerReading` specializations | existing `/api/analytics/*` for belts unchanged; new tables created via `create_all()` |
| F.2 | Generalize `ChannelConfig` → `MachineConfig` (type, display, cadence, dollar-per-minute-downtime) | migration script for existing rows; Library config table updated |
| F.3 | `/api/machines/*` route family added; `/api/channels/*` aliased to it with `?type=belt` for backward compat | both URL families return identical shapes for belts |
| F.4 | Frontend `lib/api.ts` extended with `api.machines.*` (kept `api.channels` aliased) | typecheck green; existing screens unchanged in behavior |
| F.5 | Decide migration strategy: hand-rolled SQL vs Alembic | written decision in `docs/MIGRATIONS.md` |

**Owner: 1 backend-leaning subagent. Duration: 4 days. All other teams wait on F.1 + F.3.**

### Team A — Mills + Hammers ingest (weeks 2–3)

| ID | Task | Acceptance |
|---|---|---|
| A.1 | Mill schema: ingest CSV with `mill_id`, `motor_amps`, `feed_rate_tph`, `vibration_rms`, `bearing_temp_C`, `liner_wear_pct`, `trip_event` | parser tests against synthetic + real (once provided) |
| A.2 | Hammer schema: `hammer_id`, `gap_inches`, `wear_pct`, `last_serviced_at`, `position_event` | parser tests; ingest endpoint live |
| A.3 | Per-machine `summary` / `series_with_bands` / `spc_series` reuse the engine; only schema mapping differs | per-machine SPC chart renders for mill data with same component code as belts |
| A.4 | Excursion detector extended to mill-class metrics (motor_amps, vibration_rms, bearing_temp) | excursions surface on Outliers screen with `machine_type` tag |
| A.5 | Iteration cadence editor in Library extended to mill / hammer rows | Library Channels section becomes Machines section |

**Owner: 1 subagent. Blocks on F.1, F.3.**

### Team B — Multi-machine UI restructure (weeks 2–3)

| ID | Task | Acceptance |
|---|---|---|
| B.1 | `/site` dashboard with `SiteHealthRing` driven by per-class summary endpoints | empty-state → CTA to Library; populated state → 3-ring health |
| B.2 | `/machines` (renamed from `/channels`) with machine-type tab at the top: Belts \| Mills \| Hammers | same KPI strip + SPC + PSD + multi-metric grid per type |
| B.3 | `/correlate` with `CrossMachineHeatmap` + `LagCorrelationChart` driven by `/api/analytics/correlate?a=mill:1&b=belt:CV42` | user can sweep lag slider, see Pearson r update live |
| B.4 | Sidebar updates to reflect new nav (Site / Machines / Correlate / Outliers / Forecast / Agent / Library) | existing keyboard shortcuts preserved |
| B.5 | Per-machine-type color palette assignment (deterministic hash, V1 pattern extended) | machines have stable color across screens |

**Owner: 1 subagent. Blocks on F.4.**

### Team C — AI Phase 1, Diagnostic Agent (weeks 2–4)

| ID | Task | Acceptance |
|---|---|---|
| C.1 | `services/api/app/agent/` provider-abstracted LLM client (Claude default, GPT/on-prem swap-able) | `agent.ask(question, context)` works end-to-end against a fixture session |
| C.2 | Agent tool registry: `analytics.spc`, `analytics.psd`, `analytics.excursions`, `correlation.lookup`, `research.web_search`, `research.fetch_url` | each tool is invokable from the agent loop with documented JSON schemas |
| C.3 | Artifact protocol: agent returns ordered list of `{type, props}` where type ∈ {spc, psd, kpi, table, markdown}; frontend renders inline | round-trip demo: "why is CV42 F80 high right now?" returns markdown + SPC chart + correlation table |
| C.4 | Web-research tool: targeted geology/mineralogy lookups (cite source), throttled, with result caching | demo shows agent citing a real geology source for an "iron oxide content correlates with hardness" claim |
| C.5 | `/agent` screen rebuild: conversation surface + artifact renderer + scope chips (Site / Machine / Time-window) | conversation history persists per user |
| C.6 | Harm assessment: agent must classify each excursion as: cosmetic / efficiency-loss / downstream-equipment-risk / safety-risk — with the cross-machine signal it used to decide | each diagnostic answer ends with a `harm` field in the artifact list |

**Owner: 1 subagent (AI-heavy). Blocks on F.3 + A.4 (needs real cross-machine excursions to diagnose against).**

### Team D — AI Phase 2, Downtime Predictor (weeks 3–4)

| ID | Task | Acceptance |
|---|---|---|
| D.1 | Historical trip-event ingest (mill_trip_event + elevator_alarm_event tables) | endpoint accepts SCADA-export CSV with `t`, `machine_id`, `event_type`, `duration_min` |
| D.2 | Feature builder: for each historical trip, compute the 1h/4h/24h cross-machine signal preceding it | offline notebook in `services/api/notebooks/feature_eng.ipynb` reproducible from raw data |
| D.3 | Baseline predictor: logistic regression on hand-engineered features (motor_amps drift, F80 σ, hammer wear age, belt color anomaly score) | held-out AUC > 0.7 on synthetic baseline; ready for real data validation |
| D.4 | `/forecast` screen: `DowntimeProbTimeline` (next 6h, 24h, 7d) + `SavingsTicker` rolling 7-day | dollar value = `Σ(prevented_trips × \$/trip)` where `\$/trip` is per-machine config |
| D.5 | Intervention scheduler: surface "if you adjust hammer N by X over the next M minutes, predicted probability drops from P1 to P2" | rendered as artifact + action button (button is no-op for now; integration is Phase 3) |
| D.6 | Model governance: model_versions table, validation suite, rollback path | running prediction includes `model_version` in its artifact |

**Owner: 1 subagent (ML-heavy). Blocks on A.1–A.4 and a customer-provided historical trip log.**

### Team E — Infra, governance, quality (continuous)

| ID | Task | Acceptance |
|---|---|---|
| E.1 | Migrate `Base.metadata.create_all()` → Alembic; baseline migration from current schema | `alembic upgrade head` reproduces production schema bit-exact |
| E.2 | Audit log table: every Agent answer + Predictor decision records inputs, tool calls, model version, user, timestamp | log table queryable from Library |
| E.3 | LLM cost dashboard: per-user, per-day spend; warning at configurable threshold | Library prefs page; surfaces real-time cost |
| E.4 | Multi-tenant isolation: site-level row-level security; one customer cannot see another's machines | regression test for cross-tenant access denial |
| E.5 | Synthetic-data fixture generator for Mills / Hammers / Belts | `python -m app.fixtures.synth --days=30 --site=demo` writes a usable dataset for demos when real data isn't yet available |
| E.6 | Performance: ensure `/api/analytics/*` queries against 10M-row corpus return < 500ms p95 | benchmark script in `services/api/tests/perf/` |

**Owner: 1 subagent (Infra-leaning). Touches all other teams' boundaries — runs continuously.**

---

## 4 · Critical-path dependencies

```
F (week 1)
  ├── A.1, A.2  →  A.3, A.4  →  A.5
  ├── B.1, B.2  →  B.3, B.4  →  B.5
  ├── C.1, C.2  →  C.3       →  C.4, C.5, C.6
  ├── D.1       →  D.2, D.3  →  D.4, D.5  →  D.6
  └── E (continuous)
```

| Phase 1 deliverable (week 3-end) | A.1+A.2+A.3 ingestion working for a 2nd machine class + B.1+B.2 site surface + C.1+C.2+C.3 agent answering with embedded SPC artifact |
| Phase 2 deliverable (week 4-end) | D.3+D.4 downtime forecast surfacing dollar savings on synthetic-history validation, ready for real customer-history validation |

---

## 5 · Risks and gating

| Risk | Mitigation |
|---|---|
| Customer mill/hammer data shapes differ from what we expect | F.5 synthetic fixture generator (E.5) keeps us building until real data arrives |
| LLM cost explodes on large dashboards | E.3 cost dashboard + per-question token budgets baked into C.1 client |
| Predictor over-fits on small history | D.6 model governance enforces hold-out validation + version pinning before any prediction reaches a customer |
| Customer-data confidentiality during agent web research | C.4 web tool sends *only* anonymized signal descriptions, never raw rows or customer identifiers |
| Cross-machine schema explosion | F.1 polymorphic base keeps the analytics engine machine-class-agnostic; per-class specializations are thin |

---

## 6 · Acceptance criteria for "Pipeline V2 done"

1. Three machine classes (Mill, Hammer, Belt) ingest and analyze through the same backend abstraction with shared chart components.
2. Site dashboard renders cross-machine health with no V1 changes regressing.
3. Diagnostic agent answers "**why** is metric X out of spec right now?" with embedded charts + cited research + harm classification.
4. Downtime predictor surfaces P(trip in next 6h) with a dollar-savings projection, validated against a held-out slice of customer historical data.
5. Every AI decision is logged (E.2), bounded by cost monitoring (E.3), and reproducible from its inputs.
6. Locked design constraints respected: no new tokens, no new fonts, no new icon family. New chart types only where the problem requires (allowed and used per the standing exemption).

---

## 7 · How to spin this up

1. Spawn Team F first (single subagent, 4-day target). Block all other team launches behind F.1 + F.3.
2. Once F is green on `main`, fan out: launch Teams A, B, C, D, E as **5 parallel subagents** with the prompts in `docs/SUBAGENT_PROMPTS/` (to be added in a follow-up).
3. Each team works in short-lived branches; merge into `main` is gated on:
   - the team's own acceptance criteria,
   - cross-team API contract still satisfied (no breaking changes to `/api/analytics/*` shapes without a versioned route),
   - the build + test gate on `main` staying green.
4. Daily synthesis: one subagent acts as the integrator, reviewing the previous day's merges, surfacing collisions, and updating this plan.

---

*This document is the source of truth for Pipeline V2 milestone scope. Updates land via PR with full context in the commit body.*

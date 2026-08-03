# Reliat — Data Schema

Ground truth as of this writing: introspected directly from the running Postgres
container (`\d+` on every table), not copy-pasted from `models.py` — if the two ever
disagree, the database is right and the model is stale. Regenerate this doc the same
way if you change the schema.

**ORM source:** `services/api/app/models.py`
**Migration source of truth:** `services/api/alembic/versions/d322dfbb1a19_baseline_schema.py`
**Live database, right now:** `postgresql://reliat:reliat_dev_password@localhost:55432/reliat`
(the `postgres` container's host-published port — see `docker-compose.yml`)

## How to audit it yourself

```bash
# psql directly
PGPASSWORD=reliat_dev_password psql -h localhost -p 55432 -U reliat -d reliat

# or point any GUI client (TablePlus, DBeaver, Postico) at:
#   host=localhost  port=55432  db=reliat  user=reliat  password=reliat_dev_password
```

That password is the local dev default in `.env` (`POSTGRES_PASSWORD`) — fine as-is
for a laptop-only Postgres container, but don't reuse it if this ever gets deployed
anywhere reachable.

---

## Entity-relationship diagram

```mermaid
erDiagram
    CHANNELS ||--o{ MEASUREMENTS : "has many"
    CHANNELS ||--o{ OUTLIERS : "has many"
    MEASUREMENTS |o--o{ OUTLIERS : "triggered (optional)"
    OUTLIERS ||--o{ OUTLIER_DIAGNOSES : "has many (re-runnable)"

    CHANNELS {
        varchar32 id PK
        varchar128 name
        varchar64 belt
        varchar64 color
        float8 base_f80
        float8 base_topsize
        bool online
        varchar8 shift
    }
    MEASUREMENTS {
        int id PK
        varchar32 channel_id FK
        timestamp t
        float8 f80
        float8 topsize
        json psd
        varchar40 color_hsl
        float8 color_hue
        float8 color_sat
        float8 color_light
        varchar32 source
        int iteration_count "nullable"
        float8 sd_ratio_10_5 "nullable"
        float8 video_r "nullable"
        float8 video_g "nullable"
        float8 video_b "nullable"
        json sieve_passing_raw "nullable"
    }
    OUTLIERS {
        varchar32 id PK
        varchar32 channel_id FK
        timestamp t
        varchar32 metric
        varchar16 unit
        float8 value
        float8 baseline
        float8 deviation
        varchar16 sev
        varchar64 type
        float8 confidence
        varchar16 status
        varchar64 assignee "nullable"
        varchar1024 summary
        varchar512 action
        int measurement_id FK "nullable"
    }
    OUTLIER_DIAGNOSES {
        varchar40 id PK
        varchar32 outlier_id FK
        timestamp created_at
        varchar16 status
        varchar64 model
        varchar2048 root_cause
        json hypotheses
        float8 confidence
        varchar1024 recommended_action
        varchar4096 evidence_summary
        int input_tokens
        int output_tokens
        float8 cost_usd
        varchar2048 error "nullable"
    }
```

---

## Table-by-table

### `channels`

One row per conveyor-belt PSD analyzer. Currently 12 rows: 11 synthetic-demo
channels + `cv42` (the one real channel, real data).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | varchar(32) | PK | e.g. `"cv42"` — short slug, used as the FK target everywhere |
| `name` | varchar(128) | not null | e.g. `"CV42 Tunnel"` — display name |
| `belt` | varchar(64) | not null | e.g. `"Primary"`, `"Mill"`, `"Unknown"` (real-data fallback) |
| `color` | varchar(64) | not null | CSS var string for chart color, e.g. `"var(--ch-1)"` |
| `base_f80` | float8 | not null | **Learned baseline**, not a fixed constant — for `cv42` this is the mean F80 across all 21,138 real rows (`~1.06`), recalibrated by `ingest_minitab.py` at ingest time. Synthetic channels keep their curated registry value (e.g. `78.2`). Used as the detector's sigma floor. |
| `base_topsize` | float8 | not null | same idea, for Topsize |
| `online` | bool | not null | |
| `shift` | varchar(8) | not null | |

### `measurements`

The raw time series. One row per instrument reading. **21,138 of these rows are
real** (`source='cemex_minitab'`); the rest are synthetic demo data
(`source='synthetic'`, the default).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | int (serial) | PK | |
| `channel_id` | varchar(32) | FK → `channels.id`, `ON DELETE CASCADE` | |
| `t` | timestamp | not null | indexed (`ix_measurements_t`, and composite `ix_measurements_channel_t`) |
| `f80` | float8 | not null | the headline PSD percentile |
| `topsize` | float8 | not null | |
| `psd` | **json** | not null | canonical chart-ready shape — see below |
| `color_hsl` | varchar(40) | not null | pre-formatted `hsl(...)` string for direct CSS use |
| `color_hue` / `color_sat` / `color_light` | float8 | not null | for real rows, these are the vendor's actual `AverageHue`/`AverageSaturation`/`AverageLightness` values, not derived |
| `source` | varchar(32) | not null | `"synthetic"` or `"cemex_minitab"` — **this is how you tell real data from demo data in any query** |
| `iteration_count` | int | nullable | real-data only — the vendor's own monotonic counter (`ChannelIterationCount`), not contiguous (gaps are normal, real instrument behavior) |
| `sd_ratio_10_5` | float8 | nullable | real-data only — PSD distribution-shape ratio |
| `video_r` / `video_g` / `video_b` | float8 | nullable | real-data only — raw camera RGB averages (distinct from the derived HSL fields, which exist for both real and synthetic rows) |
| `sieve_passing_raw` | **json** | nullable | real-data only — the vendor's raw 17-column sieve set, see below |

**`psd` JSON shape** (present on every row, real or synthetic — this is what the PSD
curve chart component actually reads):

```json
{
  "percentiles": { "F10": 0.2342, "F20": 0.5931, "...F30..F90": "..." },
  "sieves": [
    { "size": 1.0, "passing": 11.196 },
    { "size": 2.5, "passing": 37.995 },
    "... 15 canonical mm sizes from 1.0mm to 160mm ..."
  ]
}
```
`sieves` here is always on the same canonical 15-point mm grid regardless of source,
so the chart contract never changes. For real rows, the *curve shape* is still
F80-derived (interpolated), **not** a literal remapping of the vendor's raw inch-based
sieve columns — the units and grid points don't line up 1:1 (vendor sizes are
0.0165in–6.000in ≈ 0.42mm–152mm at 17 irregular points; the canonical grid is a
different 15 points). The literal vendor values live in `sieve_passing_raw` instead,
should something ever need the un-interpolated real curve.

**`sieve_passing_raw` JSON shape** (real rows only, raw vendor column names as keys):

```json
{
  "6_000in": 86.615852, "5_000in": 70.680878, "4_000in": 64.075691,
  "3_500in": 64.075691, "3_000in": 59.724606, "2_500in": 53.088028,
  "2_000in": 50.686943, "1_750in": 47.659107, "1_500in": 44.596661,
  "1_250in": 37.915321, "1_000in": 31.075102, "0_750in": 24.725285,
  "0_500in": 17.661123, "0_250in": 10.384421, "0_187in": 8.777562,
  "0_0937in": 5.874516, "0_0165in": 2.090399
}
```

### `outliers`

Detected anomalies. Currently 1,513 real rows (from the rule-based detector in
`detector.py` running over the real CV42 data) plus whatever synthetic outliers exist
per demo channel.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | varchar(32) | PK | `"OUT-" + 12 hex chars` (uuid4-derived, fixed after a real ID-collision bug found during the real-data backfill — see git history on `detector.py`) |
| `channel_id` | varchar(32) | FK → `channels.id`, CASCADE | indexed |
| `t` | timestamp | not null | indexed |
| `metric` | varchar(32) | not null | which field fired, e.g. `"F80"`, `"Topsize"`, `"Hue avg"` |
| `unit` | varchar(16) | not null | |
| `value` / `baseline` / `deviation` | float8 | not null | `deviation` is in sigma |
| `sev` | varchar(16) | not null | `critical` / `warn` / `info` |
| `type` | varchar(64) | not null | classification, e.g. `"Topsize excursion"`, `"Color shift"` — see `detector.EXPLANATIONS`/`SUGGESTED` dicts for the canned-text mapping |
| `confidence` | float8 | not null | the *detector's* confidence (rule-based heuristic), unrelated to the Diagnostic Agent's confidence below |
| `status` | varchar(16) | not null | `open` / `acknowledged` / `resolved` / `dismissed` |
| `assignee` | varchar(64) | nullable | |
| `summary` / `action` | varchar(1024) / varchar(512) | not null | **canned text**, keyed off `type` — this is the pre-AI placeholder explanation, still shown as a fallback in the UI when no real diagnosis has been run yet |
| `measurement_id` | int | FK → `measurements.id`, `ON DELETE SET NULL`, nullable | the specific reading that fired |

### `outlier_diagnoses`

The Diagnostic Agent's output. **This is the only AI-generated table.** One outlier
can have several rows here (re-run after a model change, etc.) — the API surfaces the
latest by `created_at`.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | varchar(40) | PK | `"DIAG-" + 12 hex chars` |
| `outlier_id` | varchar(32) | FK → `outliers.id`, CASCADE, indexed | |
| `created_at` | timestamp | not null | |
| `status` | varchar(16) | not null | `complete` or `error` (truncated response, schema-drift, API failure — see `diagnostic_agent.py`'s defensive parsing) |
| `model` | varchar(64) | not null | the actual model string used for that run, e.g. `"claude-haiku-4-5-20251001"` |
| `root_cause` | varchar(2048) | not null | the single best hypothesis, 1-2 sentences |
| `hypotheses` | **json** | not null | array of ranked hypotheses — see below |
| `confidence` | float8 | not null | model's own stated confidence, 0-1 |
| `recommended_action` | varchar(1024) | not null | |
| `evidence_summary` | varchar(4096) | not null | |
| `input_tokens` / `output_tokens` | int | not null | **exact**, from `resp.usage` — see `OVERVIEW.md` §2 |
| `cost_usd` | float8 | not null | **estimated**, not billing truth — see `OVERVIEW.md` §2 |
| `error` | varchar(2048) | nullable | populated when `status='error'` |

**`hypotheses` JSON shape** (array, 1-4 items):

```json
[
  {
    "cause": "Camera/lighting fault (lens fouling, dust buildup, or illumination dimming) causing simultaneous loss of saturation, lightness, and hue signal...",
    "confidence": 0.55,
    "supporting_evidence": "Saturation falls from 0.075 (-13s) to 0.020 (+2s) and lightness from 0.140 to 0.032 -- a >70% drop -- while RGB channels barely change...",
    "contradicting_evidence": "..."
  }
]
```
`contradicting_evidence` is optional per hypothesis (often absent on the top-ranked
one). Field-level note: this JSON is defensively parsed on the way in — the model has
been observed to occasionally return a hypothesis as a bare string instead of an
object, or omit `contradicting_evidence` entirely. `diagnostic_agent.py::run_diagnosis`
normalizes all of that before it's stored, so every row here is guaranteed to match
this shape even though the raw model output isn't always guaranteed to.

---

## What's *not* in the schema (deliberately, for now)

Things discussed earlier in planning that did **not** get built, so you don't go
looking for them:

- **No multi-tenant tables** (`organizations`, `users`, `org_llm_budgets`). This is a
  single-pilot-customer, single-channel system right now — that infrastructure was
  scoped out as premature for the current scale, not forgotten.
- **No `incidents`/`process_impacts` tables** (the "Phase 2 Impact Agent" concept from
  earlier planning). Only root-cause diagnosis (Phase 1) exists; downstream-impact
  prediction is unbuilt.
- **No vector/embedding column anywhere**, despite running on `pgvector/pgvector:pg16`
  (chosen so the extension is available when needed). No "find similar past outliers"
  feature exists yet — `hypotheses` and `hypotheses`-adjacent text are plain text, not
  embedded.
- **`agent_sessions`/`agent_messages`** (chat-thread tables) — the Agent screen in the
  frontend still runs on mock data; there's no persisted chat/session concept in the DB
  at all yet. Relevant to the NoSQL question below.

---

## Do we need NoSQL?

Short answer: **not at this scale, and Postgres is already doing the "NoSQL" job where
it's actually needed** — `psd`, `sieve_passing_raw`, and `hypotheses` are all `json`
columns holding variable-shaped, nested data right inside the relational tables. That's
the standard pattern for "some of my objects are semi-structured" without standing up
a second database.

**One concrete gap worth fixing regardless of the NoSQL question:** those columns are
Postgres `json`, not `jsonb`. `json` stores the exact text and re-parses it on every
read; `jsonb` stores a parsed binary form, is faster to query, and — critically — is
the only one that can be indexed (e.g. a GIN index to query "outliers where hypothesis
confidence > 0.5" without a full table scan). Right now every JSON field is
write-once/read-whole (the app never queries *inside* the JSON), so `json` costs
nothing today — but it's a one-line type change in `models.py` + a migration, worth
doing before anything starts querying inside these blobs.

**On `agent_sessions`/chat history specifically** (the case you flagged): this is the
one place a document store's pitch is genuinely stronger than usual — a chat thread is
naturally a single growing document (ordered messages, each with heterogeneous
tool-call payloads), not a set of rows you join. But:

- It's not built yet at all — there's nothing to migrate, so this is a "which one do
  I build first" decision, not a "which one do I move to" decision.
- A `jsonb` column on a conventional `agent_sessions` row (`messages jsonb`, appended
  to per turn) gets you 90% of the document-store ergonomics — one row per session,
  one blob per session, no joins — while staying in the same database, same backup
  story, same connection pool, same transaction boundary as everything else you
  already have. This is exactly the pattern `outlier_diagnoses.hypotheses` already
  uses successfully.
- The actual argument *for* a dedicated document/NoSQL store (Mongo, DynamoDB, etc.)
  shows up when you have (a) genuinely high write volume of unstructured documents
  where Postgres's row/page overhead starts to matter, (b) a need to horizontally
  shard that specific workload independent of the rest of the schema, or (c) query
  patterns *within* the documents that outgrow what `jsonb` + GIN indexes handle. None
  of those are true here yet — one pilot customer, one channel, no chat feature even
  built.

**Recommendation:** build `agent_sessions`/`agent_messages` as ordinary Postgres
tables with a `jsonb` payload column when that feature actually gets built, same as
everything else. Revisit a dedicated NoSQL store only if a specific, measured
bottleneck shows up (matches the original `docs/v1.0.0-plan.md` §10 stance on
avoiding infra additions before they're load-bearing — that reasoning still holds
here). Standing up a second database today would mean two backup stories, two
connection pools, and a cross-database join (session → which outlier it discussed)
for a feature that doesn't exist yet.

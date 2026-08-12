# 2026-08-03 — Per-tenant agent harness, and separating real data from the demo

The ask: prove multi-tenancy end to end. CEMEX sees only its real data and says
"unavailable" where it has none; a test account sees the mock fleet; the AI
agent works on both; and the harness itself differs per tenant, because the data
does.

It works. Both agents ran against the live API and produced different, correct
diagnoses from different context.

## What changed

| File | Change |
|---|---|
| `services/api/app/harness.py` | **New.** Per-tenant agent profile: evidence fields, metric glossary, failure categories, operating rules, context policy, model. System prompt and tool schema are *generated* from the profile. |
| `services/api/app/provision_demo.py` | **New.** Creates the `demo` tenant + `test` user, moves the 11 synthetic channels out of CEMEX, seeds them through the real ETL. Idempotent. |
| `services/api/app/routes/harness.py` | **New.** `GET /api/harness` — the caller's own profile, so the UI can show which harness produced a diagnosis. No id parameter to tamper with. |
| `services/api/app/diagnostic_agent.py` | Resolves the harness from the channel's tenant. Window size, prompt, tool schema, and model all come from it. Adds prompt caching and cache-aware cost. |
| `services/api/app/db.py` | `init_db()` is now SQLite-only. On Postgres it is a no-op — Alembic owns the schema. |
| `services/api/tests/test_harness_isolation.py` | **New.** 20 tests pinning harness selection, evidence boundaries, prompt/schema contents, and context bounds. |
| `apps/web/app/(app)/layout.tsx` | Drops `buildMock()`. Passes only static commands + user. |
| `apps/web/components/shell/AppShell.tsx` | Loads the caller's real channels/outliers for the palette and agent drawer. Fails soft. |
| `apps/web/lib/commands.ts` | **New.** The ⌘K entries that are genuinely UI, extracted from the mock module. |
| `apps/web/components/ui.tsx` | **New** `Unavailable` — distinct from loading and from error. |
| `apps/web/components/screens/OutliersScreen.tsx` | Replaces the two hardcoded fakes with `Unavailable`. |
| `docker-compose.yml` | Mounts `services/api/alembic` so a new revision applies on restart. |
| `docs/manual.md` | Documents the `test` account and what each account actually sees. |

## The central idea

**The model is data-agnostic. The harness is not.**

CEMEX's rows carry 17 inch-keyed sieve columns, `SDRatio10_5`, and raw video
RGB, with F80 around 1.0 mm. The demo plant's rows have all of those NULL, with
F80 between 21 and 116 mm. Hand the demo tenant CEMEX's prompt and the model is
instructed to cite measurements that do not exist on a single one of its rows —
it either reports "n/a" across the board or invents them.

So the harness carries: which evidence columns exist, what the metrics mean,
what the site's operating rules are, how wide the window is, and which failure
categories are permitted. The system prompt and the tool schema are *generated*
from that profile, so adding a tenant is data, not prose.

## Decisions worth remembering

**The failure-category enum is the agent's action space, enforced in the tool
schema.** Each tenant's `submit_diagnosis` tool carries that tenant's categories
as a JSON-schema `enum`. The model classifies; it does not invent a taxonomy.
A returned category outside the tenant's set is dropped rather than stored, so
nothing downstream can group by a category that doesn't exist for that site.
This is `docs/PlatformArchitecture.md` §3.3's "taxonomy as action space" at
small scale — when the shared knowledge plane exists, these tuples become
`failure_modes` rows.

**An unprofiled tenant gets `GENERIC`, never another tenant's profile.** The
next customer is signed but their format is unknown. The fallback is
deliberately conservative — core fields only — and its prompt tells the model to
say it is running without site context and keep confidence low. A silent
inheritance of CEMEX's instrument assumptions would be worse than no profile.

**Absent evidence is omitted, not rendered as "n/a".** `format_window` emits
only the harness's own fields, and the vendor sieve block is dropped entirely
for a site without vendor columns. An absent section cannot be misread as a
measurement; a column of "n/a" invites the model to reason about why it is
missing.

**Prompt caching on the system block.** System prompt + tool schema are
identical across every diagnosis within a tenant, so a cache breakpoint after
them makes each subsequent call re-read that prefix at ~10% of input price.
Cost accounting now folds in cache writes at 1.25× and reads at 0.10× so
`cost_usd` stays comparable across cached and uncached runs.

**Window size is a harness decision, not a global constant.** CEMEX samples
sub-minute, the demo plant once a minute. "20 samples" is ~4 minutes on one site
and 20 minutes on the other. `WINDOW_BEFORE`/`WINDOW_AFTER` module constants are
gone.

**Two schema authorities is one too many.** `init_db()` ran
`Base.metadata.create_all` on every startup, which created `source_assets`
outside the migration — and then Alembic's own `create_table` failed with
`DuplicateTable`, leaving the database half-migrated. `init_db()` is now
SQLite-only.

## Bug found during verification

**The API container was silently running migrations it did not have.** Compose
mounted `services/api/app` but not `services/api/alembic`, so the container ran
`alembic upgrade head` against whatever revisions were baked in at image build
time and reported `b7f31c904e2a (head)` while a newer revision existed on disk.
It looked up to date. It was one behind. Fixed by mounting the alembic
directory.

Recovery, in order: dropped the stray empty `source_assets` table (verified 0
rows first), fixed `init_db()`, restarted, and let Alembic apply
`4c7a2e1b9d31` properly. All 21,138 real rows intact throughout.

Also fixed: `provision_demo` reported `demo_outliers: 0` for 45 outliers it had
just created — the session is `autoflush=False`, so the count ran before the
rows flushed. Added an explicit flush.

## Verified

**The duplicate-row question, open for two sessions, is now answered:**

```
total_measurements=21138
duplicate_key_groups=0
excess_rows=0
```

Zero duplicates. The real ingest ran exactly once, so `uq_measurements_channel_t`
applied without a de-dup step. Schema now at `4c7a2e1b9d31` with
`source_asset_id` and the unique constraint present.

**Data separation** (`psql`, live):

| tenant | channels | measurements | outliers |
|---|---|---|---|
| cemex | 1 (`cv42`) | 21,138 real | 1,513 |
| demo | 11 | 15,840 synthetic | 45 |
| acme | 0 | 0 | 0 |

**Isolation probes** (live API):

| Probe | Result |
|---|---|
| `demo` → `GET /api/channels/cv42/series` | 404 |
| `demo` → `GET /api/channels/cv42/psd` | 404 |
| `cemex` → `GET /api/channels/cv66/series` | 404 |
| `demo` → `POST /api/outliers/<cemex-id>/diagnose` | 404 — blocked *before* spending credits |
| no cookie → `/api/channels`, `/api/harness` | 401 |

404 throughout, never 403, so ids can't be enumerated.

**Both agents ran for real** against `claude-haiku-4-5-20251001`:

| | CEMEX | Demo |
|---|---|---|
| input tokens | 3,135 | 2,079 |
| cost | $0.0097 | $0.0071 |
| evidence cited | Topsize, F80, SDRatio10_5, VideoR/G/B, vendor sieve curve | F80, Topsize, Hue, Sat, Light only |
| F80 scale reasoned about | 1.623 mm | 32.2 mm |
| categories returned | `upstream_blast`, `process_control`, `equipment`, `instrument` | `equipment`, `feed_material`, `process_control`, `instrument` |

CEMEX used `upstream_blast` — a category that **does not exist in the demo
harness**. The demo diagnosis cited no sieve, SDRatio, or RGB anywhere, because
its harness never offered them. Same model, same code path, different context,
correctly different output.

**Mock removal**, checked against the shipped bundle rather than the source:

| String | Files in `.next/static` |
|---|---|
| `6% draw on CV28` | 0 |
| `Karingal` | 0 |
| `SAG Feed` (hardcoded) | 0 |
| `Impact prediction is not built yet` | 1 |

**Tests:** `27 passed, 3 xfailed`. `tsc --noEmit` clean.

## Verified in the browser

The Chrome extension reconnected on a retry (the first failure was transient —
Chrome's extension service worker had not registered yet). All three accounts
driven through the real UI at `localhost:3300`:

| Account | Breadcrumb | Channels live | Channel vitals | F80 scale |
|---|---|---|---|---|
| `admin` | All customers | 11 / 12 | all 12, both tenants | mixed |
| `cemex` | CEMEX | **1 / 1** | CV42 Tunnel only | 2.3–3.4 mm |
| `test` | Demo Plant | **10 / 11** | 11 channels, **no CV42** | 21–116 mm |

`admin` seeing all 12 is correct, not a leak: `/api/auth/me` returns
`allTenants: true, tenant: null` for the superadmin.

**Agent run from the UI, per tenant** — the harness difference is visible in the
rendered output, not just in the API:

| | CEMEX (`OUT-2D0F6591C525`) | Demo (`OUT-1628523FD81E`) |
|---|---|---|
| Cites `SDRatio10_5` | **yes** — "SDRatio10_5 stable at 1.258" | **no** |
| Cites video RGB | **yes** — "(Hue, Sat, Light, RGB) all remain stable" | **no** |
| Cites vendor sieve | no (not in this window) | **no** |
| Values reasoned about | Topsize 3.403 mm, F80 1.623 mm | F80 38.6 → 32.2 mm, Topsize 75.5 → 61.5 mm |
| Top hypothesis | oversize from upstream blast, 50% | screen blinding, 72% |
| Cost shown in UI | — | 3,040 tokens · $0.0069 |

The demo diagnosis mentions SDRatio, RGB, and sieve **zero times**, because its
harness never offered those fields.

**Unavailable panels** render on both tenants: 2 per outlier detail, with the
old `+6% draw on CV28` string absent from the DOM.

**Switch-account** (`/login?switch=1`, the 2026-07-30 fix) works with a live
session and correctly reads "Currently signed in as … Signing in below switches
accounts."

## Still open
- **The per-tenant harness is a Python registry, not a database.** Fine for two
  tenants and a decision that should be revisited before there are ten. It
  belongs in the control plane (`PlatformArchitecture.md` §3.1) so a profile can
  be edited without a deploy.
- **The harness is not surfaced in the UI yet.** `GET /api/harness` exists and
  returns the full profile; nothing renders it. Showing "diagnosed under the
  CEMEX profile · 9 evidence fields · 6 categories" next to an artifact is the
  natural next step and makes the tenant-specific behaviour visible in a demo.
- **The Agent chat screen is still a local placeholder.** No conversation
  endpoint. The harness is wired to the single-outlier diagnostic path only.
- **`acme` is a leftover** from isolation testing on 2026-07-30 — empty tenant,
  empty user. Harmless, but it will show up in any superadmin tenant list.
- **The three ingest xfails are unchanged.** The unique constraint now exists in
  Postgres, but `ingest_rows` still has no `ON CONFLICT DO NOTHING`, so an
  overlapping re-export raises `IntegrityError` and aborts the batch. Slice 2.
- Still no CI.

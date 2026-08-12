# Reliat — Platform Architecture

The master plan. A multi-tenant industrial data platform with agents: plug in
any plant data, get grounded diagnosis, impact estimation, and auditable
recommended actions — with each customer's data isolated and governed.

**Supersedes** `docs/DataArchitecture.md` §6.2 (which recommended row-level
security on a shared schema). The tenancy model is now database-per-tenant; the
reasoning for the change is in §2.2. Everything else in `DataArchitecture.md`
— the provenance spine, the reader/mapping/canonicalizer split, the metric
registry, the three retrieval modes — stands unchanged and is assumed here.

**Companions:** `docs/DataArchitecture.md` (ingestion), `docs/AgenticHarnessPlan.md`
(tool-calling loop), `docs/AuthPlan.md` (identity), `docs/TestingStrategy.md`.

---

## 1. The core of the system, in one paragraph

Reliat converts heterogeneous plant instrument data into **auditable artifacts
that recommend actions**. A deterministic layer canonicalizes readings and
detects statistical events. An agent layer reasons about those events against a
curated, versioned library of industrial failure modes, producing ranked
hypotheses with cited evidence, an impact estimate, and a recommended action
drawn from a fixed catalog — never invented. Every artifact records exactly
what data, what knowledge, and what model produced it, and carries the
operator's eventual verdict. **The verdict feeds back into the shared library.
That loop is the product.**

Everything below serves that sentence. If a component does not make artifacts
more grounded, more auditable, or the library smarter, it is not foundational.

---

## 2. The central tension, and how it resolves

You asked for two things that fight each other:

> "each tenant has their own dedicated DB … so when they log in, it only fetch
> and process their data. This is absolute must."

> "a shared data layer that store incident and their root cause … as we grow,
> the pattern and category is clearer"

Maximum isolation means nothing is shared. A shared learning layer means
something crosses. Resolve this wrong in either direction and you get a product
that either leaks competitors' process intelligence to each other, or a "shared
library" that never fills up because nothing is ever safe to promote.

### 2.1 The resolution: separate the observation from the abstraction

**Observations never leave the tenant. Abstractions are promoted through a
human-reviewed gate.**

```
  TENANT PLANE (per-customer DB)          KNOWLEDGE PLANE (shared, control DB)
  ────────────────────────────            ───────────────────────────────────
  measurements                            failure_modes         ← the taxonomy
  events / outliers                       failure_mode_versions
  diagnoses                               evidence_signatures
  artifacts                     ──gate──▶ remediation_actions   ← the action catalog
  notes, documents                        knowledge_evidence    ← de-identified stats
  source_assets                           knowledge_embeddings

  CEMEX's F80 went 3.2σ at 04:12          "FM-014 screen-panel blinding:
  on CV42 and it was a blinded             topsize +2σ sustained >8min with
  screen panel.                            F80 flat. Confirmed 23× across 6
                                           sites. Discriminator vs. feed
  ── never leaves ──                       change: F10 unchanged."
```

What crosses the gate is a **pattern, a count, and a discriminator** — never a
row, a timestamp, a channel name, or a customer's numbers. A promoted entry is
reviewed by a human before it is merged, and it records which tenants
contributed only as an opaque count.

This is not a compromise. It is a better product than sharing raw incidents
would be: a curated failure-mode taxonomy with *discriminating evidence* is
worth more to a diagnosing agent than a pile of other people's unstructured
incidents, and it is the thing you can put in a sales conversation — *"we learn
from the fleet without touching your data"* — without a security review killing
the deal.

### 2.2 Why database-per-tenant, and what it costs

`DataArchitecture.md` recommended RLS on a shared schema. That was the right
call for the constraints as stated then. Your requirement changed the
constraints: physical separation is now a must, and that is a legitimate
enterprise-procurement requirement, not a technical preference.

| Model | Isolation | Ops cost | Verdict |
|---|---|---|---|
| Shared schema + `tenant_id` | app code only | lowest | current state; one forgotten `WHERE` from an incident |
| Shared schema + RLS | database-enforced | low | strong, but "shared database" is still the answer you give a customer's security team |
| Schema-per-tenant | database-enforced, separate namespace | medium | awkward middle — shared connection limits, shared backup unit |
| **Database-per-tenant, shared cluster** | **separate DB, separate backup, separate restore** | **medium** | **chosen** |
| Cluster-per-tenant | physical | high | for a customer who pays for it; the design below allows it per-tenant |

Chosen: **database-per-tenant on one managed Postgres cluster**, plus one
**control-plane database**.

What it buys, concretely:

- "Delete everything you hold for us" is `DROP DATABASE`. Bounded, provable.
- Backup and point-in-time restore are per-customer. One customer's bad restore
  cannot touch another's.
- Blast radius of any query bug, any migration bug, any `DELETE` without a
  `WHERE`, is exactly one tenant.
- Residency: move one database to another region without touching the rest.
- The security-review answer is "your data is in your own database," which ends
  a conversation that RLS only survives.
- A large customer can be promoted to a dedicated cluster by changing one row
  in the tenant registry.

Honest costs, all real:

- **Migrations run N times.** Needs a runner that iterates the registry, and a
  partial-failure story (tenant 7 of 12 fails → registry records schema version
  per tenant, and the app refuses traffic to a tenant whose version is behind).
- **Connection multiplication.** N databases × pool size exhausts Postgres
  connections fast. **PgBouncer is mandatory, not optional**, in transaction
  pooling mode.
- **Cross-tenant queries get hard.** Given §2.1, that is a feature.
- **Provisioning becomes code.** Creating a customer is now `provision_tenant()`
  — create DB, migrate, seed, register — not an `INSERT`.

**Keep the `tenant_id` columns anyway.** Cheap, and it is defence in depth: if a
connection is ever routed wrongly, a scoped query still returns nothing rather
than someone else's rows. Belt and braces on the one boundary that cannot fail.

---

## 3. The three planes

### 3.1 Control plane — one database, `reliat_control`

Identity, routing, billing, and the knowledge library. Never holds measurement
data.

```
tenants           id, slug, name, status, region, db_dsn_ref,
                  schema_version, isolation_tier, created_at
users             id, tenant_id, email, password_hash, role, ...
sessions          (as today — opaque, revocable)
oauth_accounts
audit_events      actor, tenant, action, target, ip, outcome, at
usage_ledger      tenant, model, input_tokens, output_tokens, cost_usd, at
── knowledge plane lives here too (§3.3)
```

`tenants.db_dsn_ref` is a **reference to a secret**, not a DSN. The connection
string is resolved from the secret manager at runtime, so the control database
never stores credentials to the tenant databases.

### 3.2 Tenant plane — one database per customer, `reliat_tn_<slug>`

Everything customer-specific, on an identical schema:

```
sites, areas, assets, channels          ← asset hierarchy (DataArchitecture §4.1)
source_assets                           ← provenance spine
measurements                            ← canonical readings
events                                  ← detector output (today: `outliers`)
event_signatures                        ← feature vectors for similarity (vector)
artifacts                               ← the auditable deliverable (§4.3)
artifact_dispositions                   ← operator verdict, the feedback signal
documents, doc_chunks                   ← tenant SOPs/notes (vector)
ingest_runs                             ← per-file execution record
```

### 3.3 Knowledge plane — shared, curated, versioned

This is the master library, and it is the most valuable table in the company.

```
failure_modes
  id                  FM-014
  category            equipment | feed_material | process_control |
                      instrument | environmental | upstream_blast
  subcategory         screening | crushing | conveying | milling | ...
  name                "Screen panel blinding"
  mechanism           physical explanation, reviewed prose
  status              draft | active | deprecated
  version             int, immutable once active

evidence_signatures                     ← how it LOOKS in data
  failure_mode_id, metric_id, direction (up|down|flat|oscillating),
  magnitude_sigma_min, duration_min, duration_max, co_movement_json

discriminators                          ← how to tell it from its lookalikes
  failure_mode_id, competing_mode_id, test_description,
  distinguishing_metric, expected_difference

remediation_actions                     ← the AGENT'S ACTION SPACE
  id, failure_mode_id, action_text, urgency, requires_downtime,
  typical_effect, verification_step

impact_priors                           ← what it usually costs
  failure_mode_id, downstream_effect, typical_downtime_min_p50/p90,
  confidence, sample_size

knowledge_evidence                      ← de-identified corroboration
  failure_mode_id, confirmed_count, site_count, first_seen, last_seen
  (counts only — no tenant ids, no values, no timestamps of incidents)

knowledge_embeddings                    ← vector(1024) over mechanism + name
```

**The taxonomy is the agent's action space.** This is the single most important
structural idea in this document. The agent does not write a recommendation in
prose — it *selects* a `remediation_action` row and cites it. The same
anti-hallucination guarantee `AgenticHarnessPlan.md` §4 established for queries
("the model can only ask questions a human verified") now extends to actions:
**the model can only recommend actions a domain expert wrote down.** If no
action fits, it says so.

Categories are seeded from comminution domain knowledge, then earn their
structure from data. Six top-level categories, because that is what
distinguishes the mechanisms that matter for PSD:

| Category | Examples |
|---|---|
| `feed_material` | ore hardness change, blend transition, moisture, clay content |
| `equipment` | liner wear, screen blinding/damage, belt mistracking, roller failure |
| `process_control` | feeder rate change, closed-circuit load, water addition, setpoint |
| `instrument` | lens fouling, illumination decay, calibration drift, vibration |
| `environmental` | dust loading, rain, temperature, ambient light |
| `upstream_blast` | fragmentation from blast design, oversize from muckpile |

### 3.4 The promotion gate

```
tenant artifact  →  operator marks CONFIRMED with a cause
                 →  de-identify: strip ids, values, timestamps; keep
                    normalized signature shape + which metrics moved
                 →  match against existing failure_modes by signature
                 →  MATCH:    increment confirmed_count, refine signature bounds
                    NO MATCH: queue a draft failure_mode for human review
                 →  a domain expert (yours, or the customer's, credited)
                    reviews, edits, and activates
                 →  version bump; artifacts pin the version they used
```

Two rules that make this safe and auditable:

1. **Nothing is promoted automatically.** A human activates every version. The
   library's value is that it is curated; an auto-merged library is just a
   noisier database.
2. **Artifacts pin the knowledge version they consulted.** An artifact written
   in March remains explicable in December even after FM-014 has changed three
   times. Without this, your audit trail rots.

---

## 4. The agent pipeline

### 4.1 The statistical layer is not the agent

Deterministic detection produces candidate events. The agent reasons *about*
them. This separation is not stylistic:

- Detection must be reproducible, cheap, and run on every reading. An LLM
  cannot do that at 21k rows per file, let alone at a live feed.
- Reasoning is expensive and non-deterministic, and must run only on candidates
  a cheap layer already flagged.

Today's `detector.py` (rolling z-score) is the placeholder. It stays the shape
of the interface while its internals improve — robust statistics (median/MAD
instead of mean/σ, which the current code's own outliers corrupt), CUSUM or
EWMA for sustained drift, and change-point detection for regime shifts. All
deterministic, all testable, no model involved.

### 4.2 Two phases, two agents, one artifact

```
  EVENT (deterministic, from the statistical layer)
    │
    ├─▶ PHASE 1 — Diagnostic Agent
    │     context: event + window stats, candidate failure modes matched by
    │              signature, tenant precedent (kNN on event_signatures with
    │              confirmed outcomes), tenant SOP/note chunks
    │     tools:   list_events, get_event_detail, get_measurements_window,
    │              get_channel_summary, search_failure_modes, get_discriminators
    │     output:  ranked hypotheses, each with supporting AND contradicting
    │              evidence, each linked to a failure_mode id + version,
    │              plus DISCRIMINATING TESTS the operator can run to decide
    │
    ├─▶ PHASE 2 — Impact Agent
    │     context: phase-1 hypotheses, impact_priors for those failure modes,
    │              asset topology (what is downstream of this channel),
    │              tenant's own history of this failure mode
    │     output:  downstream effect, downtime risk band (p50/p90) with the
    │              method stated, cost band, confidence, and explicitly what
    │              it does NOT know
    │
    └─▶ ACTION SELECTION
          from remediation_actions for the leading failure modes — SELECTED,
          not written. Ranked by urgency × confidence. Each carries its
          verification step.
    │
    └─▶ ARTIFACT (immutable, content-hashed, §4.3)
```

**Phase 2 must be allowed to refuse.** `impact_priors.sample_size` starts at
zero for every failure mode. An impact estimate with no prior is not an
estimate. The correct output is "no impact prior exists for this failure mode
(n=0); this is the first confirmed instance" — and that honesty is what makes
the number believable when the sample size *is* there. A downtime prediction
that is always available is always partly invented.

### 4.3 The artifact — the auditable deliverable

```
artifacts
  id, tenant_id, event_id, created_at, content_hash
  status                  draft | issued | superseded

  -- reproducibility: enough to re-run this exactly
  model_id                pinned, e.g. claude-opus-5
  prompt_version          pinned
  knowledge_versions      jsonb — {FM-014: 3, FM-022: 1}
  tool_calls              jsonb — every call, args, and returned row ids
  data_window             jsonb — measurement id range + content hash
  context_token_budget    jsonb — what was included, what was elided

  -- the reasoning
  hypotheses              jsonb — cause, failure_mode_id, confidence,
                                  supporting_evidence, contradicting_evidence,
                                  discriminating_test
  impact                  jsonb — effect, downtime p50/p90, method, cost band,
                                  stated_unknowns
  recommended_actions     jsonb — remediation_action ids, rank, rationale

  -- cost
  input_tokens, output_tokens, cost_usd

artifact_dispositions
  artifact_id, actor_user_id, verdict (accepted|rejected|modified|
    confirmed_other_cause), actual_cause_failure_mode_id, actual_downtime_min,
    notes, at
```

`artifact_dispositions` is small and it is the flywheel. It closes the audit
loop, it measures whether the agent is actually right, and it is the only input
to the promotion gate. **Build it in the first version of the artifact, not
later** — retrofitting a feedback signal means throwing away every artifact
produced before it existed.

---

## 5. Retrieval and context-window management

You asked whether this needs RAG and how the app manages the context window.
Short answer: yes, narrowly — and the context window is managed by a
deterministic builder with a token budget, never by the model.

### 5.1 The rule

**The model never decides what goes into its own context.** A `ContextBuilder`
assembles it from typed sections, each with a token allowance and a declared
truncation strategy. The assembled composition is recorded in the artifact, so
every run is reproducible and every omission is visible.

A 200k context window is a budget, not a target. Filling it is slower, more
expensive, and *less accurate* — relevant evidence buried in irrelevant bulk is
how a grounded system starts producing confident nonsense.

### 5.2 The budget for a Phase-1 diagnosis

Target ~15k input tokens, hard ceiling 25k:

| Section | Budget | Retrieval | Truncation strategy |
|---|---|---|---|
| System contract + tool defs | 3k | static | never — **cache breakpoint here** |
| Candidate failure modes | 3k | **structured** signature match, top 8 | drop lowest prior first |
| Event + window | 2k | downsample to ~40 points **+ stats computed in Python** | widen stride |
| Tenant precedent | 2k | kNN on `event_signatures`, top 3, with outcomes | fewer neighbours |
| Text evidence | 2k | pgvector top-k over tenant notes/SOPs | fewer chunks |
| Tool results (loop) | 3k | live | per-call row cap + explicit elision marker |

### 5.3 Five techniques that do the actual work

1. **Structured pre-filter beats semantic retrieval for the taxonomy.** You
   already know which metrics moved and in which direction. Querying
   `evidence_signatures` on that is far more precise than embedding the event
   description and hoping. Vector search is the *fallback* when the structured
   match returns nothing — not the default.
2. **Compute statistics in Python; never make the model do arithmetic.** Send
   `mean 1.06, σ 0.11, +3.2σ sustained 4m20s, F10 flat within 0.3σ` — not 500
   raw numbers. Cheaper, and eliminates a whole class of silent error.
3. **Prompt caching on the stable prefix.** System contract, tool definitions,
   and the candidate failure-mode block are stable across events. Put the cache
   breakpoint after them. This is the single largest cost lever available and
   it needs no new infrastructure.
4. **Elision is explicit.** When a tool result is truncated, the model is told
   `[truncated: 847 of 5,213 rows shown]`. A model that silently receives partial
   data will reason confidently about a complete picture it never saw.
5. **Multi-turn compaction to a structured state object**, not transcript
   replay. Older turns collapse into `{established_facts, ruled_out,
   open_questions, citations}`. Bounded growth, and the citations survive.

### 5.4 Hard limits, enforced in code

Max 8 tool calls per run. Max total tokens per artifact. Per-tenant daily cost
ceiling, checked before the call, recorded in `usage_ledger`. An agent loop
without a step budget is an unbounded bill and an unbounded latency.

---

## 6. Exactly what to add to the stack

Current: FastAPI · SQLAlchemy 2.0 · Alembic · Pydantic v2 · Postgres 16
(pgvector image) · Anthropic SDK · Argon2 · Authlib · Next.js 16 · Docker
Compose · pytest · ruff.

That is a good foundation. **Nine additions are load-bearing.** Everything else
on this list is convenience.

### Load-bearing

| Add | Version | Replaces / why |
|---|---|---|
| **PgBouncer** (container) | 1.23+ | **Mandatory for DB-per-tenant.** Transaction-pooling mode. Without it, N tenant databases × pool size exhausts Postgres connections at single-digit tenant counts. |
| **polars** | `>=1.0` | The reader layer. One API for CSV / TSV / Parquet / NDJSON, strict typing, low memory. Better than pandas for new code and handles the "I don't know what format it'll be" requirement directly. |
| **pyarrow** | `>=17` | Parquet backend + Arrow interchange. Polars needs it for some paths anyway. |
| **python-calamine** | `>=0.2` | Excel. **Replaces `xlrd`**, which is `.xls`-only and cannot read the `.xlsx` a customer will inevitably send. |
| **arq** + **Redis** | `>=0.26` / 7 | Background jobs. Ingesting a 21k-row file, running detection, and calling an agent must not happen inside an HTTP request. asyncio-native, so it matches FastAPI without Celery's weight. *(Alternative with zero new datastores: `procrastinate`, Postgres-backed. Pick Redis if you also want caching and rate limiting; pick procrastinate to avoid another container.)* |
| **boto3** + **MinIO** (container) | `>=1.34` | Raw source files. S3-compatible, so MinIO locally and S3/R2 in production behind one client. `DataArchitecture.md` §3 requires raw bytes retained outside the database for replay. |
| **hypothesis** | `>=6` | Property-based tests on the canonicalizer. You are accepting files from strangers; the input space is adversarial and example-based tests will not cover it. |
| **testcontainers[postgres]** | `>=4` | Real Postgres in tests. SQLite cannot exercise `jsonb`, `timestamptz`, pgvector, or DB-per-tenant routing — precisely what this architecture depends on. |
| **structlog** + **sentry-sdk[fastapi]** | `>=24` / `>=2` | You cannot debug a multi-tenant agent platform from print statements, and you cannot learn about production errors from customers. |

### Supporting (add during the slice that needs them)

| Add | Why |
|---|---|
| `pytest-asyncio`, `httpx`, `time-machine`, `pytest-cov` | async tests, ASGI route tests, time-dependent detector tests, coverage |
| `mypy` | You already write full type hints; this makes them enforceable |
| `pre-commit` + GitHub Actions | Nothing runs on push today. This is the largest process gap you have |
| Secrets manager (Doppler / Infisical / AWS SM) | `tenants.db_dsn_ref` resolves through it; also fixes the committed dev defaults |
| **pgvector** (already in the image, unused) | Enable the extension; `knowledge_embeddings`, `doc_chunks`, `event_signatures` |

### Deliberately NOT adding

Each of these is a plausible-sounding trap at your stage:

| Not adding | Why |
|---|---|
| **LangChain / LlamaIndex / LangGraph** | A handful of typed tools does not need an orchestration framework, and these frameworks abstract away exactly the layer that is your moat — context assembly and the tool contract. You would be outsourcing the differentiator. |
| **Pinecone / Weaviate / Qdrant** | pgvector handles your corpus by three orders of magnitude. A separate vector store means a second consistency problem and a second tenant-isolation problem. |
| **MongoDB or any second database** | `jsonb` covers document shapes. Two databases means two backup stories and a cross-database join. |
| **Kafka / Flink** | Your delivery mechanism is files. Add streaming when a customer has a live feed and a latency requirement. |
| **Snowflake / dbt / lakehouse** | One plant, 21k rows. |
| **TimescaleDB** | Not yet — but it is the *right* answer later. Trigger: a single tenant passes ~50M measurement rows, or you need continuous aggregates for dashboards. It is a Postgres extension, so adopting it is not a migration off anything. |
| **Kubernetes** | Compose locally, managed containers in production, until you have a reason. |
| **Fine-tuning** | Retrieval quality and grounding dominate. There is nothing to fine-tune on until `artifact_dispositions` has thousands of rows. |

### Infrastructure shape

```
  Next.js (Vercel or a container)
        │
  FastAPI ── PgBouncer ── Postgres cluster ── reliat_control
        │                                  ├─ reliat_tn_cemex
        │                                  └─ reliat_tn_<...>
        ├── Redis  (arq queue)
        ├── MinIO / S3  (raw source files)
        └── Anthropic API
```

Managed Postgres (RDS, Crunchy Bridge, or equivalent) rather than
self-hosted — you are running N databases with per-customer restore
obligations, and that is not where a founding team should spend its operations
budget.

---

## 7. Build order

Sequenced by what unblocks what. Every slice is shippable.

| # | Slice | Days | Unblocks |
|---|---|---|---|
| **1** | **Control/tenant plane split + connection router + `provision_tenant()` + migrate CEMEX into `reliat_tn_cemex`** | 3 | **everything** |
| 2 | Finish provenance: `source_assets` written at ingest, sha256 short-circuit, `ON CONFLICT DO NOTHING` + `rows_duplicate` (fixes the half-built slice sitting in the repo now) | 1 | trustworthy data |
| 3 | `timestamptz` + `Site.timezone`; metric registry + canonicalizer invariants | 2 | correct time queries, unit safety |
| 4 | Reader/profile split (polars + calamine); port CEMEX to a declarative profile | 2 | customer #2 without a deploy |
| 5 | Test suite + CI: hypothesis, testcontainers, enumerated isolation, GitHub Actions | 2 | everything after this is safe to change |
| 6 | Knowledge plane schema + seed the taxonomy with ~20 reviewed failure modes | 3 | the agent has something to reason with |
| 7 | Typed tool surface + `ContextBuilder` with the §5.2 budget, tested with no LLM | 3 | grounded agents |
| 8 | Phase 1 Diagnostic Agent on the new harness + artifact + dispositions | 3 | the deliverable |
| 9 | `event_signatures` + kNN — retires the faked "Similar past outliers" | 2 | precedent retrieval |
| 10 | Phase 2 Impact Agent + `impact_priors` (refusing while n=0) | 3 | the full pipeline |
| 11 | Promotion gate + review UI | 3 | the flywheel |
| 12 | Background jobs (arq), object storage (MinIO/S3), upload UI | 3 | self-serve onboarding |

Slices 1–5 are foundation and should be done in order. 6–8 are the product.
9–12 are what compounds.

**Slice 1 is the first logical step**, and the reason is timing: you have
exactly one real tenant. Every week you wait, the migration gets more expensive,
and it is the one decision that every other slice depends on.

---

## 8. Open questions that change the design

1. **How does data actually arrive?** File drop, SFTP, historian API, email?
   Changes slice 12's ingress, not the model.
2. **Who curates the taxonomy?** The promotion gate needs a named domain
   expert. If that is you, it is a real time commitment; if it is a customer's
   metallurgist, it is a contract term and possibly a credit line in the
   product.
3. **Is any incoming data PII?** Operator names in maintenance logs are the
   likely path. Governance rules must exist before ingest, not after.
4. **Residency obligations?** DB-per-tenant makes this tractable, but the
   cluster topology has to know about it before the first regulated customer.
5. **Who owns a promoted failure mode?** If a CEMEX metallurgist's confirmed
   diagnosis becomes library entry FM-031 that improves a competitor's
   diagnosis, that must be addressed in the contract before it happens, not
   after someone notices.

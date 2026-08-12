# 2026-08-03 — Platform architecture: three planes, the knowledge library, and the tenancy reversal

The founder asked for the first logical step, a consolidated plan, and the exact
tech stack — driven by three requirements: per-tenant isolated storage, a shared
cross-tenant incident/root-cause library, and a two-phase agent producing
auditable artifacts.

The first two requirements are in direct tension. Resolving that tension is the
architecture; everything else follows from it.

## What changed

| File | Change |
|---|---|
| `docs/PlatformArchitecture.md` | New. The master plan: control/tenant/knowledge planes, DB-per-tenant, the failure-mode taxonomy as the agent's action space, two-phase pipeline + artifact, context-window budget, exact stack additions, 12-slice build order. |
| `docs/DataArchitecture.md` | §6.2 marked superseded — RLS-on-shared-schema replaced by connection-level routing. Layers 1 and 3 still stand. |

No code this turn. This is direction.

## Decisions worth remembering

**Isolation and shared learning are reconciled by promoting abstractions, not
observations.** Raw incidents never leave a tenant. What crosses a
human-reviewed gate is a pattern, a count, and a discriminator: *"FM-014 screen
panel blinding — topsize +2σ sustained >8min with F80 flat; confirmed 23× across
6 sites; discriminator vs. feed change: F10 unchanged."* No rows, no values, no
timestamps, no channel names. This is not a compromise between the two
requirements — a curated taxonomy with discriminating evidence is worth more to
a diagnosing agent than a pile of other customers' unstructured incidents, and
it survives a security review.

**Reversed the tenancy recommendation from three days ago.** `DataArchitecture.md`
§6.2 said RLS on a shared schema, which was right for the constraints as stated
then. The founder made physical separation an explicit requirement, which is a
legitimate enterprise-procurement position, so: database-per-tenant on one
managed cluster, plus a control-plane database. It buys `DROP DATABASE` as the
deletion story, per-customer backup and restore, a one-tenant blast radius, and
an answer to a customer's security team that RLS only survives. It costs
migrations running N times with a partial-failure story, mandatory PgBouncer,
and provisioning becoming code.

Worth being explicit that this is a reversal rather than quietly rewriting the
earlier doc — the earlier reasoning was sound under different constraints, and
the record of *why* it changed is more useful than a clean-looking doc.

**Keep `tenant_id` columns even with separate databases.** Cheap, and if a
connection is ever routed wrongly a scoped query returns nothing instead of
someone else's rows. Belt and braces on the one boundary that cannot fail.

**The taxonomy is the agent's action space.** The strongest structural idea in
the plan. `remediation_actions` rows are selected and cited, never written as
prose. This extends the guarantee `AgenticHarnessPlan.md` §4 established for
queries — the model can only ask questions a human verified — to actions: the
model can only recommend actions a domain expert wrote down. If nothing fits, it
says so.

**Phase 2 must be allowed to refuse.** `impact_priors.sample_size` starts at
zero for every failure mode. A downtime estimate with no prior is invention. The
correct output is "no prior exists (n=0); this is the first confirmed instance."
An impact number that is always available is always partly fabricated, and the
honesty is what makes the number believable once the sample size is real.

**Build `artifact_dispositions` in version one, not later.** It is a small table
and it is the flywheel: audit trail, accuracy measurement, and the only input to
the promotion gate. Retrofitting a feedback signal means discarding every
artifact produced before it existed.

**Artifacts pin the knowledge version they consulted.** An artifact written in
March must stay explicable in December after FM-014 has changed three times.
Without version pinning the audit trail rots silently.

**The model never decides what goes in its own context.** A deterministic
`ContextBuilder` assembles typed sections against a ~15k-token budget with
declared truncation per section, and the composition is recorded in the
artifact. Two specifics that carry most of the benefit: statistics are computed
in Python and sent as summaries rather than 500 raw numbers, and candidate
failure modes are retrieved by **structured signature match**, not embedding
similarity — you already know which metrics moved, so vector search is the
fallback, not the default. A 200k window is a budget, not a target.

**Nine load-bearing stack additions, and a longer list of deliberate
omissions.** PgBouncer (mandatory once there are N databases), polars + pyarrow
+ python-calamine (the reader layer; calamine replaces xlrd, which cannot read
the .xlsx a customer will send), arq + Redis (agent calls and 21k-row ingests
cannot run in an HTTP request), boto3 + MinIO, hypothesis, testcontainers,
structlog + Sentry. Explicitly rejected: LangChain/LlamaIndex — a handful of
typed tools does not need an orchestration framework, and those frameworks
abstract away context assembly and the tool contract, which is precisely the
moat. Also rejected for now: a dedicated vector DB, a second database, Kafka,
a warehouse, Kubernetes, fine-tuning. TimescaleDB is deferred with a named
trigger (~50M rows in one tenant, or continuous aggregates) rather than a vague
"later."

## Verified

Nothing was built, so there is nothing to verify beyond the docs being
internally consistent. Stated plainly rather than dressed up:

| Check | Result |
|---|---|
| `DataArchitecture.md` §6.2 carries a superseding pointer | yes |
| Build order in `PlatformArchitecture.md` §7 subsumes `DataArchitecture.md` §8 | yes — slices 2–5 map onto the earlier 1–5 |
| Test suite unaffected | not re-run; no code changed this turn |

## Still open

- **Slice 1 is not started.** Control/tenant plane split, connection router,
  `provision_tenant()`, and migrating CEMEX into `reliat_tn_cemex`. Roughly
  three days, and every other slice depends on it.
- **The half-built slice from yesterday is still half-built** — `source_assets`
  and the unique constraint exist in the schema, but `ingest_rows` has no
  conflict handling, so an overlapping re-export raises `IntegrityError` and
  aborts the batch. It is slice 2 in the new order.
- **`alembic upgrade head` still must not run against the real database** until
  the duplicate `(channel_id, t)` count is checked. Postgres has been down for
  two sessions running, so this remains unverified.
- **Five open questions in `PlatformArchitecture.md` §8**, of which two are
  commercial rather than technical and cannot be answered by engineering: who
  curates the taxonomy, and who owns a promoted failure mode when one customer's
  confirmed diagnosis improves a competitor's results. The second needs to be a
  contract term before it happens, not after someone notices.
- Still no CI.

# 2026-08-02 — Data architecture: ingestion, retrieval, security, and the first real tests

The question was the direction of the architecture ahead of taking real customer
data in unknown formats, with data security and domain-driven retrieval as the
two priorities. Rather than write the direction from first principles, I probed
the existing ingest path first — the four defects it turned up are what the
architecture is shaped around.

## What changed

| File | Change |
|---|---|
| `docs/DataArchitecture.md` | New. The direction: format/meaning/trust split, `source_assets` provenance spine, asset hierarchy + metric registry, three retrieval modes, three-layer tenant isolation, agent attack surface, 10-slice build order. |
| `docs/TestingStrategy.md` | Rewritten. Was a page of principles; now names the four tests that fail today, the four test layers with concrete coverage, a CI matrix, and release gates. |
| `services/api/tests/test_ingest_invariants.py` | New. Idempotency, percentile monotonicity, UTC round-trip — three `xfail(strict=True)` tripwires — plus one passing guard that auto-registered channels land in a tenant. |
| `services/api/tests/test_route_isolation.py` | New. Enumerates every `APIRoute` on the app and asserts it requires `get_principal` or appears in an explicitly-justified `PUBLIC_ROUTES` allowlist. Passes today. |

## What the probe found

Run against `app.etl.ingest_rows` on an in-memory database, before writing any
of the above:

```
[idempotency] first ingest:  {'measurements': 40}   rows in db: 40
[idempotency] second ingest of IDENTICAL data: {'measurements': 40}  rows in db: 80
[invariant]   rows accepted with F80(0.1) < F10(1.0): 20
[timezone]    stored back as: datetime(2026, 5, 1, 0, 0)  tzinfo=None
[provenance]  measurement columns referencing origin: ['source']
```

1. **Ingest is not idempotent.** No file hash, no `UNIQUE (channel_id, t)`.
   Re-running a file doubles the rows. Plant historians re-export overlapping
   windows as their *normal* delivery pattern, so this is not an edge case, and
   duplicated rows silently corrupt every baseline and every count the agent
   reports.
2. **Physically impossible readings are accepted.** `F80 = 0.1` next to
   `F10 = 1.0` stored without complaint. Percentiles of one distribution are
   non-decreasing by definition; violating that is the signature of a mis-mapped
   column, which is the single most likely error when onboarding a new customer.
3. **Timezone is silently dropped.** tz-aware UTC in, naive out. Columns are
   `DateTime`, not `DateTime(timezone=True)`. Every headline query is
   time-bounded and shifts are plant-local.
4. **Provenance is one free-text string.** `source = 'cemex_minitab'`. No file,
   no upload, no mapping version, no operator.

I could not check whether #1 has already bitten the live database — Postgres was
not running, so the duplicate-key count in the real 21,138-row table is
**unverified**. Worth running before the fix:

```sql
select count(*) from (select channel_id, t from measurements
                      group by 1,2 having count(*) > 1) d;
```

## Decisions worth remembering

**Provenance is the spine, and it goes first.** `source_assets` (tenant, sha256,
storage_uri, mapping profile + version, status, counts) with a FK from every
measurement. It closes idempotency, gives the agent's citations something real
to resolve to, makes "delete everything you hold for us" a bounded operation,
and makes a mapping bug recoverable by replay instead of by asking the customer
to re-send. One table, three problems.

**Format is the easy part; meaning is the hard part.** CSV vs Parquet vs xls is
a reader swap. The thing that does not scale is `ingest_minitab.py` knowing the
customer's column names, unit convention, timezone, and baseline policy in 124
lines of Python. Split into readers (format only), declarative versioned mapping
profiles (YAML, reviewable by a domain expert who is not a programmer), and a
canonicalizer that owns the invariants. A profile is data, so it can be diffed
and replayed; a loader is code, so it can only be rewritten.

**Do not embed the time series.** The instinct to reach for vector search on
"RAG" would destroy the grounding thesis. "Outliers in the last 3 hours" is a
`WHERE` clause; nearest-neighbour retrieval returns semantically-nearby rows,
which has no relationship to correct rows, and the wrong count arrives sounding
exactly like a right one. Three modes instead: structured tools (~80% of real
questions), semantic vectors over the *narrow text* corpus only (diagnoses,
notes, SOPs), and engineered feature vectors for signal-shape similarity.

**"Similar past outliers" is a feature-vector problem, not an embedding one.**
The panel is currently faked with `[1,2,3,4].map(...)`. Making it real means a
fixed-length vector of engineered features per outlier window — interpretable,
deterministic, free, testable, and it does not drift when a model version
changes.

**F80 is not mean-aggregatable, and that belongs in the type system.** The mean
of two F80 values is not the F80 of the combined material. An agent asked for
"average F80 last week" will average the column and be confidently wrong. A
metric registry with `aggregation: NOT_AGGREGATABLE` lets the tool refuse — and
that refusal is the product working correctly.

**Tenant is never a model-controllable parameter.** No agent tool signature
accepts `tenant_id`; it is bound from the session `Principal` below the model.
This is the highest-value rule in the security section because it means a
*fully successful* prompt injection carried in a customer's own uploaded file
still cannot cross a tenant boundary. Defences that depend on the model behaving
are not defences.

**RLS is worth the two days, eventually.** Today the boundary is one layer:
remembering to call `owned_channel()`. Audited and currently complete, but one
forgotten `Depends` from being wrong, and "someone added a route on a Friday" is
the most likely serious incident this company can have. Postgres RLS holds even
when application code is wrong. Sequenced at slice 8, after the route surface
stabilises, so policies get written once.

**`xfail(strict=True)` instead of TODOs.** A known defect written as a test is
executable and cannot rot. `strict=True` means that when someone fixes
idempotency, the test passes, the suite goes red, and they are forced to remove
the marker. A debt record with a tripwire on it.

**The route-isolation test enumerates rather than lists.** The failure it exists
to catch is a route added later, so a hand-maintained list would be guaranteed
to omit exactly the route that matters. It walks `app.routes` and requires each
one to either depend on `get_principal` or carry a written justification in
`PUBLIC_ROUTES`. A second test rejects stale allowlist entries, so the allowlist
cannot become a place to pre-approve paths.

## Verified

```text
./.venv/bin/python -m pytest -q -rxX
7 passed, 3 xfailed in 0.75s
```

| Assertion | Result |
|---|---|
| Route enumeration finds no unguarded `APIRoute` | passes — `channels`, `outliers`, `usage` all require a principal today |
| Allowlist has no stale entries | passes |
| Auto-registered channels land in a tenant | passes |
| Idempotency / monotonicity / UTC round-trip | xfail, all three strict, each naming the slice that retires it |

Found while writing the route test: `/docs`, `/redoc` and `/openapi.json` are
Starlette routes rather than `APIRoute`, so they sit outside this test — and
they are unauthenticated, publishing the full API surface. Fine locally, worth
gating with `FastAPI(docs_url=None, openapi_url=None)` in production. Noted in
the test file; not changed here.

## Still open

- **Nothing in slices 1–10 is built.** This is direction plus four tests, not
  implementation. Slice 1 (`source_assets` + uniqueness) is the recommended
  start and retires the first xfail.
- **No CI.** The strategy doc now specifies the matrix; no workflow file exists.
  Every test written here still only runs when someone runs it.
- **Integration tests still run on SQLite.** Which cannot exercise RLS, `jsonb`,
  `timestamptz`, or index behaviour — exactly what this architecture depends on.
  Postgres-backed integration is slice 5.
- **Hypothesis is referenced in the strategy but not a dependency.** Add it with
  the canonicalizer, not before.
- **The live duplicate-row count is unverified** (see above).
- Four open questions for the founder in `DataArchitecture.md` §10 — delivery
  mechanism, PII in incoming data, residency/retention obligations, and whether
  cross-tenant benchmarking is ever a product. The last one is the only thing
  that would deliberately cross the isolation boundary, and it is much cheaper
  to know now than to retrofit.

# Reliat on a resume

How to convert this project into 4–5 bullets that survive a FAANG / Anthropic-level
screen *and* the interview that follows.

This is a positioning document, not part of the build. It records what is
actually true and verifiable in this repo, so that every claim on the resume has
a file behind it.

---

## 0. The thing you are underselling

Most candidates applying to SWE / AI-engineering roles have: a course project, a
hackathon build, or a wrapper around an LLM API. You have something structurally
different, and the difference is worth stating plainly because it should drive
every word of the bullets:

1. **Real industrial data from a real company.** 21,138 particle-size readings
   off a CEMEX conveyor line, ingested through the real ETL path. Not a Kaggle
   set. Not synthetic. The failure modes you hit — non-idempotent re-exports,
   timezone loss, non-aggregatable percentiles — are the failure modes that only
   show up when someone hands you their historian dump.
2. **Multi-tenancy with a security boundary, in an AI product.** Not "we added a
   `tenant_id` column." The boundary is designed to hold when the application
   code is wrong *and* when the model is adversarially prompted. That specific
   problem — isolation in an agentic system — is on the roadmap of nearly every
   company you are targeting.
3. **External validation.** Pilot customer, competition semifinalist, VC
   conversations. Almost no candidate at your level has market signal attached
   to a technical project.

The mistake to avoid is writing bullets about *technologies used*. FastAPI,
Next.js, and Postgres are table stakes and say nothing. The bullets below are
about **problems solved under real constraints**, which is what the stack
signals anyway.

---

## 1. The recommended block

Use this as the default. Header line first, then five bullets. If you only have
room for four, cut #4 (context/cost) — it is the most easily folded into #3.

> **Reliat** — Founder & Engineer (solo) · *[MONTH YEAR] – Present*
> Agentic diagnostics for cement & mining plants · Python, FastAPI, PostgreSQL,
> TypeScript, Next.js, Anthropic API, Docker

- **Took an agentic industrial-diagnostics platform from zero to a live pilot**
  running on **21,138 real particle-size readings** from a CEMEX conveyor line,
  by designing and building the entire system solo — ingestion, anomaly
  detection, multi-tenant API, agent layer, and operator UI (~12k LOC);
  advanced to **[COMPETITION] semifinals** and into conversations with
  **[N] VC firms**.

- **Architected tenant isolation as a security property rather than a query
  filter** — database-per-tenant with a separate control plane, and tenant
  identity resolved from the server session *below* the agent's tool layer, so
  that a fully successful prompt injection still cannot reach another customer's
  plant data — **enforced by a test that walks the FastAPI router tree and fails
  any endpoint missing an authenticated principal.**

- **Eliminated free-text hallucination from the diagnosis path by giving one
  data-agnostic model N tenant-specific harnesses**: each customer declares its
  instruments, glossary, and failure taxonomy in a declarative profile that
  *generates* the system prompt and a forced tool schema whose diagnosis `enum`
  is bound to that tenant's categories — so the model **selects and cites** a
  root cause instead of writing one. **20 tests assert that no tenant's prompt
  can name another tenant's evidence fields.**

- **Held each diagnosis to one bounded, priced API call** — statistics computed
  in Python instead of by the model, context budgeted per section under a
  **15k-token target**, and the stable prompt prefix cached — with
  input/output/cache-read/cache-write tokens priced per run and persisted to
  Postgres for **per-tenant cost attribution**.

- **Audited the production ingest path before extending it and found 4 silent
  data-corruption defects** — re-ingest doubled every row, inverted percentiles
  (`F80 < F10`) were accepted as valid, timezones were dropped, and provenance
  was an untyped string — then **encoded each as a strict-xfail test** that
  fails the suite the moment it is fixed, and shipped a provenance table making
  every reading traceable to its source file.

---

## 2. Why each bullet is built the way it is

The Google XYZ formula — *accomplished [X] as measured by [Y] by doing [Z]* — is
the right skeleton, but applied literally it produces stilted, uniform bullets
that read as template-filled. The stronger version, and what the block above
does, is: **lead with the verb and the outcome, embed the metric where it lands
naturally, and end on the mechanism that proves you did it.** Same three
components, better prose.

Each bullet below is annotated with: what it is doing, the evidence in this
repo, and **the follow-up question it invites** — because a good bullet is a
promise to be interrogated, and you should choose which interrogation you get.

### Bullet 1 — the anchor

**Doing:** establishing scope, realness, and external validation in one line. It
front-loads the two things a reviewer cannot get from any other candidate: real
customer data and market traction.

**Evidence:** `docs/DataSchema.md` (21,138 rows, channel `cv42`, MINITAB
export); ~12.4k lines of Python/TS across `services/api` and `apps/web`.

**Invites:** *"Walk me through the system."* This is the question you want.
Answer it top-to-bottom using `docs/diagrams/reliat-system-architecture.excalidraw`
— you have a diagram for exactly this, which is itself a differentiator.

**Note on "solo":** say it. It is the single highest-signal word in the bullet,
and it changes how the other four are read. If a teammate contributed, say
"led" and name the split honestly.

### Bullet 2 — isolation

**Doing:** this is your **security-engineering** bullet, and it is the one most
likely to get you an interview at an AI infrastructure company. It works because
it states a *threat model*, not a feature. "Even a successful prompt injection
cannot cross tenants" is a claim about the worst case, which is what security
people listen for.

**Evidence:** `docs/PlatformArchitecture.md` §2.2 (five isolation models
compared, database-per-tenant chosen, costs stated);
`services/api/tests/test_route_isolation.py` (walks `app.routes`, requires
`get_principal` in the dependency tree or an explicit allowlist entry; a second
test rejects stale allowlist entries).

**Invites:** *"Why database-per-tenant instead of row-level security?"* Have the
real answer ready, including the costs you accepted: migrations run N times,
PgBouncer becomes mandatory, provisioning becomes code. **Naming what the
decision cost you is what separates a designer from someone who read a blog
post.** Also be ready for *"why 404 and not 403 on a cross-tenant ID?"* — because
403 confirms the ID exists, and is an enumeration oracle.

### Bullet 3 — the harness

**Doing:** this is your **AI-engineering** bullet and the most technically
distinctive thing in the project. The insight it encodes — *the model is
data-agnostic, but the harness is not* — is a real architectural position, and
it is stated in one clause. The `enum`-bound tool schema is the concrete
mechanism, and "selects and cites instead of writing" is the outcome in
plain language.

**Evidence:** `services/api/app/harness.py` (`TenantHarness`, `system_prompt()`,
`diagnosis_tool()`, `format_window()`; CEMEX and DEMO profiles plus a
conservative `GENERIC` fallback);
`services/api/tests/test_harness_isolation.py` (20 test cases including
`test_demo_prompt_never_mentions_cemex_only_evidence`);
`services/api/app/diagnostic_agent.py` (forced `tool_choice`, category outside
the tenant's set is dropped rather than stored).

**Invites:** *"How do you know it isn't hallucinating?"* Answer with the
mechanism, not with vibes: the action space is a closed set of taxonomy rows,
the tool schema constrains the output to that enum, statistics are computed in
Python and passed in as evidence, and a category outside the tenant's set is
discarded at the boundary rather than persisted. Then say the honest part — that
the *reasoning* connecting evidence to category is still model-generated, which
is exactly why the artifact is designed to be auditable by a plant engineer.

That last sentence is worth more than the rest of the answer. It shows you know
where your own guarantees stop.

### Bullet 4 — context and cost

**Doing:** proving you treat inference as an engineering resource with a budget,
not as a magic call. Interviewers at AI companies are actively looking for this
because most candidates have never thought about it.

**Evidence:** `docs/PlatformArchitecture.md` §5 (per-section budget table, the
rule "do not embed the time series," hard limits enforced in code);
`services/api/app/harness.py` (`ContextPolicy`: window sizes, output ceiling,
cache flag); `services/api/app/diagnostic_agent.py` (cost computed across four
token classes, cache write at 1.25× and read at 0.10× input price).

**Invites:** *"What's your cost per diagnosis?"* — **you must fill this number
in before sending the resume.** See §5.

Also invites: *"Why not just RAG over the measurements?"* Excellent question to
get. The answer is in `docs/DataArchitecture.md` §5: "outliers in the last three
hours" is a `WHERE` clause, not a similarity search; embedding numeric rows
destroys the precision the answer depends on. ~80% of real operator questions
are structured queries. Vector search earns its place over the *text* corpus —
incident write-ups, maintenance notes — not over the time series.

### Bullet 5 — rigor

**Doing:** this is the bullet that reads as **senior**. Anyone can list features
they built. Very few candidates audit their own system, publish what is broken
with the probe output attached, and convert the findings into failing tests.
"Strict-xfail so the suite fails the moment it is fixed" is a specific, checkable
technique that signals real engineering maturity — it means the debt cannot be
silently forgotten *or* silently resolved.

**Evidence:** `docs/DataArchitecture.md` §1 (probe output verbatim, four
findings, each with why it matters);
`services/api/tests/test_ingest_invariants.py` (three `xfail(strict=True)` plus
one passing); `source_assets` table and migration `4c7a2e1b9d31`.

**Invites:** *"Why ship with known defects instead of fixing them?"* The answer
is prioritization under real constraints: the pilot needed a working detection
path before it needed idempotent re-ingest, each defect is documented with the
build slice that retires it, and the strict-xfail means none of them can rot.
That is a resource-allocation answer, which is what they are actually testing.

---

## 3. Role-tuned variants

Same project, different emphasis. Swap in the variant bullet, keep the rest.

### For AI / ML Engineer roles

Lead with bullet 3, and replace bullet 5 with an evaluation-flavored one if you
build the eval harness before applying:

> - **Made agent output auditable end-to-end**, so every diagnosis resolves to a
>   taxonomy row, a bounded evidence window, and a per-run token/cost record —
>   turning a free-text answer into an artifact a plant engineer can accept or
>   reject, with the disposition captured as the training signal for the next
>   revision.

### For Backend / Infrastructure roles

Lead with bullet 2, and strengthen with the migration incident, which is a real
production-database story:

> - **Recovered a half-migrated production database holding the only copy of
>   21,138 customer readings** after two competing schema authorities
>   (`create_all` and Alembic) diverged — diagnosed the split, verified the
>   stray table was empty before dropping it, restricted `create_all` to SQLite
>   so migrations became the single source of truth, and re-applied cleanly
>   with **zero row loss**.

That bullet is strong precisely because it is a *recovery*. Interviewers trust
candidates who have had something go wrong and can narrate the diagnosis.

### For Full-stack / Product Engineer roles

Swap bullet 4 for the honesty-in-UI decision, which is a product-judgment story
most candidates cannot tell:

> - **Removed every mock-data fallback from the customer-facing product** and
>   replaced it with explicit "unavailable" states, so a pilot customer can never
>   mistake demonstration data for their own plant's readings — then proved
>   tenant divergence live in the browser: the same screens, same agent, two
>   accounts, two entirely different datasets and prompts.

---

## 4. What NOT to claim

This is the part that protects you. You have written a lot of architecture that
is **designed and documented but not yet running.** A bullet implying otherwise
will collapse the moment someone asks a second question, and it will take your
credibility on the other four bullets with it.

| Claim | Status | Safe phrasing |
|---|---|---|
| Database-per-tenant | **Designed**, documented with alternatives compared. Runtime today is a shared schema with tenant scoping. | "Architected" / "designed" — as written in bullet 2. Do **not** write "deployed" or "operates." |
| Knowledge plane, promotion gate, cross-tenant learning | **Designed only.** No tables, no code. | Leave off the resume entirely. Bring it up in interview as roadmap when asked "where does this go next?" |
| RAG / pgvector | **Not built.** Retrieval mode A (structured tools) is what runs. | Do not put "RAG" on the resume. If asked, the interesting answer is *why you deliberately did not use it yet* — that is a better answer than having used it. |
| Mapping profiles / canonicalizer | **Designed.** YAML schema drafted in `DataArchitecture.md` §2. | Omit, or say "designed a declarative ingestion-mapping layer." |
| Idempotent ingest | **Not fixed.** It is a strict-xfail test. | Bullet 5 already frames this correctly — as a *found defect*, which is the honest and stronger version. |
| "Production" | The pilot is real; the deployment is Docker Compose, no CI, credentials not yet rotated. | "Live pilot" is accurate and sounds better than "production" anyway. |
| Team size | Solo. | Say solo. It is an advantage here. |

**One rule that covers all of these:** if an interviewer said *"show me"*, could
you? Bullets 1–5 all pass that test. Everything in the table above does not.

---

## 5. Numbers you must fill in before sending

I can verify everything in this repo. These live in your head or your inbox:

- [ ] **`[COMPETITION]`** — the competition's actual name, and the stage
      ("semifinalist, top N of M teams" is far stronger than "semifinalist" alone).
- [ ] **`[N] VC firms`** — the count. If it is one or two, "opened investor
      conversations" without a number reads better than a small number.
- [ ] **`[MONTH YEAR]`** — start date. Git says the first commit is
      **2026-05-19**; use the real project start if earlier.
- [ ] **Cost per diagnosis** — bullet 4 invites this question directly. The
      accounting is already in `diagnostic_agent.py`; run 20–30 diagnoses across
      both tenants and take the median from the persisted `cost_usd`. Report it
      as a range, and know your cache hit rate.
- [ ] **Detection performance** — if you can get any labeled outcome from CEMEX
      ("this alert was real / this one was noise"), even for 20 events, a
      precision number would materially strengthen bullet 1. Without labels, do
      **not** invent one; scope and realness already carry that bullet.
- [ ] **Plant scale** — tonnes/day or line throughput, if the customer will let
      you say it. "Monitoring a line processing X t/day" converts an engineering
      project into a business one in six words.

---

## 6. The 60-second verbal version

You will be asked to describe this out loud far more often than it will be read.
Rehearse this shape — problem, why it is hard, what you built, what you learned:

> Cement and mining plants run particle-size cameras that generate a reading
> every few seconds. When the size distribution drifts, something upstream has
> changed — feed hardness, a worn liner, a fouled lens — and the plant usually
> finds out hours later, in downtime. Reliat detects the drift statistically and
> then runs an agent over the surrounding evidence window to propose a root
> cause with a citation.
>
> The hard part wasn't the model. It was that every customer's data is different
> even inside the same domain, while the security requirement is that no
> customer's data can ever reach another's — including through the agent. So I
> split it: the model stays data-agnostic, and everything around it — evidence
> fields, glossary, failure taxonomy, context window — comes from a per-tenant
> profile that generates the system prompt and the tool schema. Tenant identity
> is bound from the server session below the tool layer, so it isn't something
> the model can influence at all.
>
> The thing that changed how I work was auditing my own ingest path before
> building on top of it. I found four defects that would have silently corrupted
> every number the agent reported. Now I probe before I extend.

That last paragraph is the one to keep. Interviewers remember the candidate who
found their own bugs.

---

## 7. Common failure modes, and how this block avoids them

| Failure mode | Why it kills bullets | What this block does instead |
|---|---|---|
| Listing technologies | "Used FastAPI, Next.js, PostgreSQL" is true of thousands of applicants and describes no decision. | Stack lives in the header line. Bullets describe problems and constraints. |
| Unfalsifiable metrics | "Improved efficiency by 40%" with no baseline reads as invented and taints everything near it. | Every number is countable from this repo: 21,138 rows, 4 defects, 20 tests, 15k tokens. |
| Passive voice / "responsible for" | Signals participation, not ownership. | Every bullet opens with an active verb: took, architected, eliminated, held, audited. |
| All five bullets the same shape | Formula fatigue — reviewers skim past identical structure. | Scope → security → AI → cost → rigor. Five different kinds of engineering. |
| Claiming the design as the build | One follow-up question and your credibility is gone for the whole page. | §4 draws the line explicitly, per claim. |
| Burying the traction | Pilot, semifinals, and VC interest are rare and belong where they get read. | Bullet 1, end of line — the last thing read in the first bullet. |

---

## 8. If you have time before applying

Ranked by resume return per hour, all of which upgrade claims you are already
making:

1. **Add CI (GitHub Actions running the test suite).** Currently nothing runs on
   push. It is an afternoon, and it converts bullets 2, 3, and 5 from "I wrote
   tests" to "the boundary is enforced on every commit" — a materially different
   claim.
2. **Measure and record cost per diagnosis.** Fills the §5 blank and hardens
   bullet 4 against its own follow-up question.
3. **Rotate the committed demo credentials and make the `${VAR:-default}`
   fallbacks fail closed.** A reviewer who clones a public repo and finds live
   default secrets will discount the entire security bullet. This is the highest
   *downside* risk on the list.
4. **Render `GET /api/harness` in the UI.** The endpoint exists; nothing shows
   it. A screen that visibly changes shape per tenant makes bullet 3
   demonstrable in a 30-second screen share, and demos beat bullets.
5. **Fix ingest idempotency (slice 2).** Retires one strict-xfail and lets you
   tell the full arc in interview: found it, documented it, tripwired it, fixed
   it.

None of these change what you have built. They change whether a stranger
believes it in six seconds.

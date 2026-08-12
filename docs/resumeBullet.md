# Reliat — copyable resume bullets

Three versions. Reasoning and evidence live in `docs/resumeImprove.md`; this
file is only the text.

Fill in before sending: `[COMPETITION]`, `[N]`, `[MONTH YEAR]`.

| Version | Bullets | Length each | Total | Use when |
|---|---|---|---|---|
| **A — Full** | 5 | 3–4 lines | ~16 lines | Portfolio site, LinkedIn project section, personal-site case study. Too long for a page-constrained resume. |
| **B — Condensed** | 5 | 2 lines | ~10 lines | **Default.** Reliat is your headline project and has room to breathe. |
| **C — Tight** | 4 | 1–2 lines | ~7 lines | One-page resume with internships/other projects competing for space, or any application where Reliat is not the lead item. |

Header line, all versions:

```
Reliat — Founder & Engineer (solo)                          [MONTH YEAR] – Present
Agentic diagnostics for cement & mining plants
Python · FastAPI · PostgreSQL · TypeScript · Next.js · Anthropic API · Docker
```

---

## Version A — Full (5 bullets, ~16 lines)

- **Took an agentic industrial-diagnostics platform from zero to a live pilot** running on **21,138 real particle-size readings** from a CEMEX conveyor line, by designing and building the entire system solo — ingestion, anomaly detection, multi-tenant API, agent layer, and operator UI (~12k LOC); advanced to **[COMPETITION] semifinals** and into conversations with **[N] VC firms**.

- **Architected tenant isolation as a security property rather than a query filter** — database-per-tenant with a separate control plane, and tenant identity resolved from the server session *below* the agent's tool layer, so that a fully successful prompt injection still cannot reach another customer's plant data — **enforced by a test that walks the FastAPI router tree and fails any endpoint missing an authenticated principal.**

- **Eliminated free-text hallucination from the diagnosis path by giving one data-agnostic model N tenant-specific harnesses**: each customer declares its instruments, glossary, and failure taxonomy in a declarative profile that *generates* the system prompt and a forced tool schema whose diagnosis `enum` is bound to that tenant's categories — so the model **selects and cites** a root cause instead of writing one. **20 tests assert that no tenant's prompt can name another tenant's evidence fields.**

- **Held each diagnosis to one bounded, priced API call** — statistics computed in Python instead of by the model, context budgeted per section under a **15k-token target**, and the stable prompt prefix cached — with input/output/cache-read/cache-write tokens priced per run and persisted to Postgres for **per-tenant cost attribution**.

- **Audited the production ingest path before extending it and found 4 silent data-corruption defects** — re-ingest doubled every row, inverted percentiles (`F80 < F10`) were accepted as valid, timezones were dropped, and provenance was an untyped string — then **encoded each as a strict-xfail test** that fails the suite the moment it is fixed, and shipped a provenance table making every reading traceable to its source file.

---

## Version B — Condensed (5 bullets, ~10 lines) — **recommended**

- Built an agentic diagnostics platform for cement and mining plants solo (~12k LOC, Python/FastAPI/Next.js/Postgres) and took it to a live pilot on 21,138 real particle-size readings from a CEMEX conveyor line; [COMPETITION] semifinalist, in conversations with [N] VC firms.

- Architected multi-tenant isolation as a security boundary, not a query filter: database-per-tenant with tenant identity bound from the server session below the agent's tool layer, so a successful prompt injection still cannot cross customers.

- Cut hallucination risk by giving one data-agnostic model per-tenant harnesses — each customer's profile generates the system prompt and a tool schema whose diagnosis enum is its own failure taxonomy, so the agent cites a root cause instead of writing one.

- Held each diagnosis to a single bounded API call under a 15k-token budget by computing statistics in Python rather than in the model and caching the prompt prefix; priced all four token classes per run for per-tenant cost attribution.

- Audited the ingest path before extending it and found 4 silent data-corruption defects (duplicated re-ingest, inverted percentiles, dropped timezones, untraceable provenance); encoded each as a strict-xfail test and shipped a provenance table tracing every reading to its source file.

**Plain text, no markdown** (paste-safe into Word, Google Docs, LaTeX, Workday):

```
• Built an agentic diagnostics platform for cement and mining plants solo (~12k LOC,
  Python/FastAPI/Next.js/Postgres) and took it to a live pilot on 21,138 real
  particle-size readings from a CEMEX conveyor line; [COMPETITION] semifinalist, in
  conversations with [N] VC firms.
• Architected multi-tenant isolation as a security boundary, not a query filter:
  database-per-tenant with tenant identity bound from the server session below the
  agent's tool layer, so a successful prompt injection still cannot cross customers.
• Cut hallucination risk by giving one data-agnostic model per-tenant harnesses — each
  customer's profile generates the system prompt and a tool schema whose diagnosis enum
  is its own failure taxonomy, so the agent cites a root cause instead of writing one.
• Held each diagnosis to a single bounded API call under a 15k-token budget by computing
  statistics in Python rather than in the model and caching the prompt prefix; priced all
  four token classes per run for per-tenant cost attribution.
• Audited the ingest path before extending it and found 4 silent data-corruption defects
  (duplicated re-ingest, inverted percentiles, dropped timezones, untraceable provenance);
  encoded each as a strict-xfail test and shipped a provenance table tracing every reading
  to its source file.
```

---

## Version C — Tight (4 bullets, ~7 lines)

- Built an agentic diagnostics platform for mining and cement plants solo and took it to a live pilot on 21,138 real particle-size readings from a CEMEX conveyor line; [COMPETITION] semifinalist with active VC conversations.

- Architected multi-tenant isolation as a security boundary: database-per-tenant, tenant identity bound below the agent's tool layer so prompt injection cannot cross customers, enforced by a test that fails any unauthenticated endpoint.

- Gave one data-agnostic model per-tenant harnesses — each profile generates the system prompt and a tool schema whose diagnosis enum is its own taxonomy — so the agent cites a root cause instead of writing one, in a single 15k-token call priced per run.

- Audited the ingest path before extending it, found 4 silent data-corruption defects, and encoded each as a strict-xfail test so none could be silently forgotten or silently fixed.

**Plain text:**

```
• Built an agentic diagnostics platform for mining and cement plants solo and took it to a
  live pilot on 21,138 real particle-size readings from a CEMEX conveyor line;
  [COMPETITION] semifinalist with active VC conversations.
• Architected multi-tenant isolation as a security boundary: database-per-tenant, tenant
  identity bound below the agent's tool layer so prompt injection cannot cross customers,
  enforced by a test that fails any unauthenticated endpoint.
• Gave one data-agnostic model per-tenant harnesses — each profile generates the system
  prompt and a tool schema whose diagnosis enum is its own taxonomy — so the agent cites a
  root cause instead of writing one, in a single 15k-token call priced per run.
• Audited the ingest path before extending it, found 4 silent data-corruption defects, and
  encoded each as a strict-xfail test so none could be silently forgotten or silently fixed.
```

---

## What was cut, and why it was safe

Nothing load-bearing. Every deletion was a qualifier, a restatement, or a detail
that belongs in the interview rather than on the page.

| Cut from A | Why it survives being cut |
|---|---|
| "ingestion, anomaly detection, multi-tenant API, agent layer, operator UI" | "Built solo" plus the stack line already implies full scope. Enumerating components reads as padding. |
| "with a separate control plane" | Implementation detail of database-per-tenant. Comes up naturally in the follow-up question. |
| "20 tests assert no tenant's prompt can name another's evidence fields" | Kept as an interview answer. On the page, "cannot cross customers" is the claim that matters; the test count defends it when challenged. |
| "each customer declares its instruments, glossary, and failure taxonomy" | Compressed to "profile." The mechanism (generated prompt + enum-bound schema) is what carries the bullet. |
| "persisted to Postgres" | "Priced per run for per-tenant cost attribution" implies storage. |
| The four defects named individually (Version C only) | "4 silent data-corruption defects" is the number a screener retains. Naming them is a strong 20-second interview answer. |

**Heavy bold was removed deliberately.** Version A bolds ~40% of its text, which
means nothing stands out and, on a real resume, reads as shouting. B and C use
none: the numbers and the leading verbs do the work, and plain text survives
copy-paste into ATS forms that strip formatting anyway.

**Every bullet still opens with an active verb** (built, architected, cut, held,
audited, gave) and **still carries a hard number** (21,138 · 12k LOC · 15k tokens ·
4 defects). Those two properties are what both a six-second human scan and a
keyword-extracting screener actually key on.

---

## Notes on use

- **Order is deliberate and should not change.** Scope → security → AI → cost →
  rigor. Five different kinds of engineering, so the block never reads as
  formulaic. Version C drops the cost bullet by folding "15k-token call priced
  per run" into the harness bullet.
- **For AI/ML-engineer applications**, move the harness bullet to position 2.
  It is the most distinctive thing in the project.
- **For backend/infra applications**, consider swapping the last bullet for the
  database-recovery bullet in `resumeImprove.md` §3. Recoveries interview better
  than builds.
- **Do not mix versions.** Bullet length should be visually consistent down the
  page; a 4-line bullet next to a 1-line bullet looks unedited.
- **The "designed vs. built" line still applies at every length.** "Architected"
  is doing real work in the isolation bullet — the design is real and comparative,
  the runtime today is a shared schema. See `resumeImprove.md` §4 before
  strengthening that verb.

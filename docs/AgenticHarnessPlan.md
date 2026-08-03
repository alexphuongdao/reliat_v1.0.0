# Agentic Harness — Plan

Status: **planning document, not yet implemented.** Captures a real strategic pivot
in how the product's AI layer is architected, decided during the same session that
shipped the working Diagnostic Agent (see `OVERVIEW.md`, `DataSchema.md`). Nothing in
this doc has been built yet — it's the plan, written down before starting, the same
way `docs/v1.0.0-plan.md` and the Docker/schema planning were written down before
those got built.

---

## 1. The shift, in the founder's own framing

Direct from the planning conversation, preserved because the reasoning matters more
than the conclusion:

> As CTO, now I am looking at the final end result, our artifact — it actually works —
> but now I need to build the harness around it, like a real agent. For example, say I
> demo it and query "show me the outliers in the last 3 hours" or "show me the
> outliers and diagnosis in the past 4 days" — now, just like a true agent, my own
> system has to make tool calls, or I have to develop a prompt schema that triggers on
> the system end to QUERY the database, the source of truth (the CSV) and the
> analytical result, to precisely return the correct result of that range. This is
> what ensures the model does not hallucinate, and this is the true moat of our
> system — how I design this is going to help my product stand out.

The core insight: **the Diagnostic Agent we shipped tonight is grounded, but it's not
an agent in the "harness" sense.** It answers one fixed question ("why did this one
outlier happen?") with a hand-assembled context window. It cannot answer an
open-ended, arbitrary-range question a plant manager would actually ask in a demo,
because there's no mechanism for the model to go *get* the data that answers an
arbitrary query — the context is prepared for it in advance, not fetched by it on
demand.

## 2. Why this is the moat, not a buzzword

Any competitor can wire an LLM to a chat box and have it write a plausible-sounding
answer. The differentiator is **the model is structurally prevented from answering
without querying the actual source of truth first** — the ingested measurement/outlier
data in Postgres, which itself traces back to the real CEMEX CSV/`.xls` export. A
query like "outliers in the last 3 hours" either:

- resolves through a real, parameterized database query with real rows returned, or
- the agent has no way to answer it at all (no tool matched, no data returned →
  it must say so, not guess).

There is no third path where the model free-associates a plausible-sounding row of
numbers. That's the whole point, and it has to be enforced at the **system** level
(tool definitions, execution loop, prompt contract), not hoped for via a "please don't
hallucinate" instruction in the system prompt.

## 3. Current state, audited honestly

What exists right now, and what doesn't — this is the actual starting line for this
plan, not an aspiration:

| Capability | Status |
|---|---|
| Root-cause diagnosis for **one specific, already-identified** outlier | **Real.** `diagnostic_agent.py` — grounded in a real ±20/+5-sample measurement window, forced tool-call structured output, token/cost logged. This is Phase 1's diagnosis half. |
| Outlier **detection** (finding anomalies in the first place) | **Real, but not AI** — `detector.py` is a rule-based rolling z-score detector, explicitly documented in its own docstring as a placeholder. Runs at ingest time, not on-demand. |
| Open-ended natural-language queries ("show me outliers in the last N hours/days") | **Does not exist.** No tool-calling agent, no query loop. This whole doc is about building it. |
| Predicted downstream effect | **Fake.** `apps/web/components/screens/OutliersScreen.tsx` (~line 634, "Predicted downstream effect" section) renders a hardcoded static string ("Next 18–24 min: +6% draw on CV28 SAG Feed...") for **every outlier regardless of which one you open.** This was inherited from the original design mock and never replaced. Flagging explicitly so it isn't mistaken for a real feature in a demo. |
| Similar past outliers | **Fake.** Same file, ~line 645 — a `[1,2,3,4].map(...)` loop generating fabricated IDs and match percentages. No embedding/similarity search exists (see `DataSchema.md`, "What's not in the schema" — no vector column is populated). |
| Downtime / cost prediction, actionable-insight suggestion (**Phase 2** of the two-phase pipeline) | **Not built at all.** No table, no route, no agent. This doc does not cover building it — see §7. |
| Agent chat screen (`/agent`) | **100% mock** — `buildMock()`, canned scripted thread. This is the natural home for the harness once built (see §6). |

**Two-phase pipeline status, restated plainly:** Phase 1 = detect + diagnose root
cause. We have detection (rule-based) and diagnosis (real AI, single-outlier). We do
**not** have Phase 1's "possible effect" honestly answered — the UI currently fakes
it. Phase 2 = downtime prediction + cost impact + actionable-insight suggestion. **None
of Phase 2 exists.** This harness plan is entirely inside Phase 1's scope: it makes
Phase 1's *querying and reporting* real and grounded. It does not build Phase 2.

## 4. Design principle: tools, not text-to-SQL

Two ways to let an LLM "query the database." Picking the wrong one undermines the
entire anti-hallucination thesis:

- **Text-to-SQL** (model writes raw SQL, system executes it): flexible, but the model
  can write a query that's subtly wrong (wrong date math, wrong join, off-by-one on a
  time window) and the result will *look* grounded — real rows came back — while
  answering a different question than what was asked. Also a real injection/blast-radius
  surface if not sandboxed carefully.
- **Tool calling against pre-defined, parameterized query functions** (the model picks
  a tool and fills in typed arguments — `list_outliers(since: datetime, until:
  datetime, sev: str | None, channel_id: str | None)` — the system, not the model,
  owns the actual SQL): the model can only ask questions the tool surface was designed
  to answer correctly. Every possible tool call is a query a human already verified is
  correct. This is slower to extend (new question shape = new tool, or a new
  parameter) but it's the one that actually delivers "structurally cannot hallucinate
  the query," not just "structurally cannot hallucinate the free-text answer."

**Decision: tool calling, not text-to-SQL.** Matches what `docs/v1.0.0-plan.md` §6.3
already proposed months ago (`list_channels`, `get_outliers`, `get_measurements_window`,
etc.) — that section was written, never built. This plan is "actually build that,"
informed by the extra fields we now have (`outlier_diagnoses`, real vendor columns) that
didn't exist when it was first drafted.

## 5. Architecture

### 5.1 A second agent, not a replacement for the first

- **`diagnostic_agent.py` (exists)** — single-outlier, single-shot, hand-assembled
  context. Keep as-is. Good at what it does: deep, cited reasoning about one incident.
- **New: `query_agent.py`** — multi-turn, tool-calling loop, handles arbitrary
  natural-language questions about the fleet ("outliers in the last 3 hours," "which
  channel had the most critical outliers this week," "show me outlier X's diagnosis").
  This is the harness the founder is describing.

They can share the same Anthropic client wrapper and cost-logging pattern
(`outlier_diagnoses`-style token/cost tracking — see §5.4), but they are different
agents with different loop shapes: one is "gather evidence once, reason once," the
other is "loop: call a tool, read the result, decide whether to call another tool or
answer."

### 5.2 Tool surface v1 — mapped to tables that actually exist

Every tool is a typed Python function over the real schema in `DataSchema.md`. No tool
executes arbitrary SQL; each is a fixed, reviewed query with bound parameters.

```
list_outliers(since: datetime, until: datetime, channel_id: str | None = None,
              sev: list[str] | None = None, status: list[str] | None = None,
              limit: int = 200) -> list[OutlierSummary]
    -- SELECT ... FROM outliers WHERE t BETWEEN :since AND :until [AND ...] ORDER BY t DESC

get_outlier_detail(outlier_id: str) -> OutlierDetail
    -- outliers JOIN channels, plus the measurement window (reuses
    -- diagnostic_agent._window_for logic)

get_outlier_diagnoses(outlier_id: str) -> list[Diagnosis]
    -- SELECT * FROM outlier_diagnoses WHERE outlier_id = :id ORDER BY created_at DESC
    -- (already exists as a route — becomes a tool too)

get_channel_summary(channel_id: str, since: datetime, until: datetime) -> ChannelSummary
    -- outlier counts by severity, measurement count, min/max/mean F80 & topsize
    -- over the window — real aggregate SQL, not the model doing arithmetic

get_measurements_window(channel_id: str, since: datetime, until: datetime,
                         max_points: int = 500) -> list[MeasurementPoint]
    -- for when the question needs raw readings, not just outliers

list_channels() -> list[ChannelSummary]
    -- what channels exist, online/offline, real vs synthetic data flag
```

Every tool result includes enough for the agent to **cite** what it used — outlier
IDs, timestamps, row counts — so an answer like "there were 14 outliers on CV42 in the
last 3 hours, 2 critical" is traceable back to an exact `list_outliers(...)` call and
its exact returned rows, the same way `diagnostic_agent.py` cites specific numbers
from its measurement window today.

### 5.3 The loop

Standard Anthropic tool-use loop (`anthropic` SDK, same library already in use —
still no LangChain/Agent SDK needed for this; a handful of well-typed tools doesn't
need an orchestration framework):

1. User asks a question (from the `/agent` chat UI, once built).
2. Model receives the question + tool definitions, decides which tool(s) to call.
3. System executes the tool (real SQL, bound params) and returns real rows.
4. Model either calls another tool (e.g. `list_outliers` then `get_outlier_diagnoses`
   for the interesting ones) or answers, citing what it retrieved.
5. If no tool can answer the question (e.g. "predict tomorrow's downtime" — that's
   Phase 2, no tool exists for it), **the system prompt requires the model to say so
   explicitly**, not improvise. This is the enforcement point for the no-hallucination
   guarantee — it has to be a rule the model is instructed to follow *and* a fact
   about the tool surface (if the tool doesn't exist, there's nothing to call).

### 5.4 Grounding + cost accounting, reusing what already works

Reuse the exact pattern already proven in `diagnostic_agent.py` and `outlier_diagnoses`:
forced/guided tool use where applicable, defensive parsing of model output (schema
drift has already been observed once in production tonight — see `DataSchema.md`'s
note on `hypotheses`), and a token/cost-logged row per turn. New table needed:
`agent_turns` (or extend `outlier_diagnoses`'s pattern) — `session_id, role, content,
tool_calls_json, tool_results_json, input_tokens, output_tokens, cost_usd,
created_at`. This is the `agent_sessions`/`agent_messages` concept flagged as
not-yet-built in `DataSchema.md`'s NoSQL discussion — same `jsonb`-on-Postgres
recommendation applies here, no new database needed to build this.

## 6. Where this plugs into the product

The `/agent` screen (`apps/web/app/agent/page.tsx`, `AgentScreen.tsx`) is currently
100% mock (`buildMock()`, canned thread) — and is exactly the surface this harness is
for. Once `query_agent.py` + its route exist, wiring the Agent screen to real
tool-calling responses (instead of the scripted mock thread) turns the demo scenario
described in §1 — "show me the outliers in the last 3 hours" typed into that screen —
into a real, grounded answer. That UI wiring is downstream of the harness itself and
is not scoped into the milestones below (separate pass).

## 7. Explicitly out of scope for this plan

- **Phase 2** (downtime prediction, cost impact, actionable-insight generation) — no
  tool here answers "what will happen" or "what should I do about the plant
  schedule," because no data or model for that exists yet. A future `impact_agent.py`
  is a separate plan, once Phase 2 is scoped.
- Replacing the fake "Predicted downstream effect" / "Similar past outliers" UI blocks
  with real data — flagged in §3 as known-fake, but fixing them either needs Phase 2
  (downstream effect) or a real embedding/similarity feature (similar outliers,
  currently no vector column is populated) — both out of scope here.
- Wiring the `/agent` chat UI itself to the new agent (§6) — a follow-on task once the
  harness exists server-side.

## 8. Proposed milestones

1. **Tool functions** — implement the v1 tool surface (§5.2) as plain, tested Python
   functions over the existing SQLAlchemy models, independent of any agent — these
   should be directly unit-testable (call `list_outliers(since=..., until=...)`,
   assert real rows come back) before an LLM ever touches them.
2. **`query_agent.py`** — the tool-use loop (§5.3), grounded system prompt with the
   explicit "no tool, no answer" rule, defensive output parsing (reuse the lessons
   from `diagnostic_agent.py`).
3. **`agent_turns` table + migration** — persistence and cost tracking (§5.4).
4. **API route** (`POST /api/agent/query` or similar) — request in, grounded answer +
   citations + cost out.
5. **Manual eval pass** — run the exact demo questions from §1 ("outliers in the last
   3 hours," "outliers and diagnosis in the past 4 days") against real data, confirm
   every number in the answer traces back to an actual tool call, not model
   invention.
6. *(Follow-on, separate task)* Wire `/agent` screen to the new route, replacing the
   mock thread.

## 9. Open questions for the founder

- Should `query_agent.py` be allowed to call `diagnostic_agent.py`'s single-outlier
  diagnosis as a tool itself (e.g. "show me outliers in the last 3 hours **and their
  diagnoses**" → list, then diagnose each one that lacks a diagnosis yet)? That's a
  real cost/latency multiplier (N outliers → N diagnosis calls) worth deciding
  deliberately, not by accident — vs. only surfacing *existing* diagnoses
  (`get_outlier_diagnoses`) and telling the user which ones haven't been diagnosed yet.
- Multi-turn memory: does the harness need to remember earlier turns in the same
  session ("now filter that to just critical ones"), or is each query independent for
  v1? Affects whether `agent_turns` needs a `session_id` grouping from day one.

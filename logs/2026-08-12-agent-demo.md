# 2026-08-12 — Agent tab: durable threads and auditable artifacts

Before this, a diagnosis existed only as an `outlier_diagnoses` row reachable
from the one outlier it belonged to, and the Agent tab was 559 lines of
fabrication with no API call in it. Now every agent run is a durable
conversation the Agent tab lists, reopens, and renders with its artifact.

Split out of `2026-08-12-demo-hardening.md` because it is its own topic — that
file covers the pre-demo defect sweep, this one covers the agent surface.

| Version | What landed | Suite |
|---|---|---|
| `v1.0.7` | Schema + API: `agent_threads`, `agent_messages`, two GET routes | 31 pass / 3 xfail |
| `v1.0.8` | Agent tab rebuilt on real data; canned reply deleted | 31 pass / 3 xfail |
| `v1.0.9` | `ask_prompt()`, `ask_tools()`, per-tenant loop budget. Route-walk fix. | 64 pass / 3 xfail |
| `v1.0.10` | `agent_tools.py` (executor) + `agent_context.py` (budget). **Checkpoint.** | 105 pass / 3 xfail |

---

## Where the AI code lives

Recorded because it took a pass through the repo to establish, and the next
session should not repeat it.

| File | Lines | What it is |
|---|---|---|
| `services/api/app/harness.py` | 373 | **The harness.** `TenantHarness` → `system_prompt()`, `diagnosis_tool()`, `format_window()`. The thing that grows per tenant. |
| `services/api/app/diagnostic_agent.py` | 238 | One forced-tool Anthropic call. No orchestration framework. |
| `services/api/app/agent_threads.py` | 130 | **New.** Records a run as conversation. Calls no model. |
| `services/api/app/routes/agent.py` | 172 | **New.** `GET /api/agent/threads`, `GET /api/agent/threads/{id}`. |
| `services/api/app/routes/outliers.py` | 200 | `POST /{id}/diagnose`, `GET /{id}/diagnoses` |
| `apps/web/components/screens/AgentScreen.tsx` | 430 | **Rewritten.** Was entirely fake. |

## How the hypothesis percentages work

They come **straight from the model**. `harness.py:197` declares, per hypothesis:

```python
"confidence": {"type": "number", "minimum": 0, "maximum": 1}
```

The model fills that number in. Nothing computes, normalises or calibrates it —
one observed run read 62 + 25 + 15 = **102%**, another 55 + 25 + 15 + 5. They
are independent self-reports, not a probability distribution.

What *is* enforced: `failure_category` must be in that tenant's enum and is
dropped to `None` otherwise (`diagnostic_agent.py:207`); 1–4 hypotheses; forced
`tool_choice` so the model cannot answer in prose; every statistic computed in
Python and passed in as evidence. **The reasoning is grounded; the percentages
are not.** Calibrating them needs outcome labels, which do not exist yet.

## What changed

### Backend (`v1.0.7`)

| File | Change |
|---|---|
| `services/api/app/models.py` | New `AgentThread`, `AgentMessage`. |
| `alembic/versions/b1273c009c8e_*.py` | Two `CREATE TABLE`s. Purely additive. |
| `services/api/app/agent_threads.py` | New. `thread_for_outlier()`, `record_diagnosis_run()`. |
| `services/api/app/routes/agent.py` | New. Thread list and detail, tenant-scoped. |
| `services/api/app/routes/outliers.py` | `diagnose` also records the run. **Response shape unchanged.** |
| `services/api/tests/test_cross_tenant_leak.py` | Seeds a thread per tenant; new markers. |

### Frontend (`v1.0.8`)

| File | Change |
|---|---|
| `apps/web/components/screens/AgentScreen.tsx` | Rewritten — all 559 lines. |
| `apps/web/lib/types.ts` | `AgentThreadSummary`, `AgentThreadDetail`, `AgentMessage`, `AgentArtifact`. |
| `apps/web/lib/api.ts` | `agentThreads()`, `agentThread(id)`. |
| `apps/web/app/(app)/agent/page.tsx`, `components/shell/AppShell.tsx` | `initialThread` prop dropped — the screen loads its own data. |

## What was deleted

- **`send()` — a 900ms `setTimeout` returning a fixed reply.** It cited
  `CV42 Tunnel` alongside `CV33 Crusher Out` and `OUT-1L on CV09 ROM`. **`cv42`
  is CEMEX; `cv33` and `cv09` are the demo tenant.** The fake answer mixed two
  customers' channels into one response — to a customer, indistinguishable from
  a data leak. This was the highest-priority item in the repo.
- **Five hardcoded thread titles** ("Why did CV42 spike at 02:47?", "CV09
  grizzly recurrence", …) under fake "Today" / "Yesterday" / "This week"
  headings.
- **Fabricated `evidence`, `refs` and `followups`** on every reply.

## Decisions worth remembering

**`agent_threads.tenant_id` is its own column.** Every other table reaches the
tenant through a channel. A thread does not have to be about a channel — an
operator can ask a question scoped to nothing — so there is no join to lean on.
That makes it the easiest table in the schema to leak from, which is exactly why
the leak test now seeds it.

**The message points at the diagnosis; it does not copy it.**
`agent_messages.diagnosis_id` references `outlier_diagnoses`. Copying
`root_cause` and `hypotheses` into the transcript would let the artifact and the
record of it drift, and the artifact is the thing that has to be auditable. The
Agent tab and the Outliers tab therefore render the same row and cannot
disagree.

**One thread per outlier, not per run.** Re-running is a further turn in the
same conversation. That is what makes the history worth reading — you can see it
was asked three times and what changed between answers.

**The Outliers screen was not touched.** `POST /diagnose` returns the shape it
always did; recording is a side effect. The requirement was that the Outliers
tab stays untouched, so the new surface had to be additive at the API level too.

**The composer is deliberately inert.** A conversational turn needs a harness
path that does not exist: a different tool set from `submit_diagnosis`,
multi-turn context, its own token budget. The old screen faked exactly this. The
input now says plainly that free-form questions are not wired up and that
diagnostic runs appear when they finish. An input that admits it is not
connected beats one that invents an answer.

**Percentages are labelled `model-stated, not calibrated`.** Showing the number
without that qualifier is the same overclaim as the old "AI explanation"
heading, one level down.

**Interaction is navigation, for now.** "Open outlier" and "Open <channel>"
route into the existing screens rather than reimplementing them in the
transcript. That is what "interactable" can honestly mean before there is a
conversational endpoint.

## Bug found during verification

**The leak test caught `GET /api/agent/threads/{thread_id}` the moment the
router was registered**, before a single test had been written for it:

```
AssertionError: '{' unexpectedly found in '/api/agent/threads/{thread_id}'
  : GET /api/agent/threads/{thread_id} missing PARAM_VALUES entry
```

That is the whole argument for enumerating routes rather than listing them.

**`form_input` does not drive React controlled inputs in this app.** Cost about
twenty minutes. `find` the element, `left_click` it by `ref`, then `type`.
Clicking by coordinate is also unreliable — the login banner shifts the fields
by a few pixels depending on the signed-in name.

## Verified

Migration safety:

| Check | Result |
|---|---|
| `measurements` before / after migration | **36,978 / 36,978** |

API, two cookie jars:

| Check | Result |
|---|---|
| CEMEX threads before any run | `[]` |
| After `POST /diagnose` on `OUT-F0A184698970` | `TH-2a070c7ae201` — "CV42 Tunnel · Topsize excursion", 2 messages, $0.0093 |
| Thread detail | `[user]` "Diagnose OUT-… Topsize 2.78mm at 2.1σ" → `[assistant]` + artifact `DIAG-6ed3e15b5661`, 4 hypotheses, conf 0.68 |
| demo tenant `GET /api/agent/threads` | `[]` |
| demo tenant requesting the CEMEX thread | **404** |
| Sabotage tenant filter on `GET /api/agent/threads` | **FAIL** — `leaked 'chan-bravo' from tenant BRAVO (status 200)` |
| Restore + full suite | 31 passed, 3 xfailed |

In-browser as CEMEX, 1508×815:

| Check | Result |
|---|---|
| Thread sidebar | `CV42 Tunnel · Topsize excursion` — `8m ago · 2 msg · $0.0093` |
| Assistant turn | Root cause citing Topsize 2.781 mm vs baseline 0.666 mm, F80 1.186 mm, RGB stable |
| Artifact header | `AUDITABLE ARTIFACT  DIAG-6ed3e15b5661` |
| Ranked hypotheses | 4, categories `upstream_blast` / `process_control` / `instrument` / `equipment`, each with supporting **and** contradicting evidence |
| Footer | `claude-haiku-4-5-20251001 · 4367 tokens · $0.0093` |
| "Open outlier" | Navigates to `/outliers?o=OUT-F0A184698970`, row expanded, **same artifact** |
| Outliers screen behaviour | Unchanged |
| `tsc --noEmit` | clean |

---

# `v1.0.9` — the `ask` action space

The harness could describe one thing: how to diagnose an outlier whose evidence
we had already chosen. A free-text question is a different shape — the model has
to *find* the evidence — so it needs a second prompt, a set of read tools, and a
budget, because a loop the model steers can grow along dimensions a single call
cannot. This adds all three to `TenantHarness`. Nothing calls them yet.

Design is `docs/diagrams/reliat-agent-harness.excalidraw` (the loop) and
`reliat-harness-detail.excalidraw` (the objects, band 4 for the file layout).

## What changed

| File | Change |
|---|---|
| `app/harness.py` | `ContextPolicy` gains `max_rounds`, `max_input_tokens`, `max_cost_usd`, and two sub-budgets. New `ask_prompt()`, `ask_tools()`, `evidence_field()`. Tool names and caps hoisted to module constants. |
| `app/routes/harness.py` | `GET /api/harness` now returns `askTools`, `maxRounds`, `maxInputTokens`, `maxCostUsd`. |
| `tests/_routes.py` | **New.** Version-proof route enumeration — see the bug below. |
| `tests/test_route_isolation.py` | Uses the walk; new tripwire test on the walk itself. |
| `tests/test_cross_tenant_leak.py` | Uses the walk; refuses to run if it returns fewer than 20 routes. |
| `tests/test_harness_isolation.py` | 20 new tests: `TestAskActionSpace`, `TestAskPrompt`, loop-budget bounds. |

## Decisions worth remembering

**Tool names and row caps are module constants, not literals inside the
schema.** `MAX_OUTLIER_ROWS` is read by the thing that tells the model the limit
and, in `v1.0.10`, by the thing that clamps the query. One definition. A schema
that advertises 50 while the executor allows 500 is exactly the kind of drift
nobody notices until it is a bill.

**`metric` is enum-bound to the tenant's own evidence fields.** Not "the model is
instructed not to ask for SDRatio10_5" — for the demo harness the value is not in
the enum, so the call cannot be formed. The test asserting this also asserts
CEMEX *does* have it, so the check can't pass by both being empty.

**No tool takes a scope parameter, and a test enforces the absence.** The
executor adds `principal.tenant_id` regardless, so a `tenant_id` argument would
be inert — but an inert field is a field someone later wires up, and it gives a
prompt injection somewhere to aim. `test_no_tool_accepts_a_scope_parameter`
scans every property name of every tool for scope words.

**`ask_prompt()` never says the word "tenant".** Same reasoning one level up. The
boundary is bound below the model; naming it in the prompt only supplies a
concept for an injected instruction to argue with. This forced a wording change
in the GENERIC profile's operating rule ("this site", not "this tenant").

**The budget sub-allocations deliberately do not sum to the ceiling.** History
gets 4k, tool results 6k, out of 15k. The remainder is the system prompt, tool
schemas and the question. If the parts summed to the whole there would be no
headroom and a long thread could crowd out the evidence it was asking about.

**`max_cost_usd` is a backstop, not the control.** Rounds and tokens bind first
and bind predictably. The dollar cap exists for the case where they somehow do
not. $1.00 per call for both tenants, per your decision.

## Bug found during verification

**The route-enumerating security tests had gone vacuous.** Both
`test_route_isolation` and `test_cross_tenant_leak` work by walking
`app.routes` and filtering `isinstance(route, APIRoute)`. FastAPI **0.141**
changed `include_router()` to leave an opaque `_IncludedRouter` wrapper in that
list instead of flattening the routes into it; the real routes now hang off
`.original_router.routes`.

Measured on the installed version:

```
fastapi 0.141.1
old comprehension:  1 routes      ← /api/health, the one route with no data
new walk         : 22 method-routes
```

So the leak test was iterating a single route — the health check — and asserting
nothing about the other 21. It would have reported "passed" while every data
route went unchecked.

It surfaced only by luck: `test_public_allowlist_has_no_stale_entries` compares
the allowlist against live routes, so an empty walk made *that* fail loudly. The
two tests that actually matter failed for a downstream reason, not because they
detected their own blindness.

Fixed by `tests/_routes.py`, which unwraps `original_router` and any nested
`routes` recursively, and by two new guards so this cannot go quiet again:
`test_the_route_walk_actually_finds_routes` asserts >20 routes and names five
that must be present, and `_routes()` in the leak test asserts the same before
running any check.

Worth stating plainly: **the isolation evidence recorded for `v1.0.2`–`v1.0.8`
was collected on an older FastAPI where the walk worked.** The sabotage runs
that proved the tests could fail were real. But anything re-run after the image
was rebuilt would have been measuring almost nothing, and the suite would not
have said so.

## Verified

Host venv, Python 3.13 / FastAPI 0.141.1:

| Check | Result |
|---|---|
| Full suite | **64 passed, 3 xfailed** |
| Route walk, old comprehension vs new | **1 → 22** method-routes |
| Walk finds `/api/channels`, `/api/outliers`, `/api/agent/threads`, `/api/harness`, `/api/auth/login` | yes |
| `DEMO.ask_tools()` `channel_stats.metric` enum | 5 labels, no `SDRatio10_5`, no `Video*` |
| `CEMEX.ask_tools()` same enum | 9 labels, includes `SDRatio10_5` |
| Scope-word scan over every tool property, all 3 harnesses | none found |
| `ask_prompt()` contains `"tenant"`, all 3 harnesses | no |
| Action space | exactly 5 read tools + `submit_answer` |

## Still open after `v1.0.9`

- **Nothing calls `ask_tools()` yet.** The schemas are correct and unused until
  the executor lands.
- **The container image and the host venv now differ.** Tests run on the host;
  the API container has no pytest. Worth pinning `fastapi` in `pyproject.toml`
  rather than `>=0.115` — an unpinned minor bump is what silently disarmed the
  security suite.

---

# `v1.0.10` — the executor and the budget

The two modules the whole security claim rests on. `v1.0.9` described what the
model may *say*; this decides what actually runs, and how much of it fits.

Still no loop and no route — nothing here can be reached from the network yet.
That is deliberate: this is the agreed review checkpoint, because if the
executor is wrong every guarantee above it is decorative.

## What changed

| File | Change |
|---|---|
| `app/agent_tools.py` | **New, 460 lines.** The five read tools, the dispatch table, `run_tool()`, `validate_citations()`. |
| `app/agent_context.py` | **New, 300 lines.** `ContextBuilder` — measures before send, elides in a fixed order, refuses rather than truncates. |
| `tests/test_agent_tools.py` | **New, 19 tests.** Hostile arguments across the whole action space, both directions. |
| `tests/test_agent_context.py` | **New, 22 tests.** Budget arithmetic, elision order, message shaping. |

## Decisions worth remembering

**`run_tool(name, args, *, tenant_id: str, ...)` — the tenant is a required
`str`, not a principal it reads.** This is the strongest thing in the module and
it is a shape, not a check. There is no default, no `Optional`, and no principal
to interrogate, so there is no code path through this file that reaches the
database without a tenant named at the call site. A superadmin principal
(`tenant_id is None`) cannot be passed through by accident: it raises.

This deviates from what the diagram drew (`run_tool(..., principal, session)`).
Passing the principal would have meant every branch reading `principal.tenant_id`
and every branch having to remember the `is None` case. Passing `tenant_id: str`
moves that decision to exactly one place — the loop, in `v1.0.11` — and makes the
rest structurally incapable of getting it wrong.

**One `_owned_channel()`, not a filter per tool.** Three tools accept a
`channel_id`. All three resolve it through the same function, which has the
tenant predicate baked in and returns `None` rather than a foreign row. One
place to read when asking whether channel access is scoped, and one place a
sabotage test can prove matters.

**A foreign id and a nonexistent id get byte-identical answers.** Same reasoning
as 404-not-403 on the HTTP surface, one layer down: if `chan-bravo` produced a
different error than `chan-nope`, the executor would be an enumeration oracle
for another customer's channel and event ids — reachable by anything that can
influence the model's tool arguments. `test_naming_another_tenants_channel_is_
indistinguishable_from_a_typo` compares the two error strings with the id itself
masked out.

**`channel_stats` anchors on the channel's newest sample, not `now`.** This is
historical plant data. Anchoring a "last 24h" window on wall-clock time returns
zero rows for every question, and the model correctly concludes the channel is
silent — a confidently wrong answer produced by a correct model reading a
badly-built context.

**`metric` resolves through `harness.evidence_field()`.** That is the only path
from a model-supplied string to a column read. Asking for `psd`, `id`, or
`__class__` fails; asking for `SDRatio10_5` succeeds under the CEMEX harness and
fails under the demo one, on the same row, with the column populated.

**Errors go back to the model; only caller mistakes raise.** A bad enum value
costs one round and a correction. A missing tenant is a programming error and
must not be recoverable.

**Elision replaces a result's content, it does not remove the message.** The API
requires every `tool_use` block to be answered by a `tool_result`; dropping the
message would orphan the block and get the request rejected outright. The marker
keeps `row_count` and up to 12 ids, so an elided result stays citable — losing
the ids would make everything the model read unciteable, and citation is the
entire audit trail.

**Elision state is recomputed from scratch on every build.** The loop keeps no
context in memory between rounds; the builder is handed the harness, the
history, and every round so far, and reconstructs the request. That is what
"the context is refilled on every re-invocation" means here, and it is why a
result elided under a tight earlier build stops being elided once it fits.

**Results are given up before history.** A tool result can be re-fetched for the
cost of one round. A dropped conversation turn is gone, and losing the question
someone asked two turns ago is how an agent starts answering something nobody
asked.

**Token estimate is `len/3.0`, deliberately pessimistic.** No local tokenizer,
and calling the count-tokens endpoint would add a network round trip to every
iteration. English prose is ~4 chars/token, JSON ~3. Erring high drops evidence
marginally early; erring low means discovering the ceiling as a paid-for API
error. A test pins the direction.

## Verified

Full suite, host venv (Python 3.13 / FastAPI 0.141.1):

| Check | Result |
|---|---|
| `pytest -q` | **105 passed, 3 xfailed** |
| New tests | 19 executor + 22 context builder |

**Sabotage — the tenant predicate removed one at a time, suite re-run each
time.** A security test that has never been seen to fail is not evidence.

| Predicate removed | Result |
|---|---|
| `_owned_channel` → `Channel.tenant_id == tenant_id` | **DETECTED** — 2 failed |
| `_list_channels` → `.where(Channel.tenant_id == tenant_id)` | **DETECTED** — 3 failed |
| `_query_outliers` → `.where(Channel.tenant_id == tenant_id)` | **DETECTED** — 1 failed |
| `_get_diagnosis` → `Channel.tenant_id == tenant_id` | **DETECTED** — 2 failed |
| Restored, suite re-run | 105 passed, 3 xfailed |

Hostile-argument matrix — every tool × 12 argument sets, both directions
(ALPHA reaching for BRAVO, BRAVO reaching for ALPHA). Includes `tenant_id` and
`all_tenants` keys the schema does not define, SQL fragments in string fields,
and `limit: 100000`:

| Check | Result |
|---|---|
| Any BRAVO marker in an ALPHA payload | none |
| Any ALPHA marker in a BRAVO payload | none |
| `run_tool(tenant_id=None / "" / 0)` | `ValueError`, no query issued |
| Unknown tool name | error payload, no dispatch |
| `limit: 100000` | clamped to 50, `truncated: true` |
| `before/after: 9999` | clamped to 40 / 20 |
| `metric` = `id`, `psd`, `__class__`, `channel_id`, `sieve_passing_raw` | all rejected |
| `SDRatio10_5` under CEMEX / under DEMO, same row | accepted / rejected |
| Citation of an id no tool returned | rejected |
| Citation of a real outlier id under `kind: "diagnosis"` | rejected |

Context builder:

| Check | Result |
|---|---|
| 6 rounds × 120 rows + 4k-word history | fits under 15,000, 6 results elided |
| Elision order | oldest first, no holes |
| History dropped only after results exhausted | yes |
| Question of 200,000 chars | `ContextTooLarge`, names the ceiling |
| `build()` twice on the same rounds | identical messages and token count |
| Every `tool_use` paired with a `tool_result`, before and after elision | yes |
| No two consecutive same-role messages | yes |

## Still open after `v1.0.10`

- **Nothing calls either module.** No loop, no route, no UI. The composer is
  still inert.
- **Cost is not yet enforced anywhere.** `max_cost_usd` is declared and read by
  nothing until the loop lands — the ceiling that actually binds today is the
  token estimate.
- **The estimate is an estimate.** It has never been compared against the real
  `usage.input_tokens` from a live call. First thing worth checking once
  `v1.0.11` makes one: if it reads low, the divisor moves.
- **`validate_citations` is written and unused.** Wiring it into the forced
  `submit_answer` is `v1.0.11`.

---

## Still open

- **No conversational turn.** Listing and reopening works; typing does not. This
  is the next harness milestone — same `TenantHarness`, second tool path,
  multi-turn context, its own budget. `kind="ask"` is defined and unused,
  waiting for it.
- **The drawer (⌘J) opens the most recent thread**, not one scoped to the
  outlier you opened it from.
- **No pagination, archive or delete.** `GET /threads` caps at 500. No retention
  story, which matters for a contract-termination deletion request.
- **Failed runs are recorded but untested in the UI** — a failed diagnosis
  writes an assistant turn with the error text and no artifact. Correct, unseen.
- **Percentages remain uncalibrated.** They will stay that way until there are
  outcome labels. Asking CEMEX for even twenty is in the other log's
  "What I need from you".

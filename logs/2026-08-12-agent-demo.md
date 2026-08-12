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

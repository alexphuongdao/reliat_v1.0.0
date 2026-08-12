"""Conversational agent harness — the `ask` tool path.

Companion to gen_system.py / gen_data.py. Regenerating overwrites hand edits.
"""
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from excal import *  # noqa

c = Canvas()
L, R = 140, 2000
W = R - L

# ── header ──────────────────────────────────────────────────────────
c.text(L, 40, "Reliat — Conversational Agent Harness", 34, T_TITLE)
c.text(L, 92, "The `ask` path. One question, a bounded tool loop over the tenant's own rows, one cited answer. The model never sees another tenant's data and never writes a number it did not read.",
       15, T_BODY)
c.text(L, 118, "Design as of 2026-08-12. Solid = built.  Dashed = this design, not yet built.  Red = the isolation boundary.", 14, "#b45309")

c.rect(1660, 36, 40, 26, "", SUCCESS, roughness=0, sw=2)
c.text(1712, 42, "built", 13, T_BODY)
c.rect(1800, 36, 40, 26, "", INACTIVE, dashed=True, roughness=0, sw=2)
c.text(1852, 42, "planned", 13, T_BODY)

# ══ 1 · THE ASK ═════════════════════════════════════════════════════
c.group(L, 180, W, 150, "1 · THE ASK  —  a person types a question")
c.rect(180, 215, 620, 95,
       "Agent tab composer\nPOST /api/agent/threads/{id}/messages\nor POST /api/agent/ask  (new thread)",
       INACTIVE, size=14, dashed=True, roughness=0)
c.rect(860, 215, 500, 95,
       "Principal (from session cookie)\nuser · tenant · role\nresolved from the DB every request",
       SUCCESS, size=14, roughness=0)
c.rect(1420, 215, 520, 95,
       "TenantHarness\nharness_for_tenant(principal.tenant)\nglossary · fields · categories · budget",
       SUCCESS, size=14, roughness=0)

# ══ RED RAIL — the boundary ═════════════════════════════════════════
c.arrow([(L, 372), (R, 372)], "#dc2626", sw=3, head=None)
c.text(L, 340,
       "TENANT BOUNDARY — bound here, once, from the session. `tenant_id` is NOT a tool parameter and NOT in the prompt. A fully successful prompt injection cannot move it.",
       14, "#dc2626")

# ══ 2 · CONTEXT ASSEMBLY ════════════════════════════════════════════
c.group(L, 410, W, 250, "2 · CONTEXT BUILDER  —  deterministic, Python, never the model")
ctx = [
    (180, "System prompt\nharness.ask_prompt()\ncached prefix\n~1.5k tok", SUCCESS),
    (560, "Tool schemas\nharness.ask_tools()\nenum-bound to\nthis tenant\n~1.2k tok", SUCCESS),
    (940, "Thread history\nlast N turns,\nolder elided with\nan explicit marker\n≤4k tok", INACTIVE),
    (1320, "Tool results\ntruncated per call,\nrow counts kept\n≤6k tok", INACTIVE),
    (1700, "Question\nthe user's text\n≤0.5k tok", INACTIVE),
]
for x, label, pal in ctx:
    c.rect(x, 450, 340 if x < 1700 else 280, 145, label, pal, size=13,
           dashed=(pal is INACTIVE), roughness=0)

c.rect(180, 612, 1760, 34,
       "HARD CEILING 15,000 input tokens per call  ·  measured before send  ·  over budget → oldest tool results dropped first, then history, then refuse",
       DECISION, size=13, roughness=0)

# ══ 3 · THE LOOP ════════════════════════════════════════════════════
c.group(L, 700, W, 470, "3 · THE BOUNDED TOOL LOOP  —  retrieve, then answer")

c.rect(180, 750, 300, 90, "Anthropic\nmessages.create\ntools=ask_tools", AI, size=14, roughness=0)
c.rect(560, 750, 300, 90, "stop_reason?", DECISION, size=15, roughness=0)

# tool_use branch
c.rect(940, 735, 420, 120,
       "TOOL EXECUTOR  (our code)\nre-scopes EVERY query to\nprincipal.tenant_id\nparameterised SQL only",
       WARNING, size=13, roughness=0)
c.rect(1440, 735, 500, 120,
       "Postgres — this tenant's rows\nchannels · measurements · outliers\noutlier_diagnoses · agent_threads",
       SUCCESS, size=13, roughness=0)

c.arrow([(480, 795), (560, 795)])
c.arrow([(860, 795), (940, 795)])
c.text(872, 762, "tool_use", 12, T_BODY)
c.arrow([(1360, 795), (1440, 795)])
# result feeds back up
c.arrow([(1650, 735), (1650, 700), (330, 700), (330, 750)], SLATE, dashed=True)
c.text(900, 672, "tool_result appended → next turn  (loop)", 13, T_BODY)

# end_turn branch
c.rect(560, 900, 300, 90, "submit_answer\nforced tool", AI, size=14, roughness=0)
c.arrow([(710, 840), (710, 900)])
c.text(724, 858, "end_turn", 12, T_BODY)

c.rect(180, 1030, 1760, 100,
       "STOP CONDITIONS — whichever comes first\n"
       "max 6 tool rounds   ·   input tokens would exceed 15k   ·   cumulative cost > tenant ceiling   ·   model calls submit_answer\n"
       "On exhaustion the loop forces submit_answer with what it has. It never returns an unanswered turn and never silently truncates evidence.",
       DECISION, size=13, roughness=0)

# ══ 4 · THE TOOLS ═══════════════════════════════════════════════════
c.group(L, 1210, W, 300, "4 · THE ACTION SPACE  —  what the model may do (nothing else)")
tools = [
    (180, "list_channels()\nthis tenant's channels\nno arguments"),
    (560, "query_outliers(\n channel?, sev?, status?,\n since?, until?, limit≤50)"),
    (940, "measurement_window(\n channel, around_t,\n before≤40, after≤20)"),
    (1320, "channel_stats(\n channel, metric, window)\ncomputed in Python"),
    (1700, "get_diagnosis(\n outlier_id)\nexisting artifact"),
]
for x, label in tools:
    c.rect(x, 1255, 340 if x < 1700 else 280, 120, label, PRIMARY, size=13, roughness=0)

c.rect(180, 1400, 1760, 90,
       "submit_answer(answer, citations[])  —  TERMINAL, FORCED\n"
       "`citations` must reference ids the executor actually returned this turn. An answer citing an id that was never retrieved is rejected and the loop\n"
       "re-prompts once. This is what makes the answer auditable rather than merely fluent.",
       AI, size=13, roughness=0)

# ══ 5 · WHY THIS IS THE MOAT ════════════════════════════════════════
c.group(L, 1560, W, 330, "5 · WHY THIS IS DEFENSIBLE  —  four properties, each enforced in code")
moat = [
    (180, "1 · DATA-AGNOSTIC MODEL,\nTENANT-SPECIFIC HARNESS\n\nOne model. N harnesses.\nA new customer is a profile,\nnot a fork.", SUCCESS),
    (640, "2 · GROUNDED BY\nCONSTRUCTION\n\nEvery number comes from a\nrow the executor returned.\nStatistics computed in Python.", SUCCESS),
    (1100, "3 · ISOLATION UNDER\nADVERSARIAL PROMPTS\n\ntenant_id is bound below the\nmodel. Injection cannot reach\nit. 404, never 403.", WARNING),
    (1560, "4 · AUDITABLE ARTIFACT\n\nEvery turn persists: prompt,\ntools called, rows cited,\ntokens, cost. Replayable.", AI),
]
for x, label, pal in moat:
    c.rect(x, 1605, 420, 250, label, pal, size=13, roughness=0)

c.rect(180, 1900, 1760, 34,
       "The moat is not the model. It is the harness, the action space, and the boundary — all of which are ours and none of which a competitor gets by calling the same API.",
       DECISION, size=13, roughness=0)

# ══ 6 · WHAT IS NOT IN SCOPE YET ════════════════════════════════════
c.group(L, 1980, W, 200, "6 · DELIBERATELY NOT IN THIS PATH")
notout = [
    (180, "Vector search\nNo embeddings. Mode A\n(structured tools) answers\n~80% of real questions.", INACTIVE),
    (640, "Cross-tenant learning\nThe knowledge plane and\npromotion gate stay out\nuntil a human gate exists.", INACTIVE),
    (1100, "Writes\nThe agent reads. It cannot\nacknowledge, resolve or\nassign. Humans do that.", INACTIVE),
    (1560, "Free SQL\nNo generated SQL, ever.\nTyped tools → parameterised\nqueries only.", INACTIVE),
]
for x, label, pal in notout:
    c.rect(x, 2025, 420, 130, label, pal, size=13, dashed=True, roughness=0)

c.save(str(__import__("pathlib").Path(__file__).resolve().parents[1] / "reliat-agent-harness.excalidraw"))
print("wrote reliat-agent-harness.excalidraw")

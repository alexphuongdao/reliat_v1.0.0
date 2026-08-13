"""Per-tenant agent harness.

The model is data-agnostic. The harness is not.

Two tenants in the same industry can send completely different measurements
from completely different instruments, and the thing that makes an agent
useful on both is not a better model — it is a different *context*: which
evidence fields exist, what the metrics mean, what the plant's own operating
rules are, and which failure categories are even possible.

Concretely, in this repo right now:

  - `cemex` runs a real MINITAB CV42 analyzer. Its rows carry 17 raw
    inch-keyed sieve columns, `SDRatio10_5`, and raw video RGB. F80 sits
    around 1.0 mm.
  - `demo` runs synthesized channels. Those columns are all NULL, and F80
    sits between 20 and 120 mm.

Give the demo tenant CEMEX's prompt and the model is told to cite sieve
percentages and RGB intensities that do not exist for a single one of its
rows. It will either report "n/a" across the board or, worse, invent them.
That is the whole argument for this module: the harness has to be per-tenant
because the *data* is per-tenant.

Adding a tenant is meant to be data, not prose — write a `TenantHarness`,
register it, and the system prompt, evidence formatting, and tool schema all
follow from it.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .models import Measurement, Tenant

# ─── profile pieces ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class EvidenceField:
    """One measurement column the model is allowed to see and cite.

    A field absent from a harness never reaches the context, so the model
    cannot cite something the tenant's instrument does not report.
    """

    column: str          # attribute on Measurement
    label: str           # header shown to the model
    unit: str
    fmt: str = "{:.3f}"  # how to render a value

    def render(self, m: Measurement) -> str:
        value = getattr(m, self.column, None)
        if value is None:
            return "n/a"
        try:
            return self.fmt.format(value)
        except (TypeError, ValueError):
            return str(value)


@dataclass(frozen=True)
class MetricTerm:
    """A domain term the model must interpret correctly for this tenant."""

    name: str
    unit: str
    meaning: str


@dataclass(frozen=True)
class FailureCategory:
    """A permitted root-cause class.

    This is the agent's action space in miniature — the model classifies into
    one of these, it does not invent a category. See
    docs/PlatformArchitecture.md §3.3; when the shared knowledge plane exists,
    these become rows in `failure_modes` rather than a tuple here.
    """

    id: str
    label: str
    hint: str


@dataclass(frozen=True)
class ContextPolicy:
    """How much evidence is assembled, and how it is bounded.

    The model never decides what goes in its own context — this does.

    The `ask` path adds four ceilings the diagnosis path does not need. A
    diagnosis is one call with a window we chose; an ask is a loop the model
    steers, so every dimension it can grow along needs a stop:

      max_rounds        — how many times it may call a tool before we force
                          an answer. Bounds latency and the number of calls.
      max_input_tokens  — the hard context ceiling, measured before send.
      max_cost_usd      — cumulative spend for one question. A backstop, not
                          the primary control: rounds and tokens bind first.
                          This catches the case where they somehow don't.
      history/result budgets — sub-allocations inside max_input_tokens, so
                          the builder knows *what* to drop and in what order
                          rather than truncating whatever is at the end.

    All four are per-tenant because a customer on a bigger contract can be
    given a longer leash without touching a line of loop code.
    """

    window_before: int
    window_after: int
    max_output_tokens: int = 2048
    #: Anthropic prompt caching on the stable prefix (system + tool schema).
    #: Worth it when the same harness is reused across many diagnoses;
    #: pointless for a tenant that runs one diagnosis a week.
    cache_system_prompt: bool = True

    # ── the `ask` loop's budget ──
    max_rounds: int = 6
    max_input_tokens: int = 15_000
    max_cost_usd: float = 1.00
    #: Sub-allocations within `max_input_tokens`. They deliberately do not sum
    #: to it — system prompt, tool schemas and the question take the rest, and
    #: leaving headroom is what keeps a long thread from crowding out evidence.
    history_token_budget: int = 4_000
    tool_result_token_budget: int = 6_000

    @property
    def window_total(self) -> int:
        return self.window_before + self.window_after


# ─── the `ask` action space ─────────────────────────────────────────────
#
# These live at module scope rather than inside the schema literals because
# the executor validates against the same names and limits. One definition,
# read by both the thing that tells the model what it may do and the thing
# that decides whether to honour a call — a drift between those two is
# exactly how an over-permissive tool ships unnoticed.

TOOL_LIST_CHANNELS = "list_channels"
TOOL_QUERY_OUTLIERS = "query_outliers"
TOOL_MEASUREMENT_WINDOW = "measurement_window"
TOOL_CHANNEL_STATS = "channel_stats"
TOOL_GET_DIAGNOSIS = "get_diagnosis"
TOOL_SUBMIT_ANSWER = "submit_answer"

#: Every tool the `ask` path will execute. A call to anything not in here is
#: an error returned to the model, never a dispatch.
READ_TOOLS: frozenset[str] = frozenset({
    TOOL_LIST_CHANNELS,
    TOOL_QUERY_OUTLIERS,
    TOOL_MEASUREMENT_WINDOW,
    TOOL_CHANNEL_STATS,
    TOOL_GET_DIAGNOSIS,
})

#: Hard caps on how much one tool call may return. The model may ask for
#: less; asking for more is clamped, not refused, so a greedy call degrades
#: into a smaller answer rather than an error the model has to recover from.
MAX_OUTLIER_ROWS = 50
MAX_WINDOW_BEFORE = 40
MAX_WINDOW_AFTER = 20

SEVERITIES = ("critical", "warn", "info")
TRIAGE_STATUSES = ("open", "acknowledged", "resolved", "dismissed")
STATS_WINDOWS = ("1h", "6h", "24h", "7d")


@dataclass(frozen=True)
class TenantHarness:
    slug: str
    label: str
    domain: str
    instrument: str
    sampling: str
    metric_glossary: tuple[MetricTerm, ...]
    failure_categories: tuple[FailureCategory, ...]
    evidence_fields: tuple[EvidenceField, ...]
    operating_rules: tuple[str, ...]
    context: ContextPolicy
    #: None = use the platform default from settings. A tenant on a cheaper
    #: contract tier, or one with harder data, can be pinned here.
    model: str | None = None
    data_caveats: tuple[str, ...] = field(default_factory=tuple)

    # ── derived: prompt and schema are generated, never hand-copied ──

    def system_prompt(self) -> str:
        glossary = "\n".join(
            f"  - {t.name} ({t.unit}): {t.meaning}" for t in self.metric_glossary
        )
        categories = "\n".join(
            f"  - {c.id} — {c.label}: {c.hint}" for c in self.failure_categories
        )
        rules = "\n".join(f"- {r}" for r in self.operating_rules)
        caveats = (
            "\nData caveats for this site:\n"
            + "\n".join(f"- {c}" for c in self.data_caveats)
            if self.data_caveats
            else ""
        )
        available = ", ".join(f.label for f in self.evidence_fields)

        return f"""You are the diagnostic assistant for {self.label} — {self.domain}.

Instrument: {self.instrument}
Sampling: {self.sampling}

You are given one detected event plus the measurement window around it. Your job \
is root-cause diagnosis, not downstream-impact prediction.

Metric glossary for this site:
{glossary}

Permitted root-cause categories. Classify into exactly one of these per \
hypothesis — do not invent a category:
{categories}

The ONLY evidence columns available for this site are: {available}
Any other field does not exist in this site's data. Never cite a measurement \
that is not in the window you were given.
{caveats}

Operating rules for this site:
{rules}

General rules:
- Cite specific numbers from the evidence. Never invent a number.
- If the evidence is ambiguous, say so — list competing hypotheses with honest \
confidence rather than forcing one.
- Write like an engineer filing a shift-handoff note: short, precise, no filler.

You MUST respond by calling `submit_diagnosis` exactly once."""

    def diagnosis_tool(self) -> dict:
        """Tool schema, with this tenant's failure categories as a hard enum."""
        return {
            "name": "submit_diagnosis",
            "description": f"Submit the root-cause diagnosis for this {self.label} event.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "root_cause": {
                        "type": "string",
                        "description": "Single most likely root cause, 1-2 sentences, citing numbers.",
                    },
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "hypotheses": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 4,
                        "items": {
                            "type": "object",
                            "properties": {
                                "cause": {"type": "string"},
                                "failure_category": {
                                    "type": "string",
                                    "enum": [c.id for c in self.failure_categories],
                                    "description": "Must be one of this site's permitted categories.",
                                },
                                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                                "supporting_evidence": {"type": "string"},
                                "contradicting_evidence": {"type": "string"},
                            },
                            "required": ["cause", "failure_category", "confidence", "supporting_evidence"],
                        },
                    },
                    "recommended_action": {
                        "type": "string",
                        "description": "One concrete next check for the plant/maintenance team.",
                    },
                    "evidence_summary": {
                        "type": "string",
                        "description": "2-4 sentences summarizing the numeric evidence used.",
                    },
                },
                "required": [
                    "root_cause", "confidence", "hypotheses",
                    "recommended_action", "evidence_summary",
                ],
            },
        }

    # ── the `ask` path ──

    def evidence_field(self, label: str) -> EvidenceField | None:
        """Resolve a model-supplied metric label to a real column.

        The model only ever sees labels — they are what `format_window`
        prints — so a tool argument arrives as `"F80"`, not `"f80"`. This is
        also the whitelist: a label absent from this tenant's harness resolves
        to None and the executor rejects the call, so there is no path from a
        tool argument to an arbitrary attribute on `Measurement`.
        """
        for f in self.evidence_fields:
            if f.label == label:
                return f
        return None

    def ask_prompt(self) -> str:
        """System block for a free-text question.

        Differs from `system_prompt()` in one structural way: there, the
        evidence was chosen before the model was called. Here the model has to
        find it, so the prompt has to describe a *process* — retrieve, then
        answer, then cite — instead of just a subject.

        What it deliberately does not contain: any tenant identifier, any hint
        that other tenants exist, or any suggestion that scope is negotiable.
        The scope is not in the model's reach, so putting it in words would
        only give an injected instruction something to argue with.
        """
        glossary = "\n".join(
            f"  - {t.name} ({t.unit}): {t.meaning}" for t in self.metric_glossary
        )
        categories = "\n".join(
            f"  - {c.id} — {c.label}: {c.hint}" for c in self.failure_categories
        )
        rules = "\n".join(f"- {r}" for r in self.operating_rules)
        caveats = (
            "\nData caveats for this site:\n"
            + "\n".join(f"- {c}" for c in self.data_caveats)
            if self.data_caveats
            else ""
        )
        available = ", ".join(f.label for f in self.evidence_fields)

        return f"""You are the plant intelligence assistant for {self.label} — {self.domain}.

Instrument: {self.instrument}
Sampling: {self.sampling}

A person on the plant team has asked you a question. You answer it from this \
site's own measurement record, using the read tools provided. You have no other \
source of fact.

Metric glossary for this site:
{glossary}

Root-cause categories used at this site, when a question touches on cause:
{categories}

The ONLY measurement columns that exist for this site are: {available}
No other column exists. If a question asks about something outside this list, \
say plainly that this site's instrument does not report it.
{caveats}

Operating rules for this site:
{rules}

How to work:
- Retrieve before you answer. Call tools to get the actual rows. Do not answer \
from memory of earlier turns alone if the question needs fresh numbers.
- Start broad, then narrow: `{TOOL_LIST_CHANNELS}` to see what exists, \
`{TOOL_QUERY_OUTLIERS}` to find events, `{TOOL_MEASUREMENT_WINDOW}` to see what \
surrounded one, `{TOOL_CHANNEL_STATS}` for aggregate behaviour, \
`{TOOL_GET_DIAGNOSIS}` for work already done on an outlier.
- You have at most {self.context.max_rounds} tool rounds. Spend them. Do not \
burn them re-fetching what you already have.
- Every number in your answer must come from a row a tool returned this turn. \
Never estimate, interpolate, or carry a number over from your own prior text.
- If the tools return nothing relevant, say the data does not show it. An honest \
"no evidence for that in this window" is a correct answer; an invented one is not.
- Write like an engineer filing a shift-handoff note: short, precise, no filler. \
No preamble, no restating the question back.

You MUST finish by calling `{TOOL_SUBMIT_ANSWER}` exactly once. Anything you write \
outside that call is discarded, so put the whole answer inside it. Every id you \
cite must be one a tool actually returned to you."""

    def ask_tools(self) -> list[dict]:
        """The read tools plus the terminal answer tool.

        Two properties are load-bearing:

        1. There is no `tenant_id`, `tenant`, `site` or `customer` parameter
           anywhere in these schemas. Scope is not something the model can
           express, so a successful prompt injection has no field to write it
           into — the executor adds the filter regardless of what arrives.

        2. `metric` is enum-bound to *this tenant's* evidence fields. The demo
           tenant's model cannot even form a call asking for SDRatio10_5,
           because for that harness the value is not in the enum.
        """
        metric_labels = [f.label for f in self.evidence_fields]

        return [
            {
                "name": TOOL_LIST_CHANNELS,
                "description": (
                    "List the monitored channels available to you, with each "
                    "channel's learned F80 and Topsize baselines and whether it "
                    "is currently online. Takes no arguments. Call this first "
                    "when you do not already know which channel a question is "
                    "about — channel ids are not guessable."
                ),
                "input_schema": {"type": "object", "properties": {}},
            },
            {
                "name": TOOL_QUERY_OUTLIERS,
                "description": (
                    "Find detected events, newest first. All filters are "
                    "optional; with none, returns the most recent events across "
                    "all channels you can see. Use this to locate what happened "
                    "before asking for detail about any one event."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel_id": {
                            "type": "string",
                            "description": (
                                "Restrict to one channel, as returned by "
                                f"`{TOOL_LIST_CHANNELS}`."
                            ),
                        },
                        "severity": {"type": "string", "enum": list(SEVERITIES)},
                        "status": {"type": "string", "enum": list(TRIAGE_STATUSES)},
                        "since": {
                            "type": "string",
                            "description": "ISO-8601 UTC timestamp; only events at or after it.",
                        },
                        "until": {
                            "type": "string",
                            "description": "ISO-8601 UTC timestamp; only events at or before it.",
                        },
                        "limit": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": MAX_OUTLIER_ROWS,
                            "description": f"Rows to return, at most {MAX_OUTLIER_ROWS}. Default 20.",
                        },
                    },
                },
            },
            {
                "name": TOOL_MEASUREMENT_WINDOW,
                "description": (
                    "The raw measurement samples surrounding a moment in time on "
                    "one channel — the same evidence table a diagnosis is built "
                    "from. Use it to check what the signal actually did around an "
                    "event, rather than reasoning from the event row alone."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel_id": {"type": "string"},
                        "around_t": {
                            "type": "string",
                            "description": (
                                "ISO-8601 UTC timestamp to centre on — typically an "
                                "event's `t` from " f"`{TOOL_QUERY_OUTLIERS}`."
                            ),
                        },
                        "before": {
                            "type": "integer", "minimum": 1, "maximum": MAX_WINDOW_BEFORE,
                            "description": f"Samples before, at most {MAX_WINDOW_BEFORE}. "
                                           f"Default {self.context.window_before}.",
                        },
                        "after": {
                            "type": "integer", "minimum": 0, "maximum": MAX_WINDOW_AFTER,
                            "description": f"Samples after, at most {MAX_WINDOW_AFTER}. "
                                           f"Default {self.context.window_after}.",
                        },
                    },
                    "required": ["channel_id", "around_t"],
                },
            },
            {
                "name": TOOL_CHANNEL_STATS,
                "description": (
                    "Summary statistics for one metric on one channel over a "
                    "recent window: count, mean, standard deviation, min, max, "
                    "and the channel's learned baseline. Computed in Python from "
                    "the stored rows, never estimated. Use this for questions "
                    "about typical or drifting behaviour rather than pulling "
                    "hundreds of raw samples."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel_id": {"type": "string"},
                        "metric": {
                            "type": "string",
                            "enum": metric_labels,
                            "description": "One of this site's measurement columns.",
                        },
                        "window": {"type": "string", "enum": list(STATS_WINDOWS)},
                    },
                    "required": ["channel_id", "metric", "window"],
                },
            },
            {
                "name": TOOL_GET_DIAGNOSIS,
                "description": (
                    "The most recent diagnostic artifact for one event, if the "
                    "Diagnostic Agent has already run on it: root cause, ranked "
                    "hypotheses with their failure categories, and the recommended "
                    "check. Prefer citing existing work over re-deriving it."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {"outlier_id": {"type": "string"}},
                    "required": ["outlier_id"],
                },
            },
            {
                "name": TOOL_SUBMIT_ANSWER,
                "description": (
                    "Deliver the final answer. Terminal — the conversation ends "
                    "here, so this call must contain everything you want the "
                    "person to read."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "answer": {
                            "type": "string",
                            "description": (
                                "The answer, in plain prose, citing specific numbers "
                                "from the rows you retrieved."
                            ),
                        },
                        "citations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "kind": {
                                        "type": "string",
                                        "enum": ["outlier", "channel", "diagnosis"],
                                    },
                                    "id": {
                                        "type": "string",
                                        "description": (
                                            "An id a tool returned to you in this "
                                            "conversation. Ids you did not receive "
                                            "are rejected."
                                        ),
                                    },
                                    "note": {
                                        "type": "string",
                                        "description": "What this row supports, in a few words.",
                                    },
                                },
                                "required": ["kind", "id"],
                            },
                            "description": (
                                "The rows this answer rests on. May be empty only if "
                                "the answer makes no factual claim about the data."
                            ),
                        },
                        "confidence": {
                            "type": "number", "minimum": 0, "maximum": 1,
                            "description": (
                                "Your own confidence in this answer. A self-report, "
                                "not a calibrated probability — be honest rather "
                                "than reassuring."
                            ),
                        },
                    },
                    "required": ["answer", "citations"],
                },
            },
        ]

    def format_window(self, window: list[Measurement], event_t) -> str:
        """Render only this tenant's evidence fields. Absent columns never appear."""
        headers = ["t_offset_s"] + [f"{f.label}({f.unit})" if f.unit else f.label
                                    for f in self.evidence_fields]
        lines = [", ".join(headers)]
        for m in window:
            offset = (m.t - event_t).total_seconds()
            cells = [f"{offset:+.0f}s"] + [f.render(m) for f in self.evidence_fields]
            marker = "  <-- EVENT" if m.t == event_t else ""
            lines.append(", ".join(cells) + marker)
        return "\n".join(lines)

    def summary(self) -> dict:
        """Serialisable shape for the API, so the UI can show which harness ran."""
        return {
            "slug": self.slug,
            "label": self.label,
            "domain": self.domain,
            "instrument": self.instrument,
            "sampling": self.sampling,
            "model": self.model,
            "window_before": self.context.window_before,
            "window_after": self.context.window_after,
            "prompt_caching": self.context.cache_system_prompt,
            "evidence_fields": [f.label for f in self.evidence_fields],
            "failure_categories": [
                {"id": c.id, "label": c.label} for c in self.failure_categories
            ],
            "operating_rules": list(self.operating_rules),
            # The `ask` action space, so the product can show what the agent is
            # permitted to do rather than asking anyone to trust a prompt.
            "ask_tools": [t["name"] for t in self.ask_tools()],
            "max_rounds": self.context.max_rounds,
            "max_input_tokens": self.context.max_input_tokens,
            "max_cost_usd": self.context.max_cost_usd,
        }


# ─── registered profiles ────────────────────────────────────────────────

PSD_CORE_FIELDS = (
    EvidenceField("f80", "F80", "mm"),
    EvidenceField("topsize", "Topsize", "mm"),
    EvidenceField("color_hue", "Hue", "deg"),
    EvidenceField("color_sat", "Sat", "%"),
    EvidenceField("color_light", "Light", "%"),
)

CEMEX = TenantHarness(
    slug="cemex",
    label="CEMEX",
    domain="cement plant particle-size-distribution monitoring on conveyor belts",
    instrument="MINITAB CV42 belt-mounted PSD camera analyzer",
    sampling="sub-minute, irregular — the vendor's iteration counter has gaps, which is normal instrument behaviour",
    metric_glossary=(
        MetricTerm("F80", "mm", "sieve size through which 80% of material passes. NOT mean-aggregatable."),
        MetricTerm("Topsize", "mm", "largest fragment detected in the frame."),
        MetricTerm("SDRatio10_5", "ratio", "distribution-shape ratio; sudden change implies a shape change, not just a size shift."),
        MetricTerm("Hue/Sat/Light", "deg/%/%", "belt-average colour. Simultaneous collapse of Sat AND Light with flat RGB usually means the camera, not the material."),
        MetricTerm("Video RGB", "0-255", "raw camera channel averages, before colour-space conversion."),
    ),
    failure_categories=(
        FailureCategory("feed_material", "Feed / material change",
                        "ore hardness, blend transition, moisture, clay content"),
        FailureCategory("equipment", "Equipment fault",
                        "liner wear, screen blinding or damage, belt mistracking, roller failure"),
        FailureCategory("process_control", "Process / control change",
                        "feeder rate, closed-circuit load, water addition, setpoint change"),
        FailureCategory("instrument", "Instrument fault",
                        "lens fouling, illumination decay, calibration drift, vibration"),
        FailureCategory("environmental", "Environmental",
                        "dust loading, rain, temperature, ambient light"),
        FailureCategory("upstream_blast", "Upstream / blast",
                        "fragmentation from blast design, oversize from the muckpile"),
    ),
    evidence_fields=PSD_CORE_FIELDS + (
        EvidenceField("sd_ratio_10_5", "SDRatio10_5", ""),
        EvidenceField("video_r", "VideoR", "", "{:.0f}"),
        EvidenceField("video_g", "VideoG", "", "{:.0f}"),
        EvidenceField("video_b", "VideoB", "", "{:.0f}"),
    ),
    operating_rules=(
        "Never recommend stopping the plant. This system diagnoses; shutdown calls are the control room's.",
        "Distinguish material/process causes from instrumentation causes explicitly — both are common in real PSD analyzer data, and the remedies are opposite.",
        "CV42 is the primary tunnel conveyor. An event here affects everything downstream, so state the discriminating test an operator can run within one shift.",
        "Raw sieve columns are in INCHES. The canonical PSD curve is in MILLIMETRES. Never compare them numerically.",
    ),
    context=ContextPolicy(window_before=20, window_after=5, cache_system_prompt=True),
    data_caveats=(
        "F80 on this channel runs around 1.0 mm — an order of magnitude below a typical ROM conveyor. Do not treat a 1 mm reading as anomalous by itself.",
    ),
)

DEMO = TenantHarness(
    slug="demo",
    label="Demo Plant",
    domain="demonstration particle-size monitoring across a synthetic 12-belt circuit",
    instrument="simulated belt PSD analyzer",
    sampling="regular, one sample per minute",
    metric_glossary=(
        MetricTerm("F80", "mm", "sieve size through which 80% of material passes. NOT mean-aggregatable."),
        MetricTerm("Topsize", "mm", "largest fragment detected in the frame."),
        MetricTerm("Hue/Sat/Light", "deg/%/%", "belt-average colour."),
    ),
    failure_categories=(
        FailureCategory("feed_material", "Feed / material change",
                        "ore hardness, blend transition, moisture"),
        FailureCategory("equipment", "Equipment fault",
                        "screen blinding or damage, belt mistracking"),
        FailureCategory("process_control", "Process / control change",
                        "feeder rate, closed-circuit load, water addition"),
        FailureCategory("instrument", "Instrument fault",
                        "camera or lighting fault, vibration"),
    ),
    # No sieve, no SDRatio, no video RGB — those columns are NULL for every
    # synthetic row, so they are simply not offered to the model.
    evidence_fields=PSD_CORE_FIELDS,
    operating_rules=(
        "Never recommend stopping the plant.",
        "This is a demonstration dataset generated by a simulator, not a real plant. Say so if asked whether a finding is real.",
        "Do not reference raw sieve percentages, SDRatio, or camera RGB — this site's instrument does not report them.",
    ),
    context=ContextPolicy(window_before=12, window_after=4, cache_system_prompt=True),
    data_caveats=(
        "Channel baselines span 21-116 mm F80 depending on circuit position. Judge deviation against the stated channel baseline, never against another channel.",
    ),
)

#: Registered per-tenant harnesses, keyed by tenant slug.
HARNESSES: dict[str, TenantHarness] = {h.slug: h for h in (CEMEX, DEMO)}

#: Used when a tenant has no registered profile yet — e.g. a customer signed
#: last week whose data format is still unknown. Deliberately conservative:
#: core fields only, generic categories, and a caveat telling the model it is
#: running without a site profile.
GENERIC = TenantHarness(
    slug="generic",
    label="Unprofiled site",
    domain="industrial particle-size monitoring",
    instrument="unspecified belt analyzer",
    sampling="unknown",
    metric_glossary=DEMO.metric_glossary,
    failure_categories=DEMO.failure_categories,
    evidence_fields=PSD_CORE_FIELDS,
    operating_rules=(
        "Never recommend stopping the plant.",
        # "site", not "tenant": `tenant` is our word for the boundary, and the
        # boundary is bound below the model. Naming it in a prompt gives an
        # injected instruction a concept to argue with and buys nothing.
        "No site profile has been configured for this site. State explicitly that "
        "the diagnosis is made without site-specific operating context, and keep "
        "confidence correspondingly low.",
    ),
    context=ContextPolicy(window_before=12, window_after=4, cache_system_prompt=False),
)


def harness_for_slug(slug: str | None) -> TenantHarness:
    return HARNESSES.get(slug or "", GENERIC)


def harness_for_tenant(tenant: Tenant | None) -> TenantHarness:
    return harness_for_slug(tenant.slug if tenant is not None else None)

"""The tool executor — the only place the `ask` agent touches the database.

Every security property claimed for the conversational agent is enforced here
or nowhere. The system prompt is advice; the tool schemas shape what the model
can *say*; this module decides what actually runs.

Three structural choices, in descending order of how much they matter:

1. **`tenant_id` is a required `str` parameter of `run_tool`, not something
   read off a principal inside it.** There is no code path through this module
   that runs a query without a tenant, because the function cannot be called
   without one — a caller holding a superadmin principal (`tenant_id is None`)
   gets a `TypeError` at the call site rather than an unscoped query at the
   database. The `ask` loop refuses such a principal outright; this is the
   second line, and it is a type-level one.

2. **No tool argument can influence scope.** The schemas in `harness.ask_tools()`
   have no tenant/site/customer field, so a model under a fully successful
   prompt injection has nowhere to put one. Every filter below is `AND`-ed on
   top of the tenant predicate, never in place of it.

3. **Every id the model receives is recorded.** `ToolResult.ids` is what
   `submit_answer`'s citations are checked against. An answer citing a row the
   executor never returned is rejected — that is what makes the answer
   auditable rather than merely fluent.

Errors are returned to the model, not raised. A bad argument should cost one
round and a correction, not a failed request: the model reads the error and
tries again. Only a caller-side mistake (unknown tenant, missing session) is an
exception, because the model cannot fix that.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .harness import (
    MAX_OUTLIER_ROWS,
    MAX_WINDOW_AFTER,
    MAX_WINDOW_BEFORE,
    READ_TOOLS,
    SEVERITIES,
    STATS_WINDOWS,
    TOOL_CHANNEL_STATS,
    TOOL_GET_DIAGNOSIS,
    TOOL_LIST_CHANNELS,
    TOOL_MEASUREMENT_WINDOW,
    TOOL_QUERY_OUTLIERS,
    TRIAGE_STATUSES,
    TenantHarness,
)
from .models import Channel, Measurement, Outlier, OutlierDiagnosis

#: Default rows for `query_outliers` when the model does not say.
DEFAULT_OUTLIER_LIMIT = 20

#: How far back each `channel_stats` window reaches.
STATS_WINDOW_DELTAS: dict[str, timedelta] = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
}

#: Citation kinds. Mirrors the enum in `submit_answer`'s schema.
KIND_CHANNEL = "channel"
KIND_OUTLIER = "outlier"
KIND_DIAGNOSIS = "diagnosis"


@dataclass
class ToolResult:
    """What one tool call produced.

    `payload` goes to the model. `ids` does not — it is the executor's own
    record of which rows it handed over, and it is the whitelist that
    `submit_answer`'s citations are validated against.
    """

    payload: dict[str, Any]
    ids: dict[str, set[str]] = field(default_factory=dict)
    is_error: bool = False

    def record(self, kind: str, value: str | None) -> None:
        if value:
            self.ids.setdefault(kind, set()).add(value)

    @property
    def row_count(self) -> int:
        rows = self.payload.get("rows")
        return len(rows) if isinstance(rows, list) else 0


def _error(message: str, **extra: Any) -> ToolResult:
    """An error the model is expected to recover from within the loop."""
    return ToolResult(payload={"error": message, **extra}, is_error=True)


def _parse_ts(raw: Any, label: str) -> tuple[datetime | None, str | None]:
    """ISO-8601 → naive UTC, matching how the schema stores timestamps.

    Every `DateTime` column in this schema is naive and holds UTC. Comparing a
    tz-aware value against them raises on Postgres and silently misbehaves on
    SQLite, so normalise at the boundary rather than trusting the input.
    """
    if raw is None:
        return None, None
    if not isinstance(raw, str):
        return None, f"{label} must be an ISO-8601 timestamp string"
    text = raw.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None, f"{label} is not a valid ISO-8601 timestamp: {raw!r}"
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed, None


def _clamp_int(raw: Any, *, default: int, low: int, high: int) -> int:
    """Clamp rather than reject.

    A model asking for 500 rows wants as many as it can have; refusing costs a
    round and teaches it nothing the schema did not already say. Clamping
    degrades the call instead of failing it.
    """
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, value))


def _owned_channel(session: Session, tenant_id: str, channel_id: Any) -> Channel | None:
    """A channel, or None — never another tenant's.

    The tenant predicate is not optional and not conditional. Every caller
    below goes through this rather than querying `Channel` directly, so there
    is one place to read when asking whether channel access is scoped.
    """
    if not isinstance(channel_id, str) or not channel_id:
        return None
    return session.execute(
        select(Channel).where(
            Channel.tenant_id == tenant_id,
            Channel.id == channel_id,
        )
    ).scalars().first()


# ─── the five read tools ────────────────────────────────────────────────


def _list_channels(session: Session, tenant_id: str, harness: TenantHarness, args: dict) -> ToolResult:
    channels = session.execute(
        select(Channel)
        .where(Channel.tenant_id == tenant_id)
        .order_by(Channel.id)
    ).scalars().all()

    result = ToolResult(payload={"rows": [], "row_count": 0})
    rows = []
    for c in channels:
        result.record(KIND_CHANNEL, c.id)
        rows.append({
            "channel_id": c.id,
            "name": c.name,
            "belt": c.belt,
            "baseline_f80_mm": round(c.base_f80, 3),
            "baseline_topsize_mm": round(c.base_topsize, 3),
            "online": c.online,
            "shift": c.shift,
        })
    result.payload = {"rows": rows, "row_count": len(rows)}
    return result


def _query_outliers(session: Session, tenant_id: str, harness: TenantHarness, args: dict) -> ToolResult:
    severity = args.get("severity")
    if severity is not None and severity not in SEVERITIES:
        return _error(f"severity must be one of {list(SEVERITIES)}")
    status = args.get("status")
    if status is not None and status not in TRIAGE_STATUSES:
        return _error(f"status must be one of {list(TRIAGE_STATUSES)}")

    since, err = _parse_ts(args.get("since"), "since")
    if err:
        return _error(err)
    until, err = _parse_ts(args.get("until"), "until")
    if err:
        return _error(err)

    limit = _clamp_int(args.get("limit"), default=DEFAULT_OUTLIER_LIMIT,
                       low=1, high=MAX_OUTLIER_ROWS)

    # The join to Channel is what carries the tenant boundary for outliers —
    # `outliers` has no tenant column of its own. Written as an explicit join
    # predicate rather than a relationship walk so the filter is visible in
    # the same expression as the thing it protects.
    q = (
        select(Outlier, Channel.name)
        .join(Channel, Channel.id == Outlier.channel_id)
        .where(Channel.tenant_id == tenant_id)
    )

    if severity is not None:
        q = q.where(Outlier.sev == severity)
    if status is not None:
        q = q.where(Outlier.status == status)
    if since is not None:
        q = q.where(Outlier.t >= since)
    if until is not None:
        q = q.where(Outlier.t <= until)

    channel_id = args.get("channel_id")
    if channel_id is not None:
        # Validated against the tenant's own channels. An id belonging to
        # someone else does not narrow the query — it produces an explicit
        # "no such channel", the same answer a nonexistent id gets, so the
        # response cannot be used to test whether a channel exists elsewhere.
        if _owned_channel(session, tenant_id, channel_id) is None:
            return _error(
                f"no channel {channel_id!r} is available to you — "
                f"call {TOOL_LIST_CHANNELS} to see the ones that are"
            )
        q = q.where(Outlier.channel_id == channel_id)

    q = q.order_by(Outlier.t.desc()).limit(limit)

    result = ToolResult(payload={})
    rows = []
    for outlier, channel_name in session.execute(q).all():
        result.record(KIND_OUTLIER, outlier.id)
        result.record(KIND_CHANNEL, outlier.channel_id)
        rows.append({
            "outlier_id": outlier.id,
            "channel_id": outlier.channel_id,
            "channel_name": channel_name,
            "t": outlier.t.isoformat(),
            "metric": outlier.metric,
            "value": round(outlier.value, 3),
            "unit": outlier.unit,
            "baseline": round(outlier.baseline, 3),
            "deviation_sigma": round(outlier.deviation, 2),
            "severity": outlier.sev,
            "type": outlier.type,
            "status": outlier.status,
            "summary": outlier.summary,
        })

    result.payload = {
        "rows": rows,
        "row_count": len(rows),
        # The model cannot tell a short result from a truncated one otherwise,
        # and "there were only 3 events" is a very different finding from
        # "here are 3 of many".
        "truncated": len(rows) == limit,
        "limit": limit,
    }
    return result


def _measurement_window(session: Session, tenant_id: str, harness: TenantHarness, args: dict) -> ToolResult:
    channel = _owned_channel(session, tenant_id, args.get("channel_id"))
    if channel is None:
        return _error(
            f"no channel {args.get('channel_id')!r} is available to you — "
            f"call {TOOL_LIST_CHANNELS} to see the ones that are"
        )

    around_t, err = _parse_ts(args.get("around_t"), "around_t")
    if err:
        return _error(err)
    if around_t is None:
        return _error("around_t is required")

    before = _clamp_int(args.get("before"), default=harness.context.window_before,
                        low=1, high=MAX_WINDOW_BEFORE)
    after = _clamp_int(args.get("after"), default=harness.context.window_after,
                       low=0, high=MAX_WINDOW_AFTER)

    head = list(session.execute(
        select(Measurement)
        .where(Measurement.channel_id == channel.id, Measurement.t <= around_t)
        .order_by(Measurement.t.desc())
        .limit(before)
    ).scalars())
    head.reverse()
    tail = list(session.execute(
        select(Measurement)
        .where(Measurement.channel_id == channel.id, Measurement.t > around_t)
        .order_by(Measurement.t.asc())
        .limit(after)
    ).scalars()) if after else []

    window = head + tail
    if not window:
        return _error(
            f"no samples on {channel.id} near {around_t.isoformat()} — "
            "check the timestamp against an event you have already retrieved"
        )

    result = ToolResult(payload={})
    result.record(KIND_CHANNEL, channel.id)
    result.payload = {
        "channel_id": channel.id,
        "channel_name": channel.name,
        "around_t": around_t.isoformat(),
        "row_count": len(window),
        "first_t": window[0].t.isoformat(),
        "last_t": window[-1].t.isoformat(),
        # Rendered by the harness, so only this site's evidence columns appear.
        # A CEMEX row read through the demo harness would not show SDRatio or
        # RGB even if the columns were populated — the harness decides what is
        # visible, not the row.
        "table": harness.format_window(window, around_t),
    }
    return result


def _channel_stats(session: Session, tenant_id: str, harness: TenantHarness, args: dict) -> ToolResult:
    channel = _owned_channel(session, tenant_id, args.get("channel_id"))
    if channel is None:
        return _error(
            f"no channel {args.get('channel_id')!r} is available to you — "
            f"call {TOOL_LIST_CHANNELS} to see the ones that are"
        )

    label = args.get("metric")
    # The whitelist. `evidence_field` resolves a model-supplied label to a real
    # column only if this tenant's harness offers it — which is what stops a
    # tool argument from becoming an arbitrary `getattr` on Measurement.
    ev = harness.evidence_field(label) if isinstance(label, str) else None
    if ev is None:
        return _error(
            f"metric must be one of {[f.label for f in harness.evidence_fields]}"
        )

    window = args.get("window")
    if window not in STATS_WINDOW_DELTAS:
        return _error(f"window must be one of {list(STATS_WINDOWS)}")

    # Anchor on the channel's most recent sample, not wall-clock now. This is
    # historical plant data; anchoring on `now` would return an empty window
    # for every question and the model would conclude the channel is silent.
    latest = session.execute(
        select(func.max(Measurement.t)).where(Measurement.channel_id == channel.id)
    ).scalar()
    if latest is None:
        return _error(f"no measurements on {channel.id}")
    start = latest - STATS_WINDOW_DELTAS[window]

    rows = session.execute(
        select(Measurement)
        .where(Measurement.channel_id == channel.id, Measurement.t >= start)
        .order_by(Measurement.t.asc())
    ).scalars().all()

    values = [v for v in (getattr(m, ev.column, None) for m in rows) if v is not None]

    result = ToolResult(payload={})
    result.record(KIND_CHANNEL, channel.id)

    if not values:
        result.payload = {
            "channel_id": channel.id,
            "metric": ev.label,
            "window": window,
            "n": 0,
            "note": f"{ev.label} is not populated on this channel in this window",
        }
        return result

    # Computed here, in Python, from the rows themselves. The model is never
    # asked to estimate a statistic — that is the difference between an answer
    # that is grounded and one that merely sounds grounded.
    result.payload = {
        "channel_id": channel.id,
        "channel_name": channel.name,
        "metric": ev.label,
        "unit": ev.unit,
        "window": window,
        "window_start": start.isoformat(),
        "window_end": latest.isoformat(),
        "n": len(values),
        "mean": round(statistics.fmean(values), 4),
        "stdev": round(statistics.pstdev(values), 4) if len(values) > 1 else 0.0,
        "min": round(min(values), 4),
        "max": round(max(values), 4),
        "channel_baseline_f80_mm": round(channel.base_f80, 3),
        "channel_baseline_topsize_mm": round(channel.base_topsize, 3),
    }
    return result


def _get_diagnosis(session: Session, tenant_id: str, harness: TenantHarness, args: dict) -> ToolResult:
    outlier_id = args.get("outlier_id")
    if not isinstance(outlier_id, str) or not outlier_id:
        return _error("outlier_id is required")

    # Same join-carried boundary as `query_outliers`. A diagnosis is reached
    # only through an outlier the caller owns, so there is no path to another
    # tenant's artifact even with a valid diagnosis id.
    row = session.execute(
        select(Outlier, Channel.name)
        .join(Channel, Channel.id == Outlier.channel_id)
        .where(Channel.tenant_id == tenant_id, Outlier.id == outlier_id)
    ).first()
    if row is None:
        return _error(f"no event {outlier_id!r} is available to you")
    outlier, channel_name = row

    diagnosis = session.execute(
        select(OutlierDiagnosis)
        .where(
            OutlierDiagnosis.outlier_id == outlier.id,
            OutlierDiagnosis.status == "complete",
        )
        .order_by(OutlierDiagnosis.created_at.desc())
        .limit(1)
    ).scalars().first()

    result = ToolResult(payload={})
    result.record(KIND_OUTLIER, outlier.id)
    result.record(KIND_CHANNEL, outlier.channel_id)

    if diagnosis is None:
        result.payload = {
            "outlier_id": outlier.id,
            "diagnosis": None,
            "note": "the Diagnostic Agent has not run on this event",
        }
        return result

    result.record(KIND_DIAGNOSIS, diagnosis.id)
    result.payload = {
        "outlier_id": outlier.id,
        "channel_id": outlier.channel_id,
        "channel_name": channel_name,
        "diagnosis_id": diagnosis.id,
        "created_at": diagnosis.created_at.isoformat(),
        "model": diagnosis.model,
        "root_cause": diagnosis.root_cause,
        # Self-reported by the model that produced it, and not calibrated —
        # said here so a downstream answer does not quote it as a probability.
        "confidence_model_stated": diagnosis.confidence,
        "hypotheses": [
            {
                "cause": h.get("cause", ""),
                "failure_category": h.get("failure_category"),
                "confidence_model_stated": h.get("confidence", 0.0),
                "supporting_evidence": h.get("supporting_evidence", ""),
                "contradicting_evidence": h.get("contradicting_evidence"),
            }
            for h in (diagnosis.hypotheses or [])
            if isinstance(h, dict)
        ],
        "recommended_action": diagnosis.recommended_action,
        "evidence_summary": diagnosis.evidence_summary,
    }
    return result


_DISPATCH = {
    TOOL_LIST_CHANNELS: _list_channels,
    TOOL_QUERY_OUTLIERS: _query_outliers,
    TOOL_MEASUREMENT_WINDOW: _measurement_window,
    TOOL_CHANNEL_STATS: _channel_stats,
    TOOL_GET_DIAGNOSIS: _get_diagnosis,
}

# The dispatch table and the advertised action space must be the same set. A
# tool implemented but not advertised is dead code; one advertised but not
# implemented is a round the model wastes. Asserted at import so neither can
# ship.
assert set(_DISPATCH) == set(READ_TOOLS), (
    f"dispatch/schema mismatch: {set(_DISPATCH) ^ set(READ_TOOLS)}"
)


def run_tool(
    name: str,
    args: dict | None,
    *,
    tenant_id: str,
    session: Session,
    harness: TenantHarness,
) -> ToolResult:
    """Execute one tool call for one tenant.

    `tenant_id` is a required `str`. That is the point: there is no default,
    no `Optional`, and no principal to interrogate, so a caller cannot reach
    the database through this function without naming a tenant first.
    """
    if not tenant_id or not isinstance(tenant_id, str):
        # Belt and braces on the type hint above — a `None` slipping through an
        # untyped call site must fail loudly, not query everything.
        raise ValueError("run_tool requires a concrete tenant_id")

    handler = _DISPATCH.get(name)
    if handler is None:
        return _error(
            f"unknown tool {name!r}; available tools are {sorted(READ_TOOLS)}"
        )

    return handler(session, tenant_id, harness, args or {})


def validate_citations(
    citations: Any, returned: dict[str, set[str]]
) -> tuple[list[dict], list[dict]]:
    """Split the model's citations into (accepted, rejected).

    A citation naming an id the executor never returned is not a formatting
    slip — it is the model asserting a row exists on evidence it does not
    have. The loop rejects it and re-prompts once.

    Kind is checked alongside id so that citing a real outlier id as a
    `diagnosis` is caught too; a plausible-looking cross-reference is exactly
    the kind of error that reads as authoritative.
    """
    accepted: list[dict] = []
    rejected: list[dict] = []
    if not isinstance(citations, list):
        return accepted, rejected

    for raw in citations:
        if not isinstance(raw, dict):
            rejected.append({"kind": None, "id": str(raw), "reason": "malformed citation"})
            continue
        kind = raw.get("kind")
        cid = raw.get("id")
        if not isinstance(cid, str) or not cid:
            rejected.append({"kind": kind, "id": cid, "reason": "missing id"})
            continue
        if cid in returned.get(kind, set()):
            accepted.append({"kind": kind, "id": cid, "note": raw.get("note", "")})
        else:
            rejected.append({
                "kind": kind,
                "id": cid,
                "reason": "no tool returned this id in this conversation",
            })
    return accepted, rejected

"""Diagnostic Agent — phase 1: root-cause hypotheses for one outlier.

Direct Anthropic Messages API call (no LangChain/Agent SDK — a single
grounded, forced-tool-use call doesn't need an orchestration framework).
Grounded in the actual ingested measurement window around the outlier,
including the real vendor fields (sieve %, SDRatio, raw RGB) where present.

Pricing is an approximation for cost tracking, not a billing source of
truth — verify against console.anthropic.com for real spend.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from anthropic import Anthropic
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .harness import TenantHarness, harness_for_tenant
from .models import Channel, Measurement, Outlier, OutlierDiagnosis, Tenant

# $/million tokens — approximate, for in-app cost tracking only. Not a
# billing source of truth: verify real spend at
# https://console.anthropic.com/settings/usage
PRICE_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5-20251001": (1.00, 5.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-opus-4-8": (15.00, 75.00),
}
DEFAULT_PRICE_PER_MTOK = (3.00, 15.00)


def _price_for(model: str) -> tuple[float, float]:
    return PRICE_PER_MTOK.get(model, DEFAULT_PRICE_PER_MTOK)


def _window_for(session: Session, outlier: Outlier, harness: TenantHarness) -> list[Measurement]:
    """The evidence window, sized by the tenant's context policy.

    CEMEX samples sub-minute, the demo plant once a minute — so "20 samples"
    means ~4 minutes on one site and 20 minutes on the other. The window is a
    harness decision, not a global constant.
    """
    before = list(session.execute(
        select(Measurement)
        .where(Measurement.channel_id == outlier.channel_id, Measurement.t <= outlier.t)
        .order_by(Measurement.t.desc())
        .limit(harness.context.window_before)
    ).scalars())
    before.reverse()
    after = list(session.execute(
        select(Measurement)
        .where(Measurement.channel_id == outlier.channel_id, Measurement.t > outlier.t)
        .order_by(Measurement.t.asc())
        .limit(harness.context.window_after)
    ).scalars())
    return before + after


def _build_user_prompt(
    channel: Channel, outlier: Outlier, window: list[Measurement], harness: TenantHarness
) -> str:
    # Raw vendor sieve columns only exist on instruments that report them.
    # A harness without the SDRatio field is a site whose rows carry no vendor
    # sieve set either, so the block is omitted entirely rather than rendered
    # as "not available" — an absent section can't be misread as a measurement.
    sieve_block = ""
    if any(f.column == "sd_ratio_10_5" for f in harness.evidence_fields):
        om = next((m for m in window if m.id == outlier.measurement_id), None)
        if om is not None and om.sieve_passing_raw:
            rendered = ", ".join(f"{k}={v:.1f}%" for k, v in sorted(om.sieve_passing_raw.items()))
            sieve_block = f"\nRaw vendor sieve passing % at the event sample (INCHES): {rendered}\n"

    return f"""Channel: {channel.name} ({channel.id}), belt kind: {channel.belt}
Channel baseline: F80={channel.base_f80:.3f}, Topsize={channel.base_topsize:.3f} \
(learned from this channel's own history)

Event:
  time: {outlier.t.isoformat()}
  type: {outlier.type}
  metric: {outlier.metric} = {outlier.value:.3f} {outlier.unit}
  rolling baseline at detection: {outlier.baseline:.3f}
  deviation: {outlier.deviation:.2f} sigma
  severity: {outlier.sev}
  detector confidence: {outlier.confidence:.2f}
{sieve_block}
Measurement window ({harness.context.window_before} samples before, \
{harness.context.window_after} after):
{harness.format_window(window, outlier.t)}

Diagnose the root cause of this event."""


_TRAILING_TAG_ARTIFACT = re.compile(r"(\s*</[\w_]+>)+\s*$")


def _clean(s: object) -> str:
    """Strip trailing `</tag>` artifacts some long tool-call outputs leak
    into the last string field (observed empirically, not hypothetical).
    Also guards against the model returning a non-string for a text field."""
    if not s:
        return ""
    if not isinstance(s, str):
        s = str(s)
    return _TRAILING_TAG_ARTIFACT.sub("", s).strip()


class DiagnosticAgentError(RuntimeError):
    pass


def resolve_harness(session: Session, channel: Channel) -> TenantHarness:
    tenant = session.query(Tenant).filter(Tenant.id == channel.tenant_id).first()
    return harness_for_tenant(tenant)


def run_diagnosis(session: Session, outlier_id: str) -> OutlierDiagnosis:
    if not settings.anthropic_api_key:
        raise DiagnosticAgentError("ANTHROPIC_API_KEY is not configured")

    outlier = session.query(Outlier).filter(Outlier.id == outlier_id).first()
    if outlier is None:
        raise DiagnosticAgentError(f"no outlier {outlier_id}")
    channel = session.query(Channel).filter(Channel.id == outlier.channel_id).first()
    if channel is None:
        raise DiagnosticAgentError(f"no channel {outlier.channel_id}")

    # The tenant that owns the channel selects the harness: prompt, evidence
    # fields, failure categories, window size, and model.
    harness = resolve_harness(session, channel)
    model = harness.model or settings.diagnostic_model

    window = _window_for(session, outlier, harness)
    user_prompt = _build_user_prompt(channel, outlier, window, harness)

    # Prompt caching: the system prompt + tool schema are identical for every
    # diagnosis within a tenant, so marking the end of the system block as a
    # cache breakpoint makes each subsequent call re-read that prefix at ~10%
    # of input price instead of paying full rate.
    system_blocks: list[dict] = [{"type": "text", "text": harness.system_prompt()}]
    if harness.context.cache_system_prompt:
        system_blocks[-1]["cache_control"] = {"type": "ephemeral"}

    client = Anthropic(api_key=settings.anthropic_api_key)
    diag_id = f"DIAG-{uuid.uuid4().hex[:12]}"

    def _error(msg: str, usage=None) -> OutlierDiagnosis:
        return OutlierDiagnosis(
            id=diag_id, outlier_id=outlier_id, created_at=datetime.now(timezone.utc),
            status="error", model=model, error=msg,
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
        )

    try:
        resp = client.messages.create(
            model=model,
            max_tokens=harness.context.max_output_tokens,
            system=system_blocks,
            tools=[harness.diagnosis_tool()],
            tool_choice={"type": "tool", "name": "submit_diagnosis"},
            messages=[{"role": "user", "content": user_prompt}],
        )
    except Exception as exc:  # noqa: BLE001 — persist the failure, don't crash the request
        return _error(str(exc))

    if resp.stop_reason == "max_tokens":
        return _error(
            "response truncated at max_tokens — tool input is incomplete/invalid JSON",
            resp.usage,
        )

    tool_use = next((b for b in resp.content if b.type == "tool_use"), None)
    if tool_use is None:
        return _error("model did not call submit_diagnosis", resp.usage)

    data = tool_use.input
    price_in, price_out = _price_for(model)
    # Cached prefix tokens are billed differently: writing the cache costs
    # 1.25x input, reading it 0.1x. Folding them in here keeps cost_usd
    # comparable across cached and uncached runs.
    cache_write = getattr(resp.usage, "cache_creation_input_tokens", 0) or 0
    cache_read = getattr(resp.usage, "cache_read_input_tokens", 0) or 0
    cost = (
        resp.usage.input_tokens / 1_000_000 * price_in
        + cache_write / 1_000_000 * price_in * 1.25
        + cache_read / 1_000_000 * price_in * 0.10
        + resp.usage.output_tokens / 1_000_000 * price_out
    )

    raw_hypotheses = data.get("hypotheses", [])
    if not isinstance(raw_hypotheses, list):
        raw_hypotheses = []

    valid_categories = {c.id for c in harness.failure_categories}
    hypotheses = []
    for h in raw_hypotheses:
        if not isinstance(h, dict):
            hypotheses.append({
                "cause": _clean(str(h)), "failure_category": None, "confidence": 0.0,
                "supporting_evidence": "", "contradicting_evidence": None,
            })
            continue
        # The enum in the tool schema is a strong constraint, not a guarantee.
        # A category outside this tenant's set is dropped rather than stored,
        # so nothing downstream can group by a category that doesn't exist here.
        category = _clean(h.get("failure_category")) or None
        if category not in valid_categories:
            category = None
        hypotheses.append({
            "cause": _clean(h.get("cause")),
            "failure_category": category,
            "confidence": h.get("confidence", 0.0),
            "supporting_evidence": _clean(h.get("supporting_evidence")),
            "contradicting_evidence": _clean(h.get("contradicting_evidence")) or None,
        })

    # The tool's input_schema is a strong hint, not a hard guarantee — be
    # defensive about which fields the model actually filled in rather than
    # letting a KeyError turn a real (billed) response into a lost run.
    return OutlierDiagnosis(
        id=diag_id,
        outlier_id=outlier_id,
        created_at=datetime.now(timezone.utc),
        status="complete",
        model=model,
        root_cause=_clean(data.get("root_cause")),
        hypotheses=hypotheses,
        confidence=data.get("confidence", 0.0),
        recommended_action=_clean(data.get("recommended_action")),
        evidence_summary=_clean(data.get("evidence_summary")),
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
        cost_usd=cost,
    )

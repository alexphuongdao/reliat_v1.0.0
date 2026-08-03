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
from .models import Channel, Measurement, Outlier, OutlierDiagnosis

WINDOW_BEFORE = 20
WINDOW_AFTER = 5

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

SYSTEM_PROMPT = """You are the diagnostic assistant for a mining/cement plant's particle-size-distribution \
monitoring system. You are given one detected outlier on a conveyor-belt PSD analyzer, plus the raw \
measurement window around it. Your job is root-cause diagnosis, not downstream-impact prediction.

Rules:
- Cite specific numbers from the evidence given. Never invent a number that isn't in the data.
- If the evidence is ambiguous, say so — list competing hypotheses with honest confidence, don't force one.
- Distinguish material/process causes (feed composition, blockage, oversize) from instrumentation causes \
(camera fault, lighting, belt vibration) — both are common in real PSD analyzer data.
- Speak like an engineer writing a shift-handoff note: precise, short sentences, no filler.
- Never recommend stopping the plant — this system only diagnoses, it does not make shutdown calls.

You MUST respond by calling `submit_diagnosis` exactly once."""

DIAGNOSIS_TOOL = {
    "name": "submit_diagnosis",
    "description": "Submit the root-cause diagnosis for this outlier.",
    "input_schema": {
        "type": "object",
        "properties": {
            "root_cause": {
                "type": "string",
                "description": "The single most likely root cause, 1-2 sentences, citing specific numbers.",
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
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "supporting_evidence": {"type": "string"},
                        "contradicting_evidence": {"type": "string"},
                    },
                    "required": ["cause", "confidence", "supporting_evidence"],
                },
            },
            "recommended_action": {
                "type": "string",
                "description": "One concrete next check or action for the plant/maintenance team.",
            },
            "evidence_summary": {
                "type": "string",
                "description": "2-4 sentences summarizing the concrete numeric evidence used.",
            },
        },
        "required": ["root_cause", "confidence", "hypotheses", "recommended_action", "evidence_summary"],
    },
}


def _window_for(session: Session, outlier: Outlier) -> list[Measurement]:
    before = list(session.execute(
        select(Measurement)
        .where(Measurement.channel_id == outlier.channel_id, Measurement.t <= outlier.t)
        .order_by(Measurement.t.desc())
        .limit(WINDOW_BEFORE)
    ).scalars())
    before.reverse()
    after = list(session.execute(
        select(Measurement)
        .where(Measurement.channel_id == outlier.channel_id, Measurement.t > outlier.t)
        .order_by(Measurement.t.asc())
        .limit(WINDOW_AFTER)
    ).scalars())
    return before + after


def _format_window(window: list[Measurement], outlier_t: datetime) -> str:
    lines = ["t_offset_s, f80, topsize, sd_ratio_10_5, color_hue, color_sat, color_light, video_rgb"]
    for m in window:
        offset = (m.t - outlier_t).total_seconds()
        rgb = f"({m.video_r:.0f},{m.video_g:.0f},{m.video_b:.0f})" if m.video_r is not None else "n/a"
        sd = f"{m.sd_ratio_10_5:.3f}" if m.sd_ratio_10_5 is not None else "n/a"
        marker = "  <-- OUTLIER" if m.t == outlier_t else ""
        lines.append(
            f"{offset:+.0f}s, {m.f80:.3f}, {m.topsize:.3f}, {sd}, "
            f"{m.color_hue:.3f}, {m.color_sat:.3f}, {m.color_light:.3f}, {rgb}{marker}"
        )
    return "\n".join(lines)


def _build_user_prompt(channel: Channel, outlier: Outlier, window: list[Measurement]) -> str:
    om = next((m for m in window if m.id == outlier.measurement_id), None)
    sieve_block = "not available"
    if om is not None and om.sieve_passing_raw:
        sieve_block = ", ".join(f"{k}={v:.1f}%" for k, v in sorted(om.sieve_passing_raw.items()))

    return f"""Channel: {channel.name} ({channel.id}), belt kind: {channel.belt}
Channel baseline: F80={channel.base_f80:.3f}, Topsize={channel.base_topsize:.3f} (learned from this channel's own history)

Outlier:
  time: {outlier.t.isoformat()}
  type: {outlier.type}
  metric: {outlier.metric} = {outlier.value:.3f} {outlier.unit}
  rolling baseline at detection: {outlier.baseline:.3f}
  deviation: {outlier.deviation:.2f} sigma
  severity: {outlier.sev}
  detector confidence: {outlier.confidence:.2f}

Real sieve passing % at the outlier sample (raw vendor columns, inches): {sieve_block}

Measurement window (~{WINDOW_BEFORE} samples before, {WINDOW_AFTER} after the outlier):
{_format_window(window, outlier.t)}

Diagnose the root cause of this outlier."""


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


def run_diagnosis(session: Session, outlier_id: str) -> OutlierDiagnosis:
    if not settings.anthropic_api_key:
        raise DiagnosticAgentError("ANTHROPIC_API_KEY is not configured")

    outlier = session.query(Outlier).filter(Outlier.id == outlier_id).first()
    if outlier is None:
        raise DiagnosticAgentError(f"no outlier {outlier_id}")
    channel = session.query(Channel).filter(Channel.id == outlier.channel_id).first()
    if channel is None:
        raise DiagnosticAgentError(f"no channel {outlier.channel_id}")

    window = _window_for(session, outlier)
    user_prompt = _build_user_prompt(channel, outlier, window)

    client = Anthropic(api_key=settings.anthropic_api_key)
    diag_id = f"DIAG-{uuid.uuid4().hex[:12]}"

    try:
        resp = client.messages.create(
            model=settings.diagnostic_model,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=[DIAGNOSIS_TOOL],
            tool_choice={"type": "tool", "name": "submit_diagnosis"},
            messages=[{"role": "user", "content": user_prompt}],
        )
    except Exception as exc:  # noqa: BLE001 — persist the failure, don't crash the request
        return OutlierDiagnosis(
            id=diag_id, outlier_id=outlier_id, created_at=datetime.now(timezone.utc),
            status="error", model=settings.diagnostic_model, error=str(exc),
        )

    if resp.stop_reason == "max_tokens":
        return OutlierDiagnosis(
            id=diag_id, outlier_id=outlier_id, created_at=datetime.now(timezone.utc),
            status="error", model=settings.diagnostic_model,
            error="response truncated at max_tokens — tool input is incomplete/invalid JSON",
            input_tokens=resp.usage.input_tokens, output_tokens=resp.usage.output_tokens,
        )

    tool_use = next((b for b in resp.content if b.type == "tool_use"), None)
    if tool_use is None:
        return OutlierDiagnosis(
            id=diag_id, outlier_id=outlier_id, created_at=datetime.now(timezone.utc),
            status="error", model=settings.diagnostic_model,
            error="model did not call submit_diagnosis",
            input_tokens=resp.usage.input_tokens, output_tokens=resp.usage.output_tokens,
        )

    data = tool_use.input
    price_in, price_out = _price_for(settings.diagnostic_model)
    cost = (
        resp.usage.input_tokens / 1_000_000 * price_in
        + resp.usage.output_tokens / 1_000_000 * price_out
    )

    raw_hypotheses = data.get("hypotheses", [])
    if not isinstance(raw_hypotheses, list):
        raw_hypotheses = []

    hypotheses = []
    for h in raw_hypotheses:
        if not isinstance(h, dict):
            hypotheses.append({
                "cause": _clean(str(h)), "confidence": 0.0,
                "supporting_evidence": "", "contradicting_evidence": None,
            })
            continue
        hypotheses.append({
            "cause": _clean(h.get("cause")),
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
        model=settings.diagnostic_model,
        root_cause=_clean(data.get("root_cause")),
        hypotheses=hypotheses,
        confidence=data.get("confidence", 0.0),
        recommended_action=_clean(data.get("recommended_action")),
        evidence_summary=_clean(data.get("evidence_summary")),
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
        cost_usd=cost,
    )

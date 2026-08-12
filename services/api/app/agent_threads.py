"""Recording agent work as durable conversation.

A diagnosis used to exist only as an `outlier_diagnoses` row reachable from the
one outlier it belonged to. That makes it an answer, not a record — you could
not find it again unless you remembered which outlier to open.

This turns each run into a thread with turns, the way a chat does, so the Agent
screen can list everything the agent has ever done for a tenant and reopen any
of it. The diagnosis row stays the artifact; the message only points at it.

Nothing here calls a model. It records what already happened.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import AgentMessage, AgentThread, Channel, Outlier, OutlierDiagnosis

KIND_DIAGNOSIS = "diagnosis"
KIND_ASK = "ask"


def _now() -> datetime:
    # Columns are naive DateTime throughout this schema — keep every write in
    # UTC-naive so comparisons against existing rows stay meaningful.
    return datetime.now(tz=timezone.utc).replace(tzinfo=None)


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def thread_for_outlier(
    session: Session,
    *,
    tenant_id: str,
    outlier: Outlier,
    channel: Channel | None,
    user_id: str | None,
) -> AgentThread:
    """The thread for this outlier, creating it on first run.

    One thread per outlier rather than one per run: re-running the agent is a
    further turn in the same conversation, which is what makes the history
    readable — you can see that it was asked three times and what changed.
    """
    existing = (
        session.query(AgentThread)
        .filter(
            AgentThread.tenant_id == tenant_id,
            AgentThread.outlier_id == outlier.id,
            AgentThread.kind == KIND_DIAGNOSIS,
        )
        .first()
    )
    if existing is not None:
        return existing

    name = channel.name if channel is not None else outlier.channel_id
    thread = AgentThread(
        id=_new_id("TH"),
        tenant_id=tenant_id,
        kind=KIND_DIAGNOSIS,
        title=f"{name} · {outlier.type}",
        channel_id=outlier.channel_id,
        outlier_id=outlier.id,
        created_by=user_id,
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(thread)
    session.flush()
    return thread


def record_diagnosis_run(
    session: Session,
    *,
    tenant_id: str,
    outlier: Outlier,
    channel: Channel | None,
    diagnosis: OutlierDiagnosis,
    user_id: str | None,
) -> AgentThread:
    """Append the request and its answer to the outlier's thread.

    Two turns, because that is what happened: somebody asked, the agent
    answered. The assistant turn carries `diagnosis_id` instead of a copy of
    the root cause, so editing or reinterpreting the artifact later cannot
    leave the transcript stating something different.
    """
    thread = thread_for_outlier(
        session, tenant_id=tenant_id, outlier=outlier, channel=channel, user_id=user_id
    )
    now = _now()

    session.add(AgentMessage(
        id=_new_id("MSG"),
        thread_id=thread.id,
        role="user",
        content=(
            f"Diagnose {outlier.id} — {outlier.type} on "
            f"{channel.name if channel else outlier.channel_id}, "
            f"{outlier.metric} {outlier.value:.2f}{outlier.unit} at "
            f"{outlier.deviation:.1f}σ."
        ),
        created_at=now,
    ))

    if diagnosis.status == "error":
        content = f"Diagnosis failed: {diagnosis.error or 'unknown error'}"
        diagnosis_ref = None
    else:
        content = diagnosis.root_cause
        diagnosis_ref = diagnosis.id

    session.add(AgentMessage(
        id=_new_id("MSG"),
        thread_id=thread.id,
        role="assistant",
        content=content,
        created_at=now,
        diagnosis_id=diagnosis_ref,
        model=diagnosis.model,
        input_tokens=diagnosis.input_tokens,
        output_tokens=diagnosis.output_tokens,
        cost_usd=diagnosis.cost_usd,
    ))

    thread.updated_at = now
    session.flush()
    return thread

"""Agent conversations — the durable record of what the agent has done.

Every query here filters on `AgentThread.tenant_id`. Threads are the first
table whose tenant boundary is its own column rather than something reached
through a channel, so there is no join to lean on: forgetting the filter here
returns every customer's transcripts. `test_cross_tenant_leak` covers it.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import Principal, get_principal
from ..db import get_session
from ..models import AgentMessage, AgentThread, OutlierDiagnosis

router = APIRouter(prefix="/api/agent", tags=["agent"])


class HypothesisOut(BaseModel):
    cause: str
    failureCategory: str | None
    confidence: float
    supportingEvidence: str
    contradictingEvidence: str | None


class ArtifactOut(BaseModel):
    """The auditable artifact attached to an assistant turn."""

    id: str
    status: str
    model: str
    rootCause: str
    hypotheses: list[HypothesisOut]
    confidence: float
    recommendedAction: str
    evidenceSummary: str
    inputTokens: int
    outputTokens: int
    costUsd: float


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    createdAt: int
    model: str | None
    costUsd: float
    artifact: ArtifactOut | None


class ThreadOut(BaseModel):
    id: str
    kind: str
    title: str
    channelId: str | None
    outlierId: str | None
    createdAt: int
    updatedAt: int
    messageCount: int
    costUsd: float


class ThreadDetailOut(ThreadOut):
    messages: list[MessageOut]


def _ms(dt) -> int:
    return int(dt.timestamp() * 1000)


def _artifact_out(d: OutlierDiagnosis | None) -> ArtifactOut | None:
    if d is None:
        return None
    return ArtifactOut(
        id=d.id,
        status=d.status,
        model=d.model,
        rootCause=d.root_cause,
        hypotheses=[
            HypothesisOut(
                cause=h.get("cause", ""),
                failureCategory=h.get("failure_category"),
                confidence=h.get("confidence", 0.0) or 0.0,
                supportingEvidence=h.get("supporting_evidence", ""),
                contradictingEvidence=h.get("contradicting_evidence"),
            )
            for h in (d.hypotheses or [])
            if isinstance(h, dict)
        ],
        confidence=d.confidence,
        recommendedAction=d.recommended_action,
        evidenceSummary=d.evidence_summary,
        inputTokens=d.input_tokens,
        outputTokens=d.output_tokens,
        costUsd=d.cost_usd,
    )


def _owned_thread(session: Session, thread_id: str, principal: Principal) -> AgentThread:
    """404, never 403 — a 403 would confirm the thread id exists."""
    q = session.query(AgentThread).filter(AgentThread.id == thread_id)
    if principal.tenant_id is not None:
        q = q.filter(AgentThread.tenant_id == principal.tenant_id)
    thread = q.first()
    if thread is None:
        raise HTTPException(404, f"no thread {thread_id}")
    return thread


@router.get("/threads", response_model=list[ThreadOut])
def list_threads(
    limit: int = 100,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[ThreadOut]:
    q = session.query(AgentThread)
    if principal.tenant_id is not None:
        q = q.filter(AgentThread.tenant_id == principal.tenant_id)
    threads = q.order_by(AgentThread.updated_at.desc()).limit(min(limit, 500)).all()

    out: list[ThreadOut] = []
    for t in threads:
        msgs = t.messages
        out.append(ThreadOut(
            id=t.id, kind=t.kind, title=t.title,
            channelId=t.channel_id, outlierId=t.outlier_id,
            createdAt=_ms(t.created_at), updatedAt=_ms(t.updated_at),
            messageCount=len(msgs),
            costUsd=sum(m.cost_usd for m in msgs),
        ))
    return out


@router.get("/threads/{thread_id}", response_model=ThreadDetailOut)
def get_thread(
    thread_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ThreadDetailOut:
    thread = _owned_thread(session, thread_id, principal)

    diag_ids = [m.diagnosis_id for m in thread.messages if m.diagnosis_id]
    diagnoses: dict[str, OutlierDiagnosis] = {}
    if diag_ids:
        diagnoses = {
            d.id: d
            for d in session.query(OutlierDiagnosis)
            .filter(OutlierDiagnosis.id.in_(diag_ids))
            .all()
        }

    messages = [
        MessageOut(
            id=m.id, role=m.role, content=m.content,
            createdAt=_ms(m.created_at), model=m.model, costUsd=m.cost_usd,
            artifact=_artifact_out(diagnoses.get(m.diagnosis_id) if m.diagnosis_id else None),
        )
        for m in thread.messages
    ]

    return ThreadDetailOut(
        id=thread.id, kind=thread.kind, title=thread.title,
        channelId=thread.channel_id, outlierId=thread.outlier_id,
        createdAt=_ms(thread.created_at), updatedAt=_ms(thread.updated_at),
        messageCount=len(messages),
        costUsd=sum(m.costUsd for m in messages),
        messages=messages,
    )

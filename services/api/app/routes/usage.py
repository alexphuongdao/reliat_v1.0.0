"""Diagnostic Agent usage — token/cost visibility across all runs.

`cost_usd` figures are computed in-app from an approximate per-model price
table (see `diagnostic_agent.PRICE_PER_MTOK`) — not a billing source of
truth. Real spend: https://console.anthropic.com/settings/usage
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import Principal, get_principal
from ..db import get_session
from ..models import Channel, Outlier, OutlierDiagnosis

router = APIRouter(prefix="/api/usage", tags=["usage"])


class ModelUsage(BaseModel):
    model: str
    calls: int
    inputTokens: int
    outputTokens: int
    costUsd: float


class RunUsage(BaseModel):
    id: str
    outlierId: str
    createdAt: int
    status: str
    model: str
    inputTokens: int
    outputTokens: int
    costUsd: float


class UsageOut(BaseModel):
    totalCalls: int
    totalInputTokens: int
    totalOutputTokens: int
    totalCostUsd: float
    byModel: list[ModelUsage]
    recent: list[RunUsage]


@router.get("", response_model=UsageOut)
def get_usage(
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> UsageOut:
    # Spend is per-tenant: a diagnosis belongs to an outlier, which belongs to
    # a channel, which belongs to a tenant. Without this join a customer would
    # see another customer's agent activity in their own cost totals.
    def _scoped(stmt):
        if principal.tenant_id is None:
            return stmt
        return (
            stmt.join(Outlier, Outlier.id == OutlierDiagnosis.outlier_id)
            .join(Channel, Channel.id == Outlier.channel_id)
            .where(Channel.tenant_id == principal.tenant_id)
        )

    by_model_rows = session.execute(
        _scoped(
            select(
                OutlierDiagnosis.model,
                func.count(OutlierDiagnosis.id),
                func.coalesce(func.sum(OutlierDiagnosis.input_tokens), 0),
                func.coalesce(func.sum(OutlierDiagnosis.output_tokens), 0),
                func.coalesce(func.sum(OutlierDiagnosis.cost_usd), 0.0),
            )
        ).group_by(OutlierDiagnosis.model)
    ).all()

    by_model = [
        ModelUsage(model=m, calls=c, inputTokens=i, outputTokens=o, costUsd=round(cost, 4))
        for m, c, i, o, cost in by_model_rows
    ]

    recent_rows = session.execute(
        _scoped(select(OutlierDiagnosis))
        .order_by(OutlierDiagnosis.created_at.desc())
        .limit(50)
    ).scalars().all()
    recent = [
        RunUsage(
            id=d.id, outlierId=d.outlier_id, createdAt=int(d.created_at.timestamp() * 1000),
            status=d.status, model=d.model, inputTokens=d.input_tokens,
            outputTokens=d.output_tokens, costUsd=round(d.cost_usd, 4),
        )
        for d in recent_rows
    ]

    return UsageOut(
        totalCalls=sum(m.calls for m in by_model),
        totalInputTokens=sum(m.inputTokens for m in by_model),
        totalOutputTokens=sum(m.outputTokens for m in by_model),
        totalCostUsd=round(sum(m.costUsd for m in by_model), 4),
        byModel=by_model,
        recent=recent,
    )

"""The caller's agent harness — which context, tools, and rules the AI runs with.

Exposed so the UI can show *which* harness produced a diagnosis. Two tenants
hitting the same model get different answers because they get different
context, and that difference should be visible in the product rather than
buried in a prompt string.

Read-only. No tenant may read another tenant's harness: the profile is
resolved from the caller's own principal, and there is no id parameter to
tamper with.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import Principal, get_principal
from ..harness import harness_for_tenant

router = APIRouter(prefix="/api/harness", tags=["harness"])


class FailureCategoryOut(BaseModel):
    id: str
    label: str


class HarnessOut(BaseModel):
    slug: str
    label: str
    domain: str
    instrument: str
    sampling: str
    model: str | None
    windowBefore: int
    windowAfter: int
    promptCaching: bool
    evidenceFields: list[str]
    failureCategories: list[FailureCategoryOut]
    operatingRules: list[str]
    #: False when the tenant has no registered profile and the conservative
    #: generic fallback is in use — worth surfacing, not hiding.
    profiled: bool


@router.get("", response_model=HarnessOut)
def current_harness(principal: Principal = Depends(get_principal)) -> HarnessOut:
    h = harness_for_tenant(principal.tenant)
    s = h.summary()
    return HarnessOut(
        slug=s["slug"],
        label=s["label"],
        domain=s["domain"],
        instrument=s["instrument"],
        sampling=s["sampling"],
        model=s["model"],
        windowBefore=s["window_before"],
        windowAfter=s["window_after"],
        promptCaching=s["prompt_caching"],
        evidenceFields=s["evidence_fields"],
        failureCategories=[FailureCategoryOut(**c) for c in s["failure_categories"]],
        operatingRules=s["operating_rules"],
        profiled=h.slug != "generic",
    )

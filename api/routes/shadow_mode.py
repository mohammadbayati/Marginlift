"""Shadow Mode evaluation endpoint.

Enterprise CRM systems call POST /score with an audience list.
The service classifies each customer, returns Next Best Action,
and never triggers any actual campaign.
"""

from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from api.models.uplift_evaluator import (
    Action,
    CustomerFeatures,
    ScoredCustomer,
    Segment,
    score_batch,
)

router = APIRouter()


class AudienceCustomer(BaseModel):
    customer_id_hash: str
    recency_days: float = Field(ge=0, default=30)
    frequency: int = Field(ge=0, default=1)
    monetary_value: float = Field(ge=0, default=0)
    avg_order_gap_days: float = Field(ge=0, default=0)
    discount_usage_rate: float = Field(ge=0, le=1, default=0)
    channel_engagement_score: float = Field(ge=0, le=1, default=0.5)
    tenure_days: int = Field(ge=0, default=0)
    gross_margin_rate: float = Field(ge=0, le=1, default=1.0)
    incentive_cost: float = Field(ge=0, default=0)
    channel_cost: float = Field(ge=0, default=0)


class ShadowRequest(BaseModel):
    organization_id: str
    campaign_id: Optional[str] = None
    audience: list[AudienceCustomer] = Field(min_length=1, max_length=100_000)

    @field_validator("organization_id")
    @classmethod
    def org_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("organization_id is required")
        return v.strip()


class ShadowDecision(BaseModel):
    customer_id_hash: str
    segment: Segment
    segment_fa: str
    action: Action
    uplift_score: float
    expected_incremental_profit: float
    is_waste: bool


class ShadowResponse(BaseModel):
    evaluation_id: str
    mode: str = "shadow"
    live_action_allowed: bool = False
    scored_count: int
    waste_count: int
    waste_budget: float
    decisions: list[ShadowDecision]
    latency_ms: float


@router.post("/score", response_model=ShadowResponse)
async def evaluate_shadow(request: ShadowRequest):
    start = time.perf_counter()

    features = [
        CustomerFeatures(**customer.model_dump())
        for customer in request.audience
    ]

    scored = score_batch(features)

    waste_items = [s for s in scored if s.is_waste]
    waste_budget = sum(
        c.incentive_cost + c.channel_cost
        for c, s in zip(request.audience, scored)
        if s.is_waste
    )

    import hashlib
    eval_id = hashlib.sha256(
        f"{request.organization_id}:{request.campaign_id}:{time.time()}".encode()
    ).hexdigest()[:16]

    decisions = [
        ShadowDecision(
            customer_id_hash=s.customer_id_hash,
            segment=s.segment,
            segment_fa=s.segment_fa,
            action=s.action,
            uplift_score=s.uplift_score,
            expected_incremental_profit=s.expected_incremental_profit,
            is_waste=s.is_waste,
        )
        for s in scored
    ]

    elapsed = (time.perf_counter() - start) * 1000

    return ShadowResponse(
        evaluation_id=eval_id,
        scored_count=len(scored),
        waste_count=len(waste_items),
        waste_budget=round(waste_budget, 2),
        decisions=decisions,
        latency_ms=round(elapsed, 2),
    )

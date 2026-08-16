"""Orchestration & Kill-Switch decision endpoint.

Turns uplift scores into explicit per-customer SEND / DROP commands so a
client CRM can gate live SMS/Push sends in real time:

  - Persuadable  -> SEND with an optimal promotion tier
  - Sure Thing   -> DROP (would convert anyway)
  - Sleeping Dog -> DROP (message hurts)
  - Lost Cause   -> DROP (no effect)

Circuit breaker: when the caller reports a causal-drift reading above the
threshold (model degraded) or forces a halt, every command is forced to
DROP for safety. Stateless by design — all breaker inputs arrive in the
request; the Node.js gateway owns the persisted latch and audit log.
"""

from __future__ import annotations

import hashlib
import time
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from models.uplift_evaluator import CustomerFeatures, Segment, score_batch

router = APIRouter()

DEFAULT_DRIFT_THRESHOLD = 0.2

# Persuadable promotion ladder, matching the product's action vocabulary:
# no offer -> low-cost message -> small discount -> strong incentive.
PROMOTION_TIERS = (
    (0.15, "strong_incentive", "مشوق قوی"),
    (0.07, "small_discount", "تخفیف کوچک"),
    (0.0, "low_cost_message", "پیام کم‌هزینه"),
)


def _promotion_for(uplift: float) -> tuple[str, str]:
    for floor, code, label in PROMOTION_TIERS:
        if uplift >= floor:
            return code, label
    return "low_cost_message", "پیام کم‌هزینه"


class OrchestrateCustomer(BaseModel):
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


class OrchestrateRequest(BaseModel):
    organization_id: str
    campaign_id: Optional[str] = None
    audience: list[OrchestrateCustomer] = Field(min_length=1, max_length=100_000)
    causal_drift: float = Field(ge=0, default=0.0)
    drift_threshold: float = Field(gt=0, default=DEFAULT_DRIFT_THRESHOLD)
    force_halt: bool = False

    @field_validator("organization_id")
    @classmethod
    def org_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("organization_id is required")
        return v.strip()


class OrchestrationCommand(BaseModel):
    customer_id_hash: str
    command: str  # SEND | DROP
    segment: Segment
    segment_fa: str
    promotion: Optional[str] = None
    promotion_fa: Optional[str] = None
    uplift_score: float
    reason: str


class OrchestrateResponse(BaseModel):
    orchestration_id: str
    mode: str = "live_gate"
    halted: bool
    halt_reason: Optional[str] = None
    causal_drift: float
    drift_threshold: float
    scored_count: int
    send_count: int
    drop_count: int
    decisions: list[OrchestrationCommand]
    latency_ms: float


@router.post("/decide", response_model=OrchestrateResponse)
async def orchestrate(request: OrchestrateRequest):
    start = time.perf_counter()

    breaker_open = request.force_halt or request.causal_drift > request.drift_threshold
    halt_reason = None
    if breaker_open:
        halt_reason = "operator_halt" if request.force_halt else "causal_drift_exceeded"

    features = [CustomerFeatures(**c.model_dump()) for c in request.audience]
    scored = score_batch(features)

    decisions: list[OrchestrationCommand] = []
    send_count = 0
    for s in scored:
        if breaker_open:
            decisions.append(OrchestrationCommand(
                customer_id_hash=s.customer_id_hash,
                command="DROP",
                segment=s.segment,
                segment_fa=s.segment_fa,
                uplift_score=s.uplift_score,
                reason="circuit_breaker_open",
            ))
        elif s.segment == Segment.PERSUADABLE:
            code, label = _promotion_for(s.uplift_score)
            send_count += 1
            decisions.append(OrchestrationCommand(
                customer_id_hash=s.customer_id_hash,
                command="SEND",
                segment=s.segment,
                segment_fa=s.segment_fa,
                promotion=code,
                promotion_fa=label,
                uplift_score=s.uplift_score,
                reason="persuadable",
            ))
        else:
            decisions.append(OrchestrationCommand(
                customer_id_hash=s.customer_id_hash,
                command="DROP",
                segment=s.segment,
                segment_fa=s.segment_fa,
                uplift_score=s.uplift_score,
                reason="non_incremental",
            ))

    orch_id = hashlib.sha256(
        f"{request.organization_id}:{request.campaign_id}:{time.time()}".encode()
    ).hexdigest()[:16]

    elapsed = (time.perf_counter() - start) * 1000
    return OrchestrateResponse(
        orchestration_id=orch_id,
        halted=breaker_open,
        halt_reason=halt_reason,
        causal_drift=request.causal_drift,
        drift_threshold=request.drift_threshold,
        scored_count=len(scored),
        send_count=send_count,
        drop_count=len(scored) - send_count,
        decisions=decisions,
        latency_ms=round(elapsed, 2),
    )

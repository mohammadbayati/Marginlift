"""Uplift segment classifier and Next Best Action engine.

Uses the MarginLift four-quadrant uplift framework:
  - Persuadable:  positive uplift  → action recommended
  - Sure Thing:   converts anyway  → DROP (wasted budget)
  - Sleeping Dog: negative uplift  → DROP (counterproductive)
  - Lost Cause:   won't convert    → DROP (no effect)
"""

from __future__ import annotations

import hashlib
import os
from enum import Enum
from typing import Sequence

import joblib
import numpy as np
from pydantic import BaseModel, Field

# UpliftSLearner must be importable here for joblib to unpickle the artifact.
from models.uplift_model import UpliftSLearner, FEATURE_NAMES  # noqa: F401

_MODEL_PATH = os.environ.get(
    "MARGINLIFT_UPLIFT_MODEL",
    os.path.join(os.path.dirname(__file__), "artifacts", "uplift_slearner.joblib"),
)
try:
    _MODEL = joblib.load(_MODEL_PATH)
    MODEL_SOURCE = "slearner"
except Exception:  # missing/incompatible artifact -> deterministic heuristic
    _MODEL = None
    MODEL_SOURCE = "heuristic_fallback"


class Segment(str, Enum):
    PERSUADABLE = "persuadable"
    SURE_THING = "sure_thing"
    SLEEPING_DOG = "sleeping_dog"
    LOST_CAUSE = "lost_cause"


class Action(str, Enum):
    DISCOUNT = "discount"
    PUSH = "push"
    SMS = "sms"
    DROP = "drop"


SEGMENT_ACTION_MAP: dict[Segment, Action] = {
    Segment.PERSUADABLE: Action.DISCOUNT,
    Segment.SURE_THING: Action.DROP,
    Segment.SLEEPING_DOG: Action.DROP,
    Segment.LOST_CAUSE: Action.DROP,
}

SEGMENT_LABEL_FA: dict[Segment, str] = {
    Segment.PERSUADABLE: "قابل ترغیب",
    Segment.SURE_THING: "خریدار حتمی",
    Segment.SLEEPING_DOG: "واکنش منفی",
    Segment.LOST_CAUSE: "غیرقابل بازگشت",
}


class CustomerFeatures(BaseModel):
    customer_id_hash: str
    recency_days: float = Field(ge=0)
    frequency: int = Field(ge=0)
    monetary_value: float = Field(ge=0)
    avg_order_gap_days: float = Field(ge=0, default=0)
    discount_usage_rate: float = Field(ge=0, le=1, default=0)
    channel_engagement_score: float = Field(ge=0, le=1, default=0.5)
    tenure_days: int = Field(ge=0, default=0)
    gross_margin_rate: float = Field(ge=0, le=1, default=1.0)
    incentive_cost: float = Field(ge=0, default=0)
    channel_cost: float = Field(ge=0, default=0)


class ScoredCustomer(BaseModel):
    customer_id_hash: str
    segment: Segment
    segment_fa: str
    action: Action
    uplift_score: float
    treatment_probability: float
    control_probability: float
    expected_incremental_profit: float
    is_waste: bool


def _hash_features(features: CustomerFeatures) -> float:
    """Deterministic pseudo-random score from customer hash for demo/shadow.

    In production this would call a trained uplift model (Causal Forest,
    X-Learner, etc). For shadow evaluation we use a deterministic function
    of customer features that produces realistic segment distributions.
    """
    digest = hashlib.sha256(features.customer_id_hash.encode()).hexdigest()
    base = int(digest[:8], 16) / 0xFFFFFFFF

    recency_signal = max(0, 1 - features.recency_days / 180)
    frequency_signal = min(1, features.frequency / 20)
    monetary_signal = min(1, features.monetary_value / 5_000_000)
    discount_signal = features.discount_usage_rate
    engagement_signal = features.channel_engagement_score

    treatment_p = np.clip(
        0.3 * recency_signal
        + 0.25 * frequency_signal
        + 0.15 * monetary_signal
        + 0.15 * engagement_signal
        + 0.15 * base,
        0.01, 0.99,
    )
    control_p = np.clip(
        treatment_p * (0.4 + 0.5 * discount_signal + 0.1 * base),
        0.01, 0.99,
    )

    return float(treatment_p), float(control_p)


def classify_segment(treatment_p: float, control_p: float) -> Segment:
    uplift = treatment_p - control_p
    if treatment_p >= 0.5 and uplift > 0.02:
        return Segment.SURE_THING if control_p >= 0.45 else Segment.PERSUADABLE
    if uplift < -0.01:
        return Segment.SLEEPING_DOG
    return Segment.LOST_CAUSE


def _build_scored(features: CustomerFeatures, treatment_p: float, control_p: float) -> ScoredCustomer:
    segment = classify_segment(treatment_p, control_p)
    action = SEGMENT_ACTION_MAP[segment]
    uplift = treatment_p - control_p
    incremental_revenue = uplift * features.monetary_value * features.gross_margin_rate
    incremental_profit = incremental_revenue - features.incentive_cost - features.channel_cost

    return ScoredCustomer(
        customer_id_hash=features.customer_id_hash,
        segment=segment,
        segment_fa=SEGMENT_LABEL_FA[segment],
        action=action,
        uplift_score=round(uplift, 4),
        treatment_probability=round(treatment_p, 4),
        control_probability=round(control_p, 4),
        expected_incremental_profit=round(incremental_profit, 2),
        is_waste=segment in (Segment.SURE_THING, Segment.SLEEPING_DOG),
    )


def _features_matrix(customers: Sequence[CustomerFeatures]) -> np.ndarray:
    return np.array(
        [[getattr(c, name) for name in FEATURE_NAMES] for c in customers],
        dtype=float,
    )


def score_customer(features: CustomerFeatures) -> ScoredCustomer:
    if _MODEL is not None:
        treatment_p, control_p = _MODEL.predict_probs(_features_matrix([features]))
        return _build_scored(features, float(treatment_p[0]), float(control_p[0]))
    treatment_p, control_p = _hash_features(features)
    return _build_scored(features, treatment_p, control_p)


def score_batch(customers: Sequence[CustomerFeatures]) -> list[ScoredCustomer]:
    if not customers:
        return []
    if _MODEL is not None:
        treatment_ps, control_ps = _MODEL.predict_probs(_features_matrix(customers))
        return [
            _build_scored(c, float(treatment_ps[i]), float(control_ps[i]))
            for i, c in enumerate(customers)
        ]
    return [score_customer(c) for c in customers]

"""Real uplift model — S-Learner over a gradient-boosted classifier.

Replaces the deterministic hash heuristic. An S-Learner fits a single
conversion model with the treatment indicator as an input feature, then
estimates uplift by predicting each customer twice — once as treated, once as
control:

    uplift(x) = P(convert | treated, x) - P(convert | control, x)

The S-Learner is used (rather than a two-model T-Learner) because the scorer
needs *both* arm probabilities — `classify_segment` gates on the absolute
treatment probability, not just the difference — and a single shared model is
more sample-efficient when the treatment effect is small.

Trained offline (api/train_uplift.py) on a documented synthetic
data-generating process and persisted as a joblib artifact the scorer loads at
startup. `FEATURE_NAMES` is the single source of truth for column order.
"""

from __future__ import annotations

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier

# Canonical feature order. Both the DGP and the live scorer build rows in
# exactly this order; the treatment indicator is appended as the final column.
FEATURE_NAMES = [
    "recency_days",
    "frequency",
    "monetary_value",
    "avg_order_gap_days",
    "discount_usage_rate",
    "channel_engagement_score",
    "tenure_days",
    "gross_margin_rate",
]


class UpliftSLearner:
    """Single-model (S-Learner) uplift estimator."""

    def __init__(self) -> None:
        self.model = HistGradientBoostingClassifier(
            max_iter=300,
            learning_rate=0.07,
            max_leaf_nodes=31,
            l2_regularization=1.0,
            random_state=42,
        )
        self.feature_names = list(FEATURE_NAMES)

    def fit(self, X: np.ndarray, w: np.ndarray, y: np.ndarray) -> "UpliftSLearner":
        X = np.asarray(X, dtype=float)
        w = np.asarray(w).astype(float).reshape(-1, 1)
        y = np.asarray(y).astype(int)
        self.model.fit(np.hstack([X, w]), y)
        return self

    def predict_probs(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Return (treatment_probability, control_probability) arrays."""
        X = np.asarray(X, dtype=float)
        n = X.shape[0]
        treated = np.hstack([X, np.ones((n, 1))])
        control = np.hstack([X, np.zeros((n, 1))])
        treatment_p = np.clip(self.model.predict_proba(treated)[:, 1], 0.01, 0.99)
        control_p = np.clip(self.model.predict_proba(control)[:, 1], 0.01, 0.99)
        return treatment_p, control_p

    def predict_uplift(self, X: np.ndarray) -> np.ndarray:
        treatment_p, control_p = self.predict_probs(X)
        return treatment_p - control_p


def generate_training_data(n: int = 60_000, seed: int = 7):
    """Documented synthetic data-generating process with a known uplift shape.

    Produces the four uplift quadrants naturally:
      - Sure Things:   high baseline conversion, little room to move.
      - Persuadables:  engaged, not discount-addicted -> positive uplift.
      - Sleeping Dogs: loyal + discount-sensitive -> negative uplift.
      - Lost Causes:   low baseline, unmoved by treatment.

    Returns (X, w, y, tau_true); tau_true is ground-truth uplift used only for
    validation and never seen by the model.
    """
    rng = np.random.default_rng(seed)

    recency_days = rng.exponential(45, n).clip(0, 365)
    frequency = rng.poisson(6, n).clip(0, 40).astype(float)
    monetary_value = rng.lognormal(mean=13.2, sigma=0.9, size=n).clip(0, 20_000_000)
    avg_order_gap_days = rng.exponential(25, n).clip(0, 120)
    discount_usage_rate = rng.beta(2, 3, n)
    channel_engagement_score = rng.beta(2.5, 2.5, n)
    tenure_days = rng.uniform(0, 1000, n)
    gross_margin_rate = rng.beta(4, 6, n)  # centered ~0.4

    recent = 1 - recency_days / 365
    freq_n = frequency / 40
    monetary_n = monetary_value / 20_000_000
    disc_n = discount_usage_rate
    eng_n = channel_engagement_score
    tenure_n = tenure_days / 1000

    # Baseline (control) conversion — the "would buy anyway" force.
    control_logit = -1.2 + 2.0 * freq_n + 1.2 * recent + 0.7 * monetary_n + 1.3 * disc_n + 0.5 * eng_n
    control_p = 1 / (1 + np.exp(-control_logit))

    # Uplift: engaged, not discount-addicted customers respond; loyal +
    # discount-sensitive customers react negatively (sleeping dogs).
    persuade = 0.55 * eng_n * (1 - disc_n) * (0.4 + 0.6 * recent)
    sleeping = -0.35 * tenure_n * disc_n
    tau = persuade + sleeping
    treatment_p = np.clip(control_p + tau, 0.01, 0.99)

    X = np.column_stack([
        recency_days, frequency, monetary_value, avg_order_gap_days,
        discount_usage_rate, channel_engagement_score, tenure_days, gross_margin_rate,
    ])
    w = rng.integers(0, 2, n)  # randomised controlled assignment (p=0.5)
    p_assigned = np.where(w == 1, treatment_p, control_p)
    y = (rng.random(n) < p_assigned).astype(int)
    tau_true = treatment_p - control_p
    return X, w, y, tau_true

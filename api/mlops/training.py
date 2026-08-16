"""Shared training + evaluation helpers for the uplift model.

Used by both the build-time seed trainer (api/train_uplift.py) and the
retraining loop (api/mlops/retrain.py) so the two never drift apart.
"""

from __future__ import annotations

import numpy as np

from models.uplift_model import UpliftSLearner, generate_training_data

HOLDOUT_FRAC = 0.25


def build_dataset(n: int, seed: int):
    """Generate a dataset and split off a validation holdout."""
    X, w, y, tau = generate_training_data(n=n, seed=seed)
    split = int(len(X) * (1 - HOLDOUT_FRAC))
    train = (X[:split], w[:split], y[:split])
    holdout = (X[split:], w[split:], y[split:], tau[split:])
    return train, holdout


def train_candidate(n: int, seed: int):
    """Train an S-Learner on fresh data; return (model, holdout)."""
    (Xtr, wtr, ytr), holdout = build_dataset(n, seed)
    model = UpliftSLearner().fit(Xtr, wtr, ytr)
    return model, holdout


def qini_area(y: np.ndarray, w: np.ndarray, pred: np.ndarray) -> float:
    """Normalised area between the model's Qini curve and the random baseline.
    Positive => ranks uplift better than random."""
    order = np.argsort(-pred)
    y, w = np.asarray(y)[order], np.asarray(w)[order]
    cum_t = np.cumsum(w * y)
    cum_c = np.cumsum((1 - w) * y)
    cum_nt = np.cumsum(w)
    cum_nc = np.cumsum(1 - w)
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.where(cum_nc > 0, cum_nt / cum_nc, 0.0)
    qini = cum_t - cum_c * ratio
    n = len(y)
    baseline = np.arange(1, n + 1) / n * qini[-1]
    return float(np.trapezoid(qini - baseline) / n)


def decile_uplift(y, w, pred, frac: float = 0.3):
    order = np.argsort(-pred)
    y, w = np.asarray(y)[order], np.asarray(w)[order]
    k = max(1, int(len(y) * frac))

    def actual(sel_y, sel_w):
        t, c = sel_w == 1, sel_w == 0
        rt = sel_y[t].mean() if t.sum() else 0.0
        rc = sel_y[c].mean() if c.sum() else 0.0
        return rt - rc

    return actual(y[:k], w[:k]), actual(y[-k:], w[-k:])


def evaluate(model, holdout) -> dict:
    Xh, wh, yh, tau_h = holdout
    pred = model.predict_uplift(Xh)
    top, bottom = decile_uplift(yh, wh, pred)
    return {
        "n": int(len(Xh)),
        "corr_true_tau": round(float(np.corrcoef(pred, tau_h)[0, 1]), 4),
        "qini_area": round(qini_area(yh, wh, pred), 5),
        "top_decile_uplift": round(float(top), 4),
        "bottom_decile_uplift": round(float(bottom), 4),
    }


def validate_metrics(metrics: dict) -> None:
    """Hard gates — a model that fails these is not a real uplift ranker."""
    assert metrics["corr_true_tau"] > 0.4, f"corr too low: {metrics['corr_true_tau']}"
    assert metrics["qini_area"] > 0, f"qini not above random: {metrics['qini_area']}"
    assert metrics["top_decile_uplift"] > metrics["bottom_decile_uplift"], "top decile not above bottom"


def bootstrap_qini_diff_lower(y, w, model_a, X, model_b, b: int = 300, alpha: float = 0.05, seed: int = 0) -> float:
    """Lower bound of the (Qini_a - Qini_b) bootstrap CI on a shared holdout.

    Promotion requires this lower bound to clear a positive margin, i.e. the
    challenger must be better than the champion beyond sampling noise.
    """
    y = np.asarray(y)
    w = np.asarray(w)
    pred_a = model_a.predict_uplift(X)
    pred_b = model_b.predict_uplift(X)
    rng = np.random.default_rng(seed)
    n = len(y)
    diffs = np.empty(b)
    for i in range(b):
        idx = rng.integers(0, n, n)
        diffs[i] = qini_area(y[idx], w[idx], pred_a[idx]) - qini_area(y[idx], w[idx], pred_b[idx])
    return float(np.quantile(diffs, alpha))

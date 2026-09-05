"""Shared training + evaluation helpers for the uplift model.

Used by both the build-time seed trainer (api/train_uplift.py) and the
retraining loop (api/mlops/retrain.py) so the two never drift apart.
"""

from __future__ import annotations

import json
import os

import numpy as np

from models.uplift_model import UpliftSLearner, FEATURE_NAMES, generate_training_data

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
    # Real data has no ground-truth tau; correlation is only available on the
    # synthetic DGP.
    corr = None if tau_h is None else round(float(np.corrcoef(pred, tau_h)[0, 1]), 4)
    return {
        "n": int(len(Xh)),
        "corr_true_tau": corr,
        "qini_area": round(qini_area(yh, wh, pred), 5),
        "top_decile_uplift": round(float(top), 4),
        "bottom_decile_uplift": round(float(bottom), 4),
    }


def validate_metrics(metrics: dict) -> None:
    """Hard gates — a model that fails these is not a real uplift ranker."""
    assert metrics["qini_area"] > 0, f"qini not above random: {metrics['qini_area']}"
    assert metrics["top_decile_uplift"] > metrics["bottom_decile_uplift"], "top decile not above bottom"
    if metrics.get("corr_true_tau") is not None:
        assert metrics["corr_true_tau"] > 0.4, f"corr too low: {metrics['corr_true_tau']}"


def load_real_dataset(path: str, min_rows: int = 2000):
    """Load labeled training rows reported by clients (JSONL of
    {features:{...}, w, y}). Returns (X, w, y) or None when there is not yet
    enough usable real data — in which case the caller falls back to the
    synthetic DGP.
    """
    if not path or not os.path.exists(path):
        return None
    X, w, y = [], [], []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                feats = row.get("features") or {}
                X.append([float(feats.get(name, 0.0)) for name in FEATURE_NAMES])
                w.append(int(row.get("w", 0)))
                y.append(int(row.get("y", 0)))
            except (ValueError, TypeError):
                continue
    if len(X) < min_rows:
        return None
    Xa, wa, ya = np.array(X, dtype=float), np.array(w), np.array(y)
    # Need both arms and both outcome classes to fit an S-Learner meaningfully.
    if wa.sum() == 0 or (1 - wa).sum() == 0 or ya.sum() == 0 or (1 - ya).sum() == 0:
        return None
    return Xa, wa, ya


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

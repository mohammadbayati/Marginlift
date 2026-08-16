"""Autonomous retraining loop with significance-gated promotion.

Trains a fresh challenger, compares it to the current production champion on a
shared holdout, and promotes the challenger to production ONLY if it is better
beyond sampling noise (the bootstrap lower bound of the Qini difference clears
a positive margin). Otherwise the champion is kept and the challenger archived.

On a fresh registry (no champion) the first valid model is registered and
promoted as the bootstrap production model.

Exit codes (read by ops/vm/retrain.sh):
    10  production pointer changed -> caller should restart the scorer
    0   no change (champion held)
    !=0 error
"""

from __future__ import annotations

import os
import sys
import time

import numpy as np

from models.uplift_model import UpliftSLearner
from mlops.registry import Registry
from mlops.training import (
    HOLDOUT_FRAC,
    bootstrap_qini_diff_lower,
    build_dataset,
    evaluate,
    load_real_dataset,
    qini_area,
    validate_metrics,
)

REGISTRY_ROOT = os.environ.get("MARGINLIFT_MODEL_REGISTRY", "/models")
TRAIN_N = int(os.environ.get("MARGINLIFT_RETRAIN_N", "60000"))
PROMOTION_MARGIN = float(os.environ.get("MARGINLIFT_PROMOTION_MARGIN", "0.0"))
REAL_DATA_PATH = os.environ.get("MARGINLIFT_TRAINING_DATA", "/training/examples.jsonl")
MIN_REAL_ROWS = int(os.environ.get("MARGINLIFT_MIN_REAL_ROWS", "2000"))


def _load_training(seed: int):
    """Prefer real client-reported labels; fall back to the synthetic DGP.
    Returns (train_tuple, holdout_tuple, source)."""
    real = load_real_dataset(REAL_DATA_PATH, MIN_REAL_ROWS)
    if real is not None:
        X, w, y = real
        rng = np.random.default_rng(seed)
        idx = rng.permutation(len(X))
        split = int(len(X) * (1 - HOLDOUT_FRAC))
        tr, ho = idx[:split], idx[split:]
        return (X[tr], w[tr], y[tr]), (X[ho], w[ho], y[ho], None), "real"
    train, holdout = build_dataset(TRAIN_N, seed)
    return train, holdout, "synthetic"


def main() -> int:
    reg = Registry(REGISTRY_ROOT)
    seed = int(time.time()) % (2**31 - 1)

    train, holdout, source = _load_training(seed)
    challenger = UpliftSLearner().fit(*train)
    metrics = evaluate(challenger, holdout)
    metrics["data_source"] = source
    validate_metrics(metrics)  # a challenger must at least be a real ranker
    print(f"challenger metrics ({source}): {metrics}")

    champion = reg.load_production()
    if champion is None:
        version = reg.register(challenger, {**metrics, "note": "bootstrap"}, status="candidate")
        reg.promote(version)
        print(f"bootstrap: promoted {version} as production")
        return 10

    Xh, wh, yh, _ = holdout
    q_challenger = qini_area(yh, wh, challenger.predict_uplift(Xh))
    q_champion = qini_area(yh, wh, champion.predict_uplift(Xh))
    diff_low = bootstrap_qini_diff_lower(yh, wh, challenger, Xh, champion, seed=seed)
    decision = {
        "qini_challenger": round(q_challenger, 5),
        "qini_champion": round(q_champion, 5),
        "qini_diff_ci_low": round(diff_low, 5),
        "margin": PROMOTION_MARGIN,
    }
    print(f"champion comparison: {decision}")

    promote = diff_low > PROMOTION_MARGIN
    version = reg.register(challenger, {**metrics, **decision}, status="candidate")
    if promote:
        reg.promote(version)
        print(f"promoted challenger {version}: significantly better than champion")
        return 10
    print(f"held champion: challenger {version} not significantly better")
    return 0


if __name__ == "__main__":
    sys.exit(main())

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

from mlops.registry import Registry
from mlops.training import (
    bootstrap_qini_diff_lower,
    evaluate,
    qini_area,
    train_candidate,
    validate_metrics,
)

REGISTRY_ROOT = os.environ.get("MARGINLIFT_MODEL_REGISTRY", "/models")
TRAIN_N = int(os.environ.get("MARGINLIFT_RETRAIN_N", "60000"))
PROMOTION_MARGIN = float(os.environ.get("MARGINLIFT_PROMOTION_MARGIN", "0.0"))


def main() -> int:
    reg = Registry(REGISTRY_ROOT)
    seed = int(time.time()) % (2**31 - 1)

    challenger, holdout = train_candidate(TRAIN_N, seed)
    metrics = evaluate(challenger, holdout)
    validate_metrics(metrics)  # a challenger must at least be a real ranker
    print(f"challenger metrics: {metrics}")

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

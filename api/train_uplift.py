"""Train and validate the T-Learner uplift model, then persist the artifact.

Run offline (and at Docker build). Fails with a non-zero exit if the trained
model does not demonstrably rank uplift better than random, so a degenerate
model can never ship.

    python train_uplift.py [--n 40000] [--out models/artifacts/uplift_tlearner.joblib]
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import joblib

from models.uplift_model import UpliftSLearner, generate_training_data

DEFAULT_ARTIFACT = os.path.join(os.path.dirname(__file__), "models", "artifacts", "uplift_slearner.joblib")


def qini_area(y: np.ndarray, w: np.ndarray, pred: np.ndarray) -> float:
    """Normalised area between the model's Qini curve and the random baseline.
    Positive => the model ranks uplift better than random."""
    order = np.argsort(-pred)
    y, w = y[order], w[order]
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


def decile_uplift(y, w, pred, frac=0.3):
    order = np.argsort(-pred)
    y, w = y[order], w[order]
    k = max(1, int(len(y) * frac))
    def actual(sel_y, sel_w):
        t = sel_w == 1
        c = sel_w == 0
        rt = sel_y[t].mean() if t.sum() else 0.0
        rc = sel_y[c].mean() if c.sum() else 0.0
        return rt - rc
    top = actual(y[:k], w[:k])
    bottom = actual(y[-k:], w[-k:])
    return top, bottom


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=60_000)
    parser.add_argument("--out", default=DEFAULT_ARTIFACT)
    args = parser.parse_args()

    X, w, y, tau_true = generate_training_data(n=args.n, seed=7)

    # Hold out the last 25% for validation.
    split = int(len(X) * 0.75)
    Xtr, wtr, ytr = X[:split], w[:split], y[:split]
    Xh, wh, yh, tau_h = X[split:], w[split:], y[split:], tau_true[split:]

    model = UpliftSLearner().fit(Xtr, wtr, ytr)

    pred = model.predict_uplift(Xh)
    corr = float(np.corrcoef(pred, tau_h)[0, 1])
    q = qini_area(yh, wh, pred)
    top, bottom = decile_uplift(yh, wh, pred)

    print(f"holdout n={len(Xh)}")
    print(f"corr(pred_uplift, true_tau) = {corr:.3f}")
    print(f"qini_area (vs random)       = {q:.5f}")
    print(f"top-30% actual uplift       = {top:.4f}")
    print(f"bottom-30% actual uplift    = {bottom:.4f}")

    # Hard gates — build fails if the model is not a real uplift ranker.
    assert corr > 0.4, f"predicted uplift barely correlates with truth (corr={corr:.3f})"
    assert q > 0, f"model Qini area not above random (q={q:.5f})"
    assert top > bottom, f"top decile uplift ({top:.4f}) not above bottom ({bottom:.4f})"

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    joblib.dump(model, args.out)
    print(f"saved artifact -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

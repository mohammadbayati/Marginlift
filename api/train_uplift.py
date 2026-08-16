"""Train, validate, and persist the seed uplift model.

Runs at Docker build. Trains the initial ("seed") model the scorer uses until
the retraining loop (api/mlops/retrain.py) populates the registry with a
promoted production model. Fails the build if the model is not a real uplift
ranker.

    python train_uplift.py [--n 60000] [--out models/artifacts/uplift_slearner.joblib]
"""

from __future__ import annotations

import argparse
import os
import sys

import joblib

from mlops.training import evaluate, train_candidate, validate_metrics

DEFAULT_ARTIFACT = os.path.join(os.path.dirname(__file__), "models", "artifacts", "uplift_slearner.joblib")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=60_000)
    parser.add_argument("--out", default=DEFAULT_ARTIFACT)
    args = parser.parse_args()

    model, holdout = train_candidate(args.n, seed=7)
    metrics = evaluate(model, holdout)
    for key, value in metrics.items():
        print(f"{key:22} = {value}")
    validate_metrics(metrics)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    joblib.dump(model, args.out)
    print(f"saved seed artifact -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Build-time self-check for the registry + promotion gate.

Runs in the Docker build. Fails the build if the safety property breaks: a
challenger that is identical to the champion must NOT be promoted (no false
promotions), and the registry must round-trip a promoted model.
"""

from __future__ import annotations

import sys
import tempfile

from mlops.registry import Registry
from mlops.training import bootstrap_qini_diff_lower, evaluate, train_candidate


def main() -> int:
    root = tempfile.mkdtemp(prefix="mlops-selftest-")
    reg = Registry(root)
    assert reg.load_production() is None, "fresh registry must have no production model"

    model, holdout = train_candidate(n=8000, seed=1)
    version = reg.register(model, evaluate(model, holdout))
    reg.promote(version)
    assert reg.production_version() == version
    assert reg.load_production() is not None, "promoted model must load"

    # Safety: a model compared to itself is never 'significantly better'.
    Xh, wh, yh, _ = holdout
    diff_low = bootstrap_qini_diff_lower(yh, wh, model, Xh, model, b=200, seed=1)
    assert diff_low <= 1e-9, f"self-vs-self should not clear the margin (got {diff_low})"

    print("mlops selftest OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

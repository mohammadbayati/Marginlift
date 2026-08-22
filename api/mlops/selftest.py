"""Build-time self-check for the registry + promotion gate.

Runs in the Docker build. Fails the build if the safety property breaks: a
challenger that is identical to the champion must NOT be promoted (no false
promotions), and the registry must round-trip a promoted model.
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import uuid

from mlops.registry import Registry
from mlops.training import bootstrap_qini_diff_lower, evaluate, train_candidate


def main() -> int:
    root = _selftest_root()
    reg = Registry(root)
    try:
        assert reg.load_production() is None, "fresh registry must have no production model"

        model, holdout = train_candidate(n=8000, seed=1)
        version = reg.register(model, evaluate(model, holdout))
        reg.promote(version, reason="selftest bootstrap")
        assert reg.production_version() == version
        assert reg.load_production() is not None, "promoted model must load"
        assert reg.index()["promotion_history"][-1]["event"] == "promoted"

        second = reg.register(model, {**evaluate(model, holdout), "selftest": "rollback-target"})
        reg.promote(second, reason="selftest challenger")
        assert reg.production_version() == second
        assert reg.previous_production_version() == version
        rolled_back = reg.rollback(reason="selftest rollback")
        assert rolled_back == version
        assert reg.production_version() == version
        assert reg.previous_production_version() == second
        assert reg.index()["promotion_history"][-1]["event"] == "rolled_back"

        # Safety: a model compared to itself is never 'significantly better'.
        Xh, wh, yh, _ = holdout
        diff_low = bootstrap_qini_diff_lower(yh, wh, model, Xh, model, b=200, seed=1)
        assert diff_low <= 1e-9, f"self-vs-self should not clear the margin (got {diff_low})"
    finally:
        shutil.rmtree(root, ignore_errors=True)

    print("mlops selftest OK")
    return 0


def _selftest_root() -> str:
    parent = os.environ.get("MARGINLIFT_SELFTEST_TMPDIR")
    if not parent:
        return tempfile.mkdtemp(prefix="mlops-selftest-")
    os.makedirs(parent, exist_ok=True)
    root = os.path.join(parent, f"mlops-selftest-{uuid.uuid4().hex}")
    os.makedirs(root)
    return root


if __name__ == "__main__":
    sys.exit(main())

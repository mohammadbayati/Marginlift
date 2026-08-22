"""Rollback the production model pointer to a previously approved version."""

from __future__ import annotations

import argparse
import os
import sys

from mlops.registry import Registry


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default=None, help="Approved target version. Defaults to previous_production.")
    parser.add_argument("--reason", required=True, help="Required audit reason for rollback.")
    parser.add_argument("--actor", default="operator", help="Audit actor for rollback metadata.")
    args = parser.parse_args()

    reg = Registry(os.environ.get("MARGINLIFT_MODEL_REGISTRY", "/models"))
    target = reg.rollback(args.target, reason=args.reason, actor=args.actor)
    print(f"rolled back production model to {target}")
    return 10


if __name__ == "__main__":
    sys.exit(main())

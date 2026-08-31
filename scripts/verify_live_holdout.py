#!/usr/bin/env python3
"""Independent, standard-library verifier for a MarginLift 30-day live holdout."""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from datetime import datetime
from pathlib import Path


POLICIES = ("current_crm_policy", "marginlift_policy")
FINANCE_FIELDS = (
    "net_revenue",
    "contribution_margin",
    "incentive_cost",
    "channel_cost",
    "refund_amount",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify MarginLift live-holdout assignments and 30-day outcomes.")
    parser.add_argument("assignments", type=Path)
    parser.add_argument("outcomes", type=Path)
    parser.add_argument("--min-incremental-net-revenue", type=float, required=True)
    parser.add_argument("--max-incremental-incentive-cost", type=float, required=True)
    parser.add_argument("--max-opt-out-delta", type=float, required=True)
    parser.add_argument("--max-complaint-delta", type=float, required=True)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_datetime(value: str) -> datetime:
    text = str(value or "").strip().replace("Z", "+00:00")
    return datetime.fromisoformat(text)


def parse_bool(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "بله"}


def parse_non_negative(value: str, field: str, customer_id: str) -> float:
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field} برای {customer_id} عدد معتبر نیست") from error
    if not math.isfinite(number) or number < 0:
        raise ValueError(f"{field} برای {customer_id} باید نامنفی باشد")
    return number


def require_columns(rows: list[dict[str, str]], required: set[str], label: str) -> None:
    columns = set(rows[0]) if rows else set()
    missing = sorted(required - columns)
    if missing:
        raise ValueError(f"ستون‌های الزامی {label} موجود نیست: {', '.join(missing)}")


def verify(assignments: list[dict[str, str]], outcomes: list[dict[str, str]], thresholds: dict[str, float]) -> dict:
    require_columns(assignments, {"customer_id_hash", "assigned_policy", "assigned_at", "outcome_closes_at", "assignment_registry_hash"}, "Assignment")
    require_columns(outcomes, {"customer_id_hash", "assigned_policy", "assigned_at", "outcome_at", "repurchased", *FINANCE_FIELDS, "opt_out", "complaint", "contaminated"}, "Outcome")

    assignment_map: dict[str, dict[str, str]] = {}
    registry_hashes = set()
    for row in assignments:
        customer_id = row["customer_id_hash"].strip()
        if not customer_id or customer_id in assignment_map:
            raise ValueError("Assignment دارای شناسه خالی یا تکراری است")
        if row["assigned_policy"] not in POLICIES:
            raise ValueError(f"سیاست ناشناخته برای {customer_id}")
        assignment_map[customer_id] = row
        registry_hashes.add(row["assignment_registry_hash"].strip())
    if len(registry_hashes) != 1 or "" in registry_hashes:
        raise ValueError("Assignment Registry hash یکتا و معتبر نیست")

    outcome_map: dict[str, dict[str, str]] = {}
    normalized: list[dict] = []
    for row in outcomes:
        customer_id = row["customer_id_hash"].strip()
        if not customer_id or customer_id in outcome_map:
            raise ValueError("Outcome دارای شناسه خالی یا تکراری است")
        assignment = assignment_map.get(customer_id)
        if not assignment:
            raise ValueError(f"Outcome برای مشتری خارج از Registry ثبت شده است: {customer_id}")
        if row["assigned_policy"].strip() != assignment["assigned_policy"].strip():
            raise ValueError(f"سیاست Outcome با Registry برای {customer_id} تطابق ندارد")
        assigned_at = parse_datetime(row["assigned_at"])
        registry_assigned_at = parse_datetime(assignment["assigned_at"])
        outcome_at = parse_datetime(row["outcome_at"])
        closes_at = parse_datetime(assignment["outcome_closes_at"])
        if assigned_at != registry_assigned_at:
            raise ValueError(f"زمان تخصیص برای {customer_id} تغییر کرده است")
        if not assigned_at <= outcome_at <= closes_at:
            raise ValueError(f"Outcome برای {customer_id} خارج از پنجره ۳۰روزه است")
        values = {field: parse_non_negative(row[field], field, customer_id) for field in FINANCE_FIELDS}
        if str(row["contaminated"] or "").strip().lower() not in {"0", "false", "no", "خیر"}:
            raise ValueError(f"نبود آلودگی کمپین برای {customer_id} تأیید نشده است")
        normalized.append({
            "customer_id_hash": customer_id,
            "assigned_policy": row["assigned_policy"].strip(),
            "repurchased": parse_bool(row["repurchased"]),
            "opt_out": parse_bool(row["opt_out"]),
            "complaint": parse_bool(row["complaint"]),
            **values,
            "contribution_profit": values["contribution_margin"] - values["incentive_cost"] - values["channel_cost"] - values["refund_amount"],
        })
        outcome_map[customer_id] = row

    missing = sorted(set(assignment_map) - set(outcome_map))
    if missing:
        raise ValueError(f"Outcome برای {len(missing)} تخصیص ثبت نشده است")

    arms = {policy: summarize([row for row in normalized if row["assigned_policy"] == policy]) for policy in POLICIES}
    if any(arms[policy]["assigned_customers"] < 2 for policy in POLICIES):
        raise ValueError("برای هر سیاست حداقل دو Outcome لازم است")

    current = arms["current_crm_policy"]
    marginlift = arms["marginlift_policy"]
    estimate = marginlift["mean_contribution_profit"] - current["mean_contribution_profit"]
    standard_error = math.sqrt(
        marginlift["variance_contribution_profit"] / marginlift["assigned_customers"]
        + current["variance_contribution_profit"] / current["assigned_customers"]
    )
    confidence_interval = [estimate - 1.96 * standard_error, estimate + 1.96 * standard_error]
    guardrails = [
        guardrail("incremental_net_revenue", marginlift["mean_net_revenue"] - current["mean_net_revenue"], thresholds["min_incremental_net_revenue"], "minimum"),
        guardrail("incremental_incentive_cost", marginlift["mean_incentive_cost"] - current["mean_incentive_cost"], thresholds["max_incremental_incentive_cost"], "maximum"),
        guardrail("opt_out_delta", marginlift["opt_out_rate"] - current["opt_out_rate"], thresholds["max_opt_out_delta"], "maximum"),
        guardrail("complaint_delta", marginlift["complaint_rate"] - current["complaint_rate"], thresholds["max_complaint_delta"], "maximum"),
    ]
    guardrails_passed = all(item["passed"] for item in guardrails)
    if estimate < 0 or not guardrails_passed:
        decision = "stop"
    elif confidence_interval[0] > 0:
        decision = "scale_candidate_pending_finance"
    else:
        decision = "review"

    finance_expected = {field: round(sum(row[field] for row in normalized), 2) for field in FINANCE_FIELDS}
    return {
        "status": "pass",
        "evidence_level": "pilot_estimate",
        "assignment_registry_hash": next(iter(registry_hashes)),
        "coverage": 1.0,
        "arms": arms,
        "incremental_contribution_profit_per_assigned_customer": round(estimate, 2),
        "confidence_interval_95": [round(value, 2) for value in confidence_interval],
        "guardrails": {"passed": guardrails_passed, "checks": guardrails},
        "finance_reconciliation_expected": finance_expected,
        "decision": decision,
        "claim_boundary_fa": "این خروجی تا تطبیق مستقل Finance، اثر افزایشی تأییدشده محسوب نمی‌شود.",
    }


def summarize(rows: list[dict]) -> dict:
    profits = [row["contribution_profit"] for row in rows]
    count = len(rows)
    return {
        "assigned_customers": count,
        "mean_contribution_profit": round(statistics.fmean(profits), 2) if profits else 0,
        "mean_net_revenue": round(statistics.fmean(row["net_revenue"] for row in rows), 2) if rows else 0,
        "mean_incentive_cost": round(statistics.fmean(row["incentive_cost"] for row in rows), 2) if rows else 0,
        "repurchase_rate": round(sum(row["repurchased"] for row in rows) / count, 4) if count else 0,
        "opt_out_rate": round(sum(row["opt_out"] for row in rows) / count, 4) if count else 0,
        "complaint_rate": round(sum(row["complaint"] for row in rows) / count, 4) if count else 0,
        "variance_contribution_profit": statistics.variance(profits) if len(profits) > 1 else 0,
    }


def guardrail(key: str, observed: float, threshold: float, direction: str) -> dict:
    passed = observed >= threshold if direction == "minimum" else observed <= threshold
    return {"key": key, "observed": round(observed, 4), "threshold": threshold, "direction": direction, "passed": passed}


def main() -> int:
    args = parse_args()
    thresholds = {
        "min_incremental_net_revenue": args.min_incremental_net_revenue,
        "max_incremental_incentive_cost": args.max_incremental_incentive_cost,
        "max_opt_out_delta": args.max_opt_out_delta,
        "max_complaint_delta": args.max_complaint_delta,
    }
    try:
        result = verify(read_csv(args.assignments), read_csv(args.outcomes), thresholds)
    except (OSError, ValueError) as error:
        result = {"status": "rejected", "error_fa": str(error)}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2) if args.json else human_summary(result))
    return 0


def human_summary(result: dict) -> str:
    low, high = result["confidence_interval_95"]
    return "\n".join([
        "MarginLift Live Holdout Verifier",
        f"Status: {result['status']}",
        f"Incremental contribution profit/customer: {result['incremental_contribution_profit_per_assigned_customer']}",
        f"95% CI: {low} .. {high}",
        f"Guardrails: {'PASS' if result['guardrails']['passed'] else 'FAIL'}",
        f"Decision: {result['decision']}",
        result["claim_boundary_fa"],
    ])


if __name__ == "__main__":
    raise SystemExit(main())

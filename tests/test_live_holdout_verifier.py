import unittest

from scripts.verify_live_holdout import verify


class LiveHoldoutVerifierTest(unittest.TestCase):
    def setUp(self):
        self.assignments = []
        self.outcomes = []
        for index in range(4):
            policy = "current_crm_policy" if index % 2 == 0 else "marginlift_policy"
            customer_id = f"hash_{index}"
            self.assignments.append({
                "customer_id_hash": customer_id,
                "assigned_policy": policy,
                "assigned_at": "2026-01-01T00:00:00Z",
                "outcome_closes_at": "2026-01-31T00:00:00Z",
                "assignment_registry_hash": "sha256:test",
            })
            self.outcomes.append({
                "customer_id_hash": customer_id,
                "assigned_policy": policy,
                "assigned_at": "2026-01-01T00:00:00Z",
                "outcome_at": "2026-01-31T00:00:00Z",
                "repurchased": "true",
                "net_revenue": "200" if policy == "marginlift_policy" else "100",
                "contribution_margin": "150" if policy == "marginlift_policy" else "100",
                "incentive_cost": "0",
                "channel_cost": "0",
                "refund_amount": "0",
                "opt_out": "false",
                "complaint": "false",
                "contaminated": "false",
            })
        self.thresholds = {
            "min_incremental_net_revenue": 0,
            "max_incremental_incentive_cost": 2000,
            "max_opt_out_delta": 0.005,
            "max_complaint_delta": 0.002,
        }

    def test_positive_holdout_is_scale_candidate_pending_finance(self):
        result = verify(self.assignments, self.outcomes, self.thresholds)
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["decision"], "scale_candidate_pending_finance")
        self.assertEqual(result["incremental_contribution_profit_per_assigned_customer"], 50)
        self.assertTrue(result["guardrails"]["passed"])

    def test_outcome_after_close_is_rejected(self):
        self.outcomes[0]["outcome_at"] = "2026-01-31T00:00:01Z"
        with self.assertRaisesRegex(ValueError, "خارج از پنجره"):
            verify(self.assignments, self.outcomes, self.thresholds)


if __name__ == "__main__":
    unittest.main()

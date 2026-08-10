import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ml.discrete_time_survival import train_discrete_time_survival


class DiscreteTimeSurvivalTest(unittest.TestCase):
    def test_temporal_training_and_evaluation(self):
        dataset = synthetic_dataset(750)
        output_dir = Path.cwd() / "data" / "model-test-artifacts"
        output_dir.mkdir(parents=True, exist_ok=True)
        report = train_discrete_time_survival(dataset, output_dir=output_dir, minimum_episodes=200)
        self.assertEqual(report["status"], "trained")
        self.assertEqual(report["split"]["train"]["episodes"], 450)
        self.assertEqual(report["split"]["development"]["episodes"], 150)
        self.assertEqual(report["split"]["test"]["episodes"], 150)
        self.assertEqual(report["gateStatus"], "baseline_wins")
        primary = next(
            item for item in report["evaluation"]["test"]["horizons"]
            if item["horizonDays"] == 90
        )
        self.assertTrue(primary["evaluable"])
        self.assertIsNotNone(primary["modelBrier"])
        self.assertIsNotNone(primary["baselineBrier"])
        self.assertGreaterEqual(primary["modelBrier"], primary["baselineBrier"])
        self.assertTrue((output_dir / "model-card.json").exists())
        self.assertTrue((output_dir / "discrete-time-survival.joblib").exists())
        self.assertEqual(len(report["artifact"]["sha256"]), 64)
        self.assertTrue(report["artifact"]["trustedLoadOnly"])

    def test_small_dataset_is_not_trained(self):
        report = train_discrete_time_survival(synthetic_dataset(20), minimum_episodes=200)
        self.assertEqual(report["status"], "insufficient_sample")
        self.assertEqual(report["gateStatus"], "needs_real_data")


def synthetic_dataset(count):
    origin = datetime(2024, 1, 1, tzinfo=timezone.utc)
    episodes = []
    for index in range(count):
        weekly = index % 2 == 0
        censored = index % 10 in {0, 1}
        delayed = index % 5 == 0
        if censored:
            duration = 180
            observed = False
        elif weekly:
            duration = 8 + index % 5
            observed = True
        elif delayed:
            duration = 65 + index % 10
            observed = True
        else:
            duration = 28 + index % 12
            observed = True
        started = origin + timedelta(days=index)
        episodes.append({
            "startedAt": started.isoformat().replace("+00:00", "Z"),
            "durationDays": duration,
            "eventObserved": observed,
            "operator": "operator_a" if index % 3 else "operator_b",
            "packageType": "weekly" if weekly else "monthly",
            "features": {
                "purchaseCountToDate": 1 + index % 8,
                "previousGapDays": None if index % 7 == 0 else (8 if weekly else 31),
                "averageGapDaysToDate": 8 if weekly else 32,
                "gapStdDevDaysToDate": 2 if weekly else 6,
                "expectedCycleDays": 7 if weekly else 30,
                "originValidityDays": 7 if weekly else 30,
                "originPaidAmount": 220000 if weekly else 520000,
                "originContributionMargin": 11000 if weekly else 26000,
                "originDiscountAmount": 10000 if index % 4 == 0 else 0,
                "originCashbackAmount": 0,
                "discountUsed": 1 if index % 4 == 0 else 0,
            },
        })
    return {
        "datasetVersion": "synthetic_model_test_v1",
        "reconciliation": {"reconciled": True},
        "episodes": episodes,
    }


if __name__ == "__main__":
    unittest.main()

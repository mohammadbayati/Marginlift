import os
import shutil
import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api")))

from mlops.registry import Registry  # noqa: E402


class ModelRegistryRollbackTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(os.getcwd()) / f"marginlift-registry-test-{uuid.uuid4().hex}"
        self.root.mkdir()
        self.registry = Registry(str(self.root))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_promote_promote_rollback_and_verify_active_pointer(self):
        version_a = self.registry.register({"model": "A"}, {"qini": 0.11})
        self.registry.promote(version_a, reason="approve model A", actor="test")
        self.assertEqual(self.registry.production_version(), version_a)
        self.assertIsNone(self.registry.previous_production_version())

        version_b = self.registry.register({"model": "B"}, {"qini": 0.17})
        self.registry.promote(version_b, reason="approve model B", actor="test")
        self.assertEqual(self.registry.production_version(), version_b)
        self.assertEqual(self.registry.previous_production_version(), version_a)

        rolled_back = self.registry.rollback(reason="B degraded during canary", actor="test")
        self.assertEqual(rolled_back, version_a)
        self.assertEqual(self.registry.production_version(), version_a)
        self.assertEqual(self.registry.previous_production_version(), version_b)
        self.assertEqual(self.registry.load_production(), {"model": "A"})

        index = self.registry.index()
        self.assertEqual([event["event"] for event in index["promotion_history"]], [
            "promoted",
            "promoted",
            "rolled_back",
        ])
        self.assertEqual(index["promotion_history"][-1]["reason"], "B degraded during canary")
        self.assertEqual(index["promotion_history"][-1]["metadata"]["requested_target"], None)

        rolled_forward = self.registry.rollback(reason="restore B after verification", actor="test")
        self.assertEqual(rolled_forward, version_b)
        self.assertEqual(self.registry.production_version(), version_b)
        self.assertEqual(self.registry.previous_production_version(), version_a)
        self.assertEqual(self.registry.load_production(), {"model": "B"})

        self.assertTrue((self.root / "versions" / version_a / "model.joblib").exists())
        self.assertTrue((self.root / "versions" / version_b / "model.joblib").exists())

    def test_rollback_requires_reason(self):
        version_a = self.registry.register({"model": "A"}, {"qini": 0.11})
        self.registry.promote(version_a, reason="approve model A")
        version_b = self.registry.register({"model": "B"}, {"qini": 0.17})
        self.registry.promote(version_b, reason="approve model B")
        with self.assertRaisesRegex(ValueError, "rollback reason is required"):
            self.registry.rollback()

    def test_rollback_validates_target_artifact_checksum_before_pointer_change(self):
        version_a = self.registry.register({"model": "A"}, {"qini": 0.11})
        self.registry.promote(version_a, reason="approve model A")
        version_b = self.registry.register({"model": "B"}, {"qini": 0.17})
        self.registry.promote(version_b, reason="approve model B")

        artifact = self.root / "versions" / version_a / "model.joblib"
        artifact.write_bytes(b"corrupted")

        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            self.registry.rollback(reason="attempt corrupted rollback")

        self.assertEqual(self.registry.production_version(), version_b)
        self.assertEqual(self.registry.previous_production_version(), version_a)

    def test_promotion_history_retention_is_bounded(self):
        old_limit = os.environ.get("MARGINLIFT_PROMOTION_HISTORY_LIMIT")
        os.environ["MARGINLIFT_PROMOTION_HISTORY_LIMIT"] = "10"
        try:
            registry = Registry(str(self.root))
            versions = []
            for index in range(12):
                version = registry.register({"model": index}, {"qini": index})
                versions.append(version)
                registry.promote(version, reason=f"approve {index}")

            snapshot = registry.index()
            self.assertEqual(len(snapshot["promotion_history"]), 10)
            self.assertEqual(snapshot["promotion_history_retention"]["max_entries"], 10)
            self.assertEqual(snapshot["promotion_history_retention"]["dropped_count"], 2)
            self.assertEqual(snapshot["production"], snapshot["promotion_history"][-1]["to_version"])
            rolled_back = registry.rollback(versions[0], reason="restore retained archived model")
            self.assertEqual(rolled_back, versions[0])
            self.assertEqual(registry.production_version(), versions[0])
        finally:
            if old_limit is None:
                os.environ.pop("MARGINLIFT_PROMOTION_HISTORY_LIMIT", None)
            else:
                os.environ["MARGINLIFT_PROMOTION_HISTORY_LIMIT"] = old_limit


if __name__ == "__main__":
    unittest.main()

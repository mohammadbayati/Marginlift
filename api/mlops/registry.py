"""Versioned uplift-model registry.

Persists trained models and their metrics on disk (a docker volume in
production) with a single `production` pointer that the scorer loads. The
retraining loop adds candidate versions and promotes the production pointer;
older production models are archived, never deleted.

Layout under `root`:
    registry.json                      # index + production pointer
    versions/<version>/model.joblib
    versions/<version>/metrics.json
"""

from __future__ import annotations

import json
import os
import hashlib
import uuid
from datetime import datetime, timezone

import joblib

# Ensure the model class is importable so joblib can unpickle artifacts.
from models.uplift_model import UpliftSLearner  # noqa: F401


class Registry:
    def __init__(self, root: str) -> None:
        self.root = root
        self.versions_dir = os.path.join(root, "versions")
        self.index_path = os.path.join(root, "registry.json")
        self.history_limit = _history_limit()

    def _read_index(self) -> dict:
        if not os.path.exists(self.index_path):
            return self._normalize_index({})
        with open(self.index_path, "r", encoding="utf-8") as f:
            return self._normalize_index(json.load(f))

    def _normalize_index(self, index: dict) -> dict:
        index.setdefault("versions", [])
        index.setdefault("production", None)
        index.setdefault("previous_production", None)
        index.setdefault("promotion_history", [])
        index["promotion_history_retention"] = {
            **index.get("promotion_history_retention", {}),
            "max_entries": self.history_limit,
            "policy": "retain_latest_events",
        }
        if len(index["promotion_history"]) > self.history_limit:
            dropped = len(index["promotion_history"]) - self.history_limit
            index["promotion_history"] = index["promotion_history"][dropped:]
            policy = index["promotion_history_retention"]
            policy["dropped_count"] = int(policy.get("dropped_count", 0)) + dropped
            policy["dropped_before"] = (
                index["promotion_history"][0]["created_at"]
                if index["promotion_history"]
                else _now()
            )
        return index

    def _write_index(self, index: dict) -> None:
        index = self._normalize_index(index)
        os.makedirs(self.root, exist_ok=True)
        tmp = self.index_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.index_path)  # atomic

    def register(self, model, metrics: dict, status: str = "candidate") -> str:
        version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:6]
        vdir = os.path.join(self.versions_dir, version)
        os.makedirs(vdir, exist_ok=True)
        model_path = os.path.join(vdir, "model.joblib")
        metrics_path = os.path.join(vdir, "metrics.json")
        joblib.dump(model, model_path)
        with open(metrics_path, "w", encoding="utf-8") as f:
            json.dump(metrics, f, ensure_ascii=False, indent=2)
        index = self._read_index()
        index["versions"].append({
            "version": version,
            "status": status,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "metrics": metrics,
            "artifact": {
                "model_path": "model.joblib",
                "model_sha256": _sha256_file(model_path),
                "metrics_path": "metrics.json",
                "metrics_sha256": _sha256_file(metrics_path),
            },
        })
        self._write_index(index)
        return version

    def promote(self, version: str, reason: str = "promotion", actor: str = "system", metadata: dict | None = None) -> None:
        index = self._read_index()
        self._validate_version_artifact(index, version)
        from_version = index.get("production")
        for entry in index["versions"]:
            if entry["version"] == version:
                entry["status"] = "production"
            elif entry.get("status") == "production":
                entry["status"] = "archived"
        if from_version != version:
            index["previous_production"] = from_version
        index["production"] = version
        self._append_history(index, {
            "event": "promoted",
            "from_version": from_version,
            "to_version": version,
            "previous_production": index.get("previous_production"),
            "actor": actor,
            "reason": str(reason or "promotion"),
            "metadata": metadata or {},
            "created_at": _now(),
        })
        self._write_index(index)

    def rollback(self, target_version: str | None = None, *, reason: str | None = None, actor: str = "system", metadata: dict | None = None) -> str:
        if not reason or not str(reason).strip():
            raise ValueError("rollback reason is required")

        index = self._read_index()
        current = index.get("production")
        target = target_version or index.get("previous_production")
        if not target:
            raise ValueError("no previous production model is available for rollback")
        if not self._is_approved_version(index, target):
            raise ValueError(f"target version has not been approved for production: {target}")

        self._validate_version_artifact(index, target)
        if current and current != target:
            self._validate_version_artifact(index, current)

        previous_before = index.get("previous_production")
        for entry in index["versions"]:
            if entry["version"] == target:
                entry["status"] = "production"
            elif entry.get("status") == "production":
                entry["status"] = "archived"
        index["production"] = target
        index["previous_production"] = current
        self._append_history(index, {
            "event": "rolled_back",
            "from_version": current,
            "to_version": target,
            "previous_production": current,
            "actor": actor,
            "reason": str(reason).strip(),
            "metadata": {
                **(metadata or {}),
                "requested_target": target_version,
                "previous_production_before_rollback": previous_before,
            },
            "created_at": _now(),
        })
        self._write_index(index)
        return target

    def production_version(self):
        return self._read_index().get("production")

    def previous_production_version(self):
        return self._read_index().get("previous_production")

    def load_production(self):
        version = self.production_version()
        if not version:
            return None
        path = os.path.join(self.versions_dir, version, "model.joblib")
        return joblib.load(path) if os.path.exists(path) else None

    def index(self) -> dict:
        return self._read_index()

    def _append_history(self, index: dict, event: dict) -> None:
        history = index.setdefault("promotion_history", [])
        history.append(event)
        if len(history) <= self.history_limit:
            index["promotion_history_retention"] = {
                **index.get("promotion_history_retention", {}),
                "max_entries": self.history_limit,
                "policy": "retain_latest_events",
            }
            return
        dropped = len(history) - self.history_limit
        del history[:dropped]
        policy = index.setdefault("promotion_history_retention", {})
        policy["max_entries"] = self.history_limit
        policy["policy"] = "retain_latest_events"
        policy["dropped_count"] = int(policy.get("dropped_count", 0)) + dropped
        policy["dropped_before"] = history[0]["created_at"] if history else event["created_at"]

    def _find_version(self, index: dict, version: str) -> dict:
        for entry in index["versions"]:
            if entry["version"] == version:
                return entry
        raise ValueError(f"unknown version: {version}")

    def _validate_version_artifact(self, index: dict, version: str) -> None:
        entry = self._find_version(index, version)
        artifact = entry.get("artifact") or {}
        model_path = os.path.join(self.versions_dir, version, artifact.get("model_path", "model.joblib"))
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"model artifact is missing for version {version}")
        expected = artifact.get("model_sha256")
        if not expected:
            raise ValueError(f"model artifact checksum is missing for version {version}")
        actual = _sha256_file(model_path)
        if actual != expected:
            raise ValueError(f"model artifact checksum mismatch for version {version}")

    def _is_approved_version(self, index: dict, version: str) -> bool:
        if version in {index.get("production"), index.get("previous_production")}:
            return True
        try:
            entry = self._find_version(index, version)
            if entry.get("status") in {"production", "archived"}:
                return True
        except ValueError:
            return False
        return any(
            event.get("to_version") == version
            and event.get("event") in {"promoted", "rolled_back"}
            for event in index.get("promotion_history", [])
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _history_limit() -> int:
    try:
        return max(10, int(os.environ.get("MARGINLIFT_PROMOTION_HISTORY_LIMIT", "100")))
    except ValueError:
        return 100


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

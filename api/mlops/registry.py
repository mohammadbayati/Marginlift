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

    def _read_index(self) -> dict:
        if not os.path.exists(self.index_path):
            return {"versions": [], "production": None}
        with open(self.index_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_index(self, index: dict) -> None:
        os.makedirs(self.root, exist_ok=True)
        tmp = self.index_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.index_path)  # atomic

    def register(self, model, metrics: dict, status: str = "candidate") -> str:
        version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:6]
        vdir = os.path.join(self.versions_dir, version)
        os.makedirs(vdir, exist_ok=True)
        joblib.dump(model, os.path.join(vdir, "model.joblib"))
        with open(os.path.join(vdir, "metrics.json"), "w", encoding="utf-8") as f:
            json.dump(metrics, f, ensure_ascii=False, indent=2)
        index = self._read_index()
        index["versions"].append({
            "version": version,
            "status": status,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "metrics": metrics,
        })
        self._write_index(index)
        return version

    def promote(self, version: str) -> None:
        index = self._read_index()
        found = False
        for entry in index["versions"]:
            if entry["version"] == version:
                entry["status"] = "production"
                found = True
            elif entry["status"] == "production":
                entry["status"] = "archived"
        if not found:
            raise ValueError(f"unknown version: {version}")
        index["production"] = version
        self._write_index(index)

    def production_version(self):
        return self._read_index().get("production")

    def load_production(self):
        version = self.production_version()
        if not version:
            return None
        path = os.path.join(self.versions_dir, version, "model.joblib")
        return joblib.load(path) if os.path.exists(path) else None

    def index(self) -> dict:
        return self._read_index()

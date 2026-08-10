import hashlib
import json
import math
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


HORIZONS = (30, 90, 180)
INTERVAL_DAYS = 7
MAX_HORIZON_DAYS = 180
NUMERIC_FEATURES = [
    "purchase_count_to_date",
    "previous_gap_days",
    "average_gap_days_to_date",
    "gap_std_dev_days_to_date",
    "expected_cycle_days",
    "origin_validity_days",
    "origin_paid_amount",
    "origin_contribution_margin",
    "origin_discount_amount",
    "origin_cashback_amount",
    "discount_used",
]
CATEGORICAL_FEATURES = ["operator", "package_type", "interval_bucket"]


def train_discrete_time_survival(dataset, output_dir=None, minimum_episodes=200):
    validate_dataset(dataset)
    episodes = sorted(dataset["episodes"], key=lambda item: item["startedAt"])
    split = temporal_split(episodes)
    report = base_report(dataset, split, minimum_episodes)

    if len(episodes) < minimum_episodes:
        report["status"] = "insufficient_sample"
        report["gateStatus"] = "needs_real_data"
        report["nextActionFa"] = (
            f"حداقل اولیه {minimum_episodes} episode لازم است؛ "
            f"فقط {len(episodes)} episode موجود است."
        )
        write_report(report, output_dir)
        return report

    train_rows = build_person_period_rows(split["train"])
    if not train_rows or len({row["event"] for row in train_rows}) < 2:
        report["status"] = "not_trainable"
        report["gateStatus"] = "needs_data_fix"
        report["nextActionFa"] = "داده train برای hazard model هر دو کلاس event و non-event را ندارد."
        write_report(report, output_dir)
        return report

    model = build_pipeline()
    train_frame = pd.DataFrame(train_rows)
    model.fit(train_frame[NUMERIC_FEATURES + CATEGORICAL_FEATURES], train_frame["event"])

    train_baseline = kaplan_meier_baseline(split["train"], HORIZONS)
    report["evaluation"] = {
        "development": evaluate_split(model, split["development"], train_baseline),
        "test": evaluate_split(model, split["test"], train_baseline),
    }
    report["status"] = "trained"
    report["model"] = {
        "family": "discrete_time_logistic_hazard",
        "intervalDays": INTERVAL_DAYS,
        "maximumHorizonDays": MAX_HORIZON_DAYS,
        "numericFeatures": NUMERIC_FEATURES,
        "categoricalFeatures": CATEGORICAL_FEATURES,
        "classWeight": None,
        "randomState": 42,
        "topCoefficients": top_coefficients(model),
    }
    report["gateStatus"] = model_gate(report["evaluation"])
    report["nextActionFa"] = next_action(report["gateStatus"])
    report["modelVersion"] = stable_hash({
        "datasetVersion": dataset["datasetVersion"],
        "split": report["split"],
        "model": report["model"],
        "evaluation": report["evaluation"],
    })

    if output_dir:
        destination = Path(output_dir)
        destination.mkdir(parents=True, exist_ok=True)
        artifact_path = destination / "discrete-time-survival.joblib"
        joblib.dump(model, artifact_path)
        report["artifact"] = {
            "filename": artifact_path.name,
            "sha256": file_sha256(artifact_path),
            "trustedLoadOnly": True,
            "warningFa": "فایل joblib فقط از artifact store داخلی و پس از تطبیق checksum بارگذاری شود.",
        }
        write_report(report, destination)
    return report


def build_pipeline():
    numeric = Pipeline([
        ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
        ("scale", StandardScaler()),
    ])
    categorical = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    preprocessor = ColumnTransformer([
        ("numeric", numeric, NUMERIC_FEATURES),
        ("categorical", categorical, CATEGORICAL_FEATURES),
    ])
    return Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", LogisticRegression(max_iter=2000, random_state=42)),
    ])


def build_person_period_rows(episodes):
    rows = []
    maximum_intervals = math.ceil(MAX_HORIZON_DAYS / INTERVAL_DAYS)
    for episode in episodes:
        duration = float(episode["durationDays"])
        if episode["eventObserved"]:
            interval_count = max(1, math.ceil(duration / INTERVAL_DAYS))
            interval_count = min(interval_count, maximum_intervals)
        else:
            interval_count = min(math.floor(duration / INTERVAL_DAYS), maximum_intervals)

        for interval_index in range(1, interval_count + 1):
            event = int(
                episode["eventObserved"]
                and duration <= interval_index * INTERVAL_DAYS
                and duration <= MAX_HORIZON_DAYS
            )
            rows.append(feature_row(episode, interval_index, event))
            if event:
                break
    return rows


def evaluate_split(model, episodes, baseline):
    horizon_metrics = []
    for horizon in HORIZONS:
        known = known_outcomes(episodes, horizon)
        if not known:
            horizon_metrics.append(insufficient_horizon(horizon, 0, "no_known_outcomes"))
            continue
        selected_episodes = [item["episode"] for item in known]
        observed = np.asarray([item["no_repurchase"] for item in known], dtype=int)
        predicted = predict_no_repurchase(model, selected_episodes, horizon)
        baseline_probability = baseline[str(horizon)]["noRepurchaseProbability"]
        baseline_predictions = np.full(len(observed), baseline_probability)
        class_count = len(np.unique(observed))
        evaluable = len(observed) >= 100 and class_count == 2
        prevalence = float(np.mean(observed))
        horizon_metrics.append({
            "horizonDays": horizon,
            "knownOutcomeCount": int(len(observed)),
            "noRepurchasePrevalence": round_number(prevalence),
            "modelBrier": round_number(brier_score_loss(observed, predicted)),
            "baselineBrier": round_number(brier_score_loss(observed, baseline_predictions)),
            "timeDependentAuc": round_number(roc_auc_score(observed, predicted)) if class_count == 2 else None,
            "calibrationError": round_number(expected_calibration_error(observed, predicted)),
            "top20Lift": round_number(top_fraction_lift(observed, predicted, 0.2)),
            "evaluable": evaluable,
            "warning": None if evaluable else "حداقل ۱۰۰ outcome بسته‌شده و هر دو کلاس برای گیت لازم است.",
        })
    return {"episodeCount": len(episodes), "horizons": horizon_metrics}


def predict_no_repurchase(model, episodes, horizon):
    interval_count = max(1, math.ceil(horizon / INTERVAL_DAYS))
    rows = []
    owners = []
    for episode_index, episode in enumerate(episodes):
        for interval_index in range(1, interval_count + 1):
            rows.append(feature_row(episode, interval_index, 0))
            owners.append(episode_index)
    frame = pd.DataFrame(rows)
    hazards = model.predict_proba(frame[NUMERIC_FEATURES + CATEGORICAL_FEATURES])[:, 1]
    survival = np.ones(len(episodes), dtype=float)
    for owner, hazard in zip(owners, hazards):
        survival[owner] *= 1 - min(max(float(hazard), 0.0), 1.0)
    return np.clip(survival, 0.0, 1.0)


def known_outcomes(episodes, horizon):
    known = []
    for episode in episodes:
        duration = float(episode["durationDays"])
        if episode["eventObserved"] and duration <= horizon:
            known.append({"episode": episode, "no_repurchase": 0})
        elif duration >= horizon:
            known.append({"episode": episode, "no_repurchase": 1})
    return known


def feature_row(episode, interval_index, event):
    features = episode.get("features") or {}
    return {
        "purchase_count_to_date": features.get("purchaseCountToDate"),
        "previous_gap_days": features.get("previousGapDays"),
        "average_gap_days_to_date": features.get("averageGapDaysToDate"),
        "gap_std_dev_days_to_date": features.get("gapStdDevDaysToDate"),
        "expected_cycle_days": features.get("expectedCycleDays"),
        "origin_validity_days": features.get("originValidityDays"),
        "origin_paid_amount": features.get("originPaidAmount"),
        "origin_contribution_margin": features.get("originContributionMargin"),
        "origin_discount_amount": features.get("originDiscountAmount"),
        "origin_cashback_amount": features.get("originCashbackAmount"),
        "discount_used": features.get("discountUsed"),
        "operator": str(episode.get("operator") or "unknown"),
        "package_type": str(episode.get("packageType") or "unknown"),
        "interval_bucket": f"week_{interval_index:02d}",
        "event": event,
    }


def temporal_split(episodes):
    total = len(episodes)
    train_end = max(1, int(total * 0.6))
    development_end = max(train_end + 1, int(total * 0.8)) if total >= 3 else train_end
    development_end = min(development_end, total)
    return {
        "train": episodes[:train_end],
        "development": episodes[train_end:development_end],
        "test": episodes[development_end:],
    }


def kaplan_meier_baseline(episodes, horizons):
    result = {}
    for horizon in horizons:
        at_risk = len(episodes)
        survival = 1.0
        by_time = {}
        for episode in episodes:
            duration = float(episode["durationDays"])
            counts = by_time.setdefault(duration, {"events": 0, "censored": 0})
            counts["events" if episode["eventObserved"] else "censored"] += 1
        for duration in sorted(by_time):
            if duration > horizon:
                break
            counts = by_time[duration]
            if counts["events"] and at_risk:
                survival *= 1 - counts["events"] / at_risk
            at_risk -= counts["events"] + counts["censored"]
        result[str(horizon)] = {"noRepurchaseProbability": float(np.clip(survival, 0.0, 1.0))}
    return result


def expected_calibration_error(observed, predicted, bins=10):
    edges = np.linspace(0.0, 1.0, bins + 1)
    assignments = np.digitize(predicted, edges[1:-1], right=True)
    error = 0.0
    for bucket in range(bins):
        mask = assignments == bucket
        if not np.any(mask):
            continue
        error += np.mean(mask) * abs(float(np.mean(observed[mask])) - float(np.mean(predicted[mask])))
    return float(error)


def top_fraction_lift(observed, predicted, fraction):
    prevalence = float(np.mean(observed))
    if prevalence <= 0:
        return None
    count = max(1, math.ceil(len(observed) * fraction))
    order = np.argsort(-predicted)
    return float(np.mean(observed[order[:count]]) / prevalence)


def model_gate(evaluation):
    test_metrics = {item["horizonDays"]: item for item in evaluation["test"]["horizons"]}
    primary = test_metrics.get(90)
    if not primary or not primary["evaluable"]:
        return "needs_real_data"
    if primary["modelBrier"] >= primary["baselineBrier"]:
        return "baseline_wins"
    if primary["calibrationError"] > 0.1:
        return "needs_calibration"
    if primary["top20Lift"] is None or primary["top20Lift"] < 1.2:
        return "insufficient_lift"
    return "candidate_passed_offline_gate"


def top_coefficients(model, limit=15):
    preprocessor = model.named_steps["preprocessor"]
    classifier = model.named_steps["classifier"]
    names = preprocessor.get_feature_names_out()
    coefficients = classifier.coef_[0]
    ranked = sorted(zip(names, coefficients), key=lambda pair: abs(pair[1]), reverse=True)[:limit]
    return [
        {"feature": str(name), "coefficient": round_number(value)}
        for name, value in ranked
    ]


def base_report(dataset, split, minimum_episodes):
    return {
        "status": "pending",
        "gateStatus": "not_evaluated",
        "datasetVersion": dataset["datasetVersion"],
        "evidenceLevel": "offline_model_candidate",
        "minimumEpisodes": minimum_episodes,
        "split": {
            name: split_metadata(values)
            for name, values in split.items()
        },
        "testPolicy": {
            "temporalSplit": True,
            "testSetSealed": True,
            "hyperparameterSearchOnTest": False,
            "primaryOfflineHorizonDays": 90,
        },
        "claimBoundaryFa": "این مدل فقط candidate آفلاین است و مجوز مداخله یا ادعای کاهش ریزش نیست.",
    }


def split_metadata(episodes):
    if not episodes:
        return {"episodes": 0, "startedAtMin": None, "startedAtMax": None}
    dates = [item["startedAt"] for item in episodes]
    return {"episodes": len(episodes), "startedAtMin": min(dates), "startedAtMax": max(dates)}


def insufficient_horizon(horizon, count, reason):
    return {
        "horizonDays": horizon,
        "knownOutcomeCount": count,
        "evaluable": False,
        "warning": reason,
        "modelBrier": None,
        "baselineBrier": None,
        "timeDependentAuc": None,
        "calibrationError": None,
        "top20Lift": None,
    }


def validate_dataset(dataset):
    if not dataset.get("datasetVersion"):
        raise ValueError("datasetVersion لازم است.")
    if not dataset.get("episodes"):
        raise ValueError("dataset باید episode داشته باشد.")
    if dataset.get("reconciliation", {}).get("reconciled") is False:
        raise ValueError("dataset reconciliation پاس نشده است.")
    for episode in dataset["episodes"]:
        if not episode.get("startedAt") or not isinstance(episode.get("eventObserved"), bool):
            raise ValueError("episode فاقد startedAt یا eventObserved معتبر است.")
        if not episode.get("features"):
            raise ValueError("episode باید featureهای point-in-time داشته باشد.")


def next_action(gate_status):
    messages = {
        "needs_real_data": "داده واقعی و outcome بسته‌شده بیشتری برای ارزیابی لازم است.",
        "baseline_wins": "مدل پیچیده رد شود و Kaplan–Meier baseline حفظ شود.",
        "needs_calibration": "مدل پیش از استفاده باید روی development set کالیبره و دوباره ارزیابی شود.",
        "insufficient_lift": "رتبه‌بندی ارزش عملی کافی ندارد؛ feature و تعریف cohort بازبینی شود.",
        "candidate_passed_offline_gate": "فقط Shadow Mode مجاز است؛ live action هنوز ممنوع است.",
    }
    return messages.get(gate_status, "نتیجه باید بازبینی شود.")


def write_report(report, output_dir):
    if not output_dir:
        return
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "model-card.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def stable_hash(value):
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def round_number(value, decimals=6):
    if value is None:
        return None
    return round(float(value), decimals)

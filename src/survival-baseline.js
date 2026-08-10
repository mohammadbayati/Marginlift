const crypto = require("crypto");

const DEFAULT_HORIZONS = Object.freeze([30, 90, 180]);

function buildSurvivalBaseline(dataset, options = {}) {
  validateDataset(dataset);
  const horizons = normalizeHorizons(options.horizons || DEFAULT_HORIZONS);
  const minimumGroupEpisodes = Number.isFinite(options.minimumGroupEpisodes)
    ? Math.max(1, options.minimumGroupEpisodes)
    : 30;
  const episodes = dataset.episodes.map(normalizeEpisode);
  const overall = estimateKaplanMeier(episodes, horizons);
  const grouped = buildGroupedBaselines(episodes, horizons, minimumGroupEpisodes);
  const payload = {
    datasetVersion: dataset.datasetVersion,
    horizons,
    overall: overall.horizons,
    groups: grouped.map(item => ({ key: item.key, episodes: item.episodes, horizons: item.horizons }))
  };
  const baselineVersion = createVersion(payload);
  const leakageAudit = auditPointInTimeDataset(dataset);

  return {
    baselineVersion,
    datasetVersion: dataset.datasetVersion,
    evidenceLevel: "observational_baseline",
    eventDefinition: "next_successful_purchase_in_configured_channel",
    survivalDefinitionFa: "احتمال اینکه تا افق زمانی مشخص هنوز خرید مجددی در کانال تنظیم‌شده ثبت نشده باشد",
    horizons,
    overall,
    groups: grouped,
    diagnostics: {
      episodeCount: episodes.length,
      observedEvents: episodes.filter(item => item.eventObserved).length,
      censoredEpisodes: episodes.filter(item => !item.eventObserved).length,
      eventRate: round(episodes.filter(item => item.eventObserved).length / episodes.length, 4),
      maximumObservedDays: Math.max(...episodes.map(item => item.durationDays)),
      eligibleGroupCount: grouped.length,
      excludedSmallGroups: countSmallGroups(episodes, minimumGroupEpisodes)
    },
    leakageAudit,
    modelCard: buildBaselineModelCard(dataset, baselineVersion, horizons, leakageAudit),
    caveatsFa: [
      "Kaplan–Meier یک baseline جمعیتی است و برای هر کاربر تصمیم شخصی تولید نمی‌کند.",
      "این خروجی اثر مداخله یا Saveability را برآورد نمی‌کند.",
      "برآورد افقی که تعداد افراد در معرض خطر آن کم است، باید با احتیاط خوانده شود.",
      "عدم خرید در کانال تنظیم‌شده، مدرک خرید از کانال رقیب نیست."
    ]
  };
}

function auditPointInTimeDataset(dataset) {
  const cutoff = new Date(dataset.cutoffAt).getTime();
  const forbiddenFeaturePattern = /(outcome|event_observed|eventobserved|duration|next_purchase|nextpurchase|churned|label)/i;
  const forbiddenFeatures = [...new Set(dataset.episodes.flatMap(episode => Object.keys(episode.features || {}))
    .filter(feature => forbiddenFeaturePattern.test(feature)))];
  const invalidEpisodeTimes = dataset.episodes.filter(episode => {
    const startedAt = new Date(episode.startedAt).getTime();
    const endedAt = new Date(episode.endedAt).getTime();
    return !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || startedAt > endedAt || endedAt > cutoff;
  }).length;
  const invalidSnapshotTimes = (dataset.snapshots || []).filter(snapshot => {
    const indexDate = new Date(snapshot.indexDate).getTime();
    return !Number.isFinite(indexDate) || indexDate !== cutoff;
  }).length;
  const checks = [
    auditCheck("explicit_cutoff", Number.isFinite(cutoff), "تاریخ برش صریح", "هر feature و label نسبت به یک تاریخ برش نسخه‌بندی شده است."),
    auditCheck("reconciliation", dataset.reconciliation?.reconciled === true, "تطبیق تعداد ردیف‌ها", "ردیف خام، پاک، حذف‌شده و پس از برش با هم تطبیق دارند."),
    auditCheck("episode_time_order", invalidEpisodeTimes === 0, "ترتیب زمانی episode", invalidEpisodeTimes ? `${invalidEpisodeTimes} episode از مرز زمانی عبور کرده است.` : "هیچ episode پس از تاریخ برش پایان نمی‌یابد."),
    auditCheck("snapshot_time", invalidSnapshotTimes === 0, "زمان snapshot", invalidSnapshotTimes ? `${invalidSnapshotTimes} snapshot تاریخ شاخص نامعتبر دارد.` : "همه snapshotها دقیقاً در تاریخ برش ساخته شده‌اند."),
    auditCheck("feature_denylist", forbiddenFeatures.length === 0, "فهرست سیاه feature", forbiddenFeatures.length ? `feature مشکوک پیدا شد: ${forbiddenFeatures.join("، ")}` : "outcome، label و آینده وارد featureها نشده‌اند.")
  ];
  const passed = checks.every(check => check.passed);
  return {
    status: passed ? "passed" : "failed",
    statusFa: passed ? "کنترل نشت زمانی پاس شد" : "احتمال نشت زمانی وجود دارد",
    passed,
    checks,
    excludedAfterCutoffRows: dataset.reconciliation?.afterCutoffRows || 0
  };
}

function buildBaselineModelCard(dataset, baselineVersion, horizons, leakageAudit) {
  return {
    modelName: "kaplan_meier_population_baseline",
    modelNameFa: "خط مبنای جمعیتی خرید مجدد",
    modelVersion: baselineVersion,
    datasetVersion: dataset.datasetVersion,
    cutoffAt: dataset.cutoffAt,
    unitOfAnalysis: dataset.unitOfAnalysis,
    targetFa: "زمان تا خرید موفق بعدی در کانال تنظیم‌شده",
    horizonsDays: horizons,
    evidenceLevel: "observational_baseline",
    evidenceLabelFa: "برآورد تاریخی؛ بدون ادعای اثر مداخله",
    personalization: false,
    decisionPermission: "shadow_only",
    decisionPermissionFa: "فقط تحلیل و Shadow Mode؛ اقدام خودکار مجاز نیست",
    leakageStatus: leakageAudit.status,
    limitationsFa: [
      "این مدل جمعیتی است و امتیاز فردی تولید نمی‌کند.",
      "این مدل قابلیت نجات مشتری یا اثر تخفیف را برآورد نمی‌کند.",
      "برای ارتقا، برتری پایدار مدل شخصی‌سازی‌شده در temporal holdout لازم است."
    ]
  };
}

function auditCheck(key, passed, labelFa, detailFa) {
  return { key, passed: Boolean(passed), labelFa, detailFa };
}

function estimateKaplanMeier(episodes, horizons = DEFAULT_HORIZONS) {
  if (!episodes.length) throw new Error("حداقل یک episode برای Kaplan–Meier لازم است.");
  const times = groupByDuration(episodes);
  let atRisk = episodes.length;
  let survival = 1;
  let greenwoodSum = 0;
  const curve = [{
    timeDays: 0,
    atRisk,
    events: 0,
    censored: 0,
    survivalProbability: 1,
    noRepurchaseProbability: 1,
    confidenceLower: 1,
    confidenceUpper: 1
  }];

  for (const [timeDays, counts] of times.entries()) {
    if (counts.events > atRisk) throw new Error("تعداد event از جمعیت در معرض خطر بیشتر است.");
    if (counts.events > 0) {
      survival *= 1 - counts.events / atRisk;
      if (atRisk > counts.events) {
        greenwoodSum += counts.events / (atRisk * (atRisk - counts.events));
      }
    }
    const interval = logLogConfidenceInterval(survival, greenwoodSum);
    curve.push({
      timeDays,
      atRisk,
      events: counts.events,
      censored: counts.censored,
      survivalProbability: round(survival, 6),
      noRepurchaseProbability: round(survival, 6),
      confidenceLower: interval.lower,
      confidenceUpper: interval.upper
    });
    atRisk -= counts.events + counts.censored;
  }

  return {
    episodeCount: episodes.length,
    eventCount: episodes.filter(item => item.eventObserved).length,
    censoredCount: episodes.filter(item => !item.eventObserved).length,
    medianTimeToRepurchaseDays: medianEventTime(curve),
    horizons: horizons.map(horizon => probabilityAt(curve, horizon)),
    curve
  };
}

function buildGroupedBaselines(episodes, horizons, minimumGroupEpisodes) {
  const groups = new Map();
  episodes.forEach(episode => {
    const key = `${episode.operator}|${episode.packageType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(episode);
  });

  return [...groups.entries()]
    .filter(([, values]) => values.length >= minimumGroupEpisodes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => ({
      key,
      operator: values[0].operator,
      packageType: values[0].packageType,
      episodes: values.length,
      ...estimateKaplanMeier(values, horizons)
    }));
}

function countSmallGroups(episodes, minimumGroupEpisodes) {
  const counts = new Map();
  episodes.forEach(episode => {
    const key = `${episode.operator}|${episode.packageType}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.values()].filter(count => count < minimumGroupEpisodes).length;
}

function groupByDuration(episodes) {
  const grouped = new Map();
  [...episodes]
    .sort((left, right) => left.durationDays - right.durationDays)
    .forEach(episode => {
      const current = grouped.get(episode.durationDays) || { events: 0, censored: 0 };
      if (episode.eventObserved) current.events += 1;
      else current.censored += 1;
      grouped.set(episode.durationDays, current);
    });
  return grouped;
}

function probabilityAt(curve, horizonDays) {
  let point = curve[0];
  for (const candidate of curve) {
    if (candidate.timeDays > horizonDays) break;
    point = candidate;
  }
  return {
    horizonDays,
    noRepurchaseProbability: point.noRepurchaseProbability,
    repurchaseProbability: round(1 - point.noRepurchaseProbability, 6),
    confidenceLower: point.confidenceLower,
    confidenceUpper: point.confidenceUpper,
    atRisk: point.atRisk,
    supportWarning: point.atRisk < Math.max(10, Math.ceil(curve[0].atRisk * 0.1))
  };
}

function medianEventTime(curve) {
  const point = curve.find(item => item.survivalProbability <= 0.5);
  return point ? point.timeDays : null;
}

function logLogConfidenceInterval(survival, greenwoodSum) {
  if (survival <= 0) return { lower: 0, upper: 0 };
  if (survival >= 1 || greenwoodSum <= 0) return { lower: survival, upper: survival };
  const z = 1.959963984540054;
  const logNegativeLog = Math.log(-Math.log(survival));
  const standardError = Math.sqrt(greenwoodSum) / Math.abs(Math.log(survival));
  const lower = Math.exp(-Math.exp(logNegativeLog + z * standardError));
  const upper = Math.exp(-Math.exp(logNegativeLog - z * standardError));
  return { lower: round(lower, 6), upper: round(upper, 6) };
}

function normalizeEpisode(episode) {
  const durationDays = Number(episode.durationDays);
  if (!Number.isFinite(durationDays) || durationDays < 0) throw new Error("durationDays نامعتبر است.");
  if (typeof episode.eventObserved !== "boolean") throw new Error("eventObserved باید boolean باشد.");
  return {
    durationDays,
    eventObserved: episode.eventObserved,
    operator: String(episode.operator || "unknown").trim().toLowerCase(),
    packageType: String(episode.packageType || "unknown").trim().toLowerCase()
  };
}

function normalizeHorizons(values) {
  const horizons = [...new Set(values.map(Number))]
    .filter(value => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (!horizons.length) throw new Error("حداقل یک horizon معتبر لازم است.");
  return horizons;
}

function validateDataset(dataset) {
  if (!dataset || !dataset.datasetVersion) throw new Error("datasetVersion لازم است.");
  if (!Array.isArray(dataset.episodes) || !dataset.episodes.length) throw new Error("dataset باید episode داشته باشد.");
  if (dataset.reconciliation && dataset.reconciliation.reconciled === false) {
    throw new Error("dataset reconciliation پاس نشده است.");
  }
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function createVersion(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

module.exports = { auditPointInTimeDataset, buildSurvivalBaseline, estimateKaplanMeier };

const crypto = require("crypto");
const { buildTreatmentStats, calculateRiskScore, scoreCustomer } = require("./customer-analysis");

const MODEL_VERSION = "model-governance-v1";
const MIN_BACKTEST_ROWS = 40;
const MIN_PROMOTION_ROWS = 200;
const MIN_PROMOTION_ARM = 50;
const DRIFT_WARNING = 0.1;
const DRIFT_CRITICAL = 0.25;

const numericFeatures = [
  ["days_since_last_purchase", "فاصله از آخرین خرید", row => row.daysSinceLastPurchase],
  ["orders_90d", "تعداد سفارش ۹۰روزه", row => row.orders90d],
  ["revenue_90d", "درآمد ۹۰روزه", row => row.revenue90d],
  ["gross_margin_rate", "نرخ حاشیه سود", row => row.grossMarginRate],
  ["outcome_revenue", "درآمد outcome", row => row.outcomeRevenue],
  ["incentive_cost", "هزینه مشوق", row => row.incentiveCost]
];

const categoricalFeatures = [
  ["treatment", "ترکیب گروه‌های اقدام", row => row.treatment || "unknown", false],
  ["segment", "ترکیب سگمنت‌ها", row => row.segmentFa || "unknown", true],
  ["channel", "ترکیب کانال‌ها", row => row.channel || "unknown", true]
];

const completenessLabels = {
  customerId: "کامل‌بودن شناسه مشتری",
  treatment: "کامل‌بودن گروه اقدام",
  exposure: "کامل‌بودن exposure",
  outcome: "کامل‌بودن outcome",
  revenue: "کامل‌بودن درآمد",
  grossMargin: "کامل‌بودن حاشیه سود",
  incentiveCost: "کامل‌بودن هزینه مشوق",
  channelCost: "کامل‌بودن هزینه کانال"
};

function buildModelGovernance(rows, previousGovernance = null, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const profile = buildDistributionProfile(rows);
  const backtest = runCrossValidatedBacktest(rows);
  const drift = evaluateDrift(profile, previousGovernance?.dataSnapshot?.profile, backtest, previousGovernance?.backtest, rows);
  const registry = buildModelRegistry(rows, backtest);

  return {
    version: MODEL_VERSION,
    generatedAt,
    claimLevel: "offline_diagnostic",
    claimLevelFa: "اعتبارسنجی آفلاین؛ نه اثبات اثر علّی",
    dataSnapshot: {
      rowCount: rows.length,
      controlRows: rows.filter(row => row.treatment === "control").length,
      treatmentRows: rows.filter(row => row.treatment !== "control").length,
      observedOutcomeRate: roundFour(mean(rows.map(row => row.converted ? 1 : 0))),
      profile
    },
    backtest,
    registry,
    drift
  };
}

function runCrossValidatedBacktest(rows) {
  const controlRows = rows.filter(row => row.treatment === "control").length;
  const treatmentRows = rows.length - controlRows;
  const foldCount = rows.length >= 150 ? 5 : rows.length >= 80 ? 4 : rows.length >= MIN_BACKTEST_ROWS ? 3 : 0;
  const enoughRows = foldCount > 0 && controlRows >= 10 && treatmentRows >= 10;
  const base = {
    status: enoughRows ? "diagnostic" : "insufficient_sample",
    statusFa: enoughRows ? "بک‌تست آفلاین اجرا شد" : "نمونه برای بک‌تست پایدار کافی نیست",
    evidenceLevel: "offline_observational",
    evidenceLevelFa: "مشاهده‌ای؛ برای promotion کافی نیست",
    folds: foldCount,
    methodologyFa: "Cross-validation مشتری‌محور با transformed outcome و تفکیک کامل train/test",
    limitationsFa: [
      "داده تاریخی ممکن است selection bias داشته باشد؛ این خروجی اثبات causal نیست.",
      "معیار transformed outcome در نمونه کوچک پرنوسان است.",
      "promotion فقط پس از پایلوت تصادفی سالم و تکرارپذیر مجاز است."
    ]
  };

  if (!enoughRows) {
    return {
      ...base,
      candidates: [
        emptyCandidate("transparent-risk-profit-v1", "champion", "مدل شفاف ریسک و سود"),
        emptyCandidate("shrunken-net-value-v1", "challenger", "مدل محافظه‌کار ارزش خالص")
      ]
    };
  }

  const assignments = rows.map(row => stableFold(row.customerId, foldCount));
  const evaluations = {
    "transparent-risk-profit-v1": [],
    "shrunken-net-value-v1": []
  };

  for (let fold = 0; fold < foldCount; fold += 1) {
    const trainRows = rows.filter((row, index) => assignments[index] !== fold);
    const testRows = rows.filter((row, index) => assignments[index] === fold);
    const fitted = fitPolicyModels(trainRows);
    for (const row of testRows) {
      const champion = predictChampion(row, fitted);
      const challenger = predictChallenger(row, fitted);
      evaluations["transparent-risk-profit-v1"].push(evaluatePrediction(row, champion, fitted.propensities));
      evaluations["shrunken-net-value-v1"].push(evaluatePrediction(row, challenger, fitted.propensities));
    }
  }

  return {
    ...base,
    candidates: [
      summarizeCandidate("transparent-risk-profit-v1", "champion", "مدل شفاف ریسک و سود", evaluations["transparent-risk-profit-v1"]),
      summarizeCandidate("shrunken-net-value-v1", "challenger", "مدل محافظه‌کار ارزش خالص", evaluations["shrunken-net-value-v1"])
    ]
  };
}

function fitPolicyModels(rows) {
  const treatmentStats = buildTreatmentStats(rows);
  const control = treatmentStats.find(item => item.key === "control") || null;
  const propensities = Object.fromEntries(treatmentStats.map(item => [item.key, item.users / rows.length]));
  const medianRevenue = quantile(rows.map(row => row.revenue90d), 0.5) || 1;
  return { treatmentStats, control, propensities, medianRevenue };
}

function predictChampion(row, fitted) {
  if (!fitted.control) return noActionPrediction();
  const prediction = scoreCustomer(row, fitted.treatmentStats, fitted.control);
  return {
    action: prediction.recommendedAction,
    predictedIncrementalProfit: Math.max(0, Number(prediction.expectedIncrementalProfit || 0))
  };
}

function predictChallenger(row, fitted) {
  if (!fitted.control || calculateRiskScore(row) < 45) return noActionPrediction();
  const valueFactor = clamp(row.revenue90d / Math.max(1, fitted.medianRevenue), 0.5, 1.75);
  const candidates = fitted.treatmentStats
    .filter(item => item.key !== "control")
    .map(item => {
      const rawEffect = item.averageContribution - fitted.control.averageContribution - item.averageCost;
      const shrinkage = item.users / (item.users + 30);
      return {
        action: item.key,
        predictedIncrementalProfit: Math.round(rawEffect * shrinkage * valueFactor)
      };
    })
    .sort((left, right) => right.predictedIncrementalProfit - left.predictedIncrementalProfit);
  const best = candidates[0];
  return best?.predictedIncrementalProfit > 0 ? best : noActionPrediction();
}

function evaluatePrediction(row, prediction, propensities) {
  const action = prediction.action;
  const targeted = action !== "control";
  let transformedOutcome = 0;
  let valid = true;
  if (targeted) {
    const actionPropensity = propensities[action] || 0;
    const controlPropensity = propensities.control || 0;
    if (!(actionPropensity > 0) || !(controlPropensity > 0)) {
      valid = false;
    } else {
      const profit = contributionProfit(row);
      if (row.treatment === action) transformedOutcome = profit / actionPropensity;
      else if (row.treatment === "control") transformedOutcome = -profit / controlPropensity;
    }
  }
  return {
    valid,
    targeted,
    predicted: prediction.predictedIncrementalProfit,
    observed: transformedOutcome
  };
}

function summarizeCandidate(id, role, nameFa, evaluations) {
  const validRows = evaluations.filter(item => item.valid);
  const targetedRows = validRows.filter(item => item.targeted);
  if (validRows.length < MIN_BACKTEST_ROWS || targetedRows.length < 10) {
    return emptyCandidate(id, role, nameFa, validRows.length);
  }
  const bins = buildCalibrationBins(targetedRows);
  const calibrationMae = weightedMean(bins.map(bin => ({
    value: Math.abs(bin.predictedMean - bin.observedMean),
    weight: bin.count
  })));
  const calibrationSlope = regressionSlope(
    bins.map(bin => bin.predictedMean),
    bins.map(bin => bin.observedMean),
    bins.map(bin => bin.count)
  );
  const policyValuePerCustomer = mean(validRows.map(item => item.targeted ? item.observed : 0));
  const positiveTargetRate = targetedRows.length / validRows.length;
  return {
    id,
    role,
    nameFa,
    status: "evaluated",
    statusFa: "ارزیابی آفلاین انجام شد",
    sampleRows: validRows.length,
    metrics: {
      calibrationMae: roundMoney(calibrationMae),
      calibrationSlope: roundFourNullable(calibrationSlope),
      policyValuePerCustomer: roundMoney(policyValuePerCustomer),
      positiveTargetRate: roundFour(positiveTargetRate)
    },
    calibrationBins: bins.map(bin => ({
      labelFa: bin.labelFa,
      count: bin.count,
      predictedMean: roundMoney(bin.predictedMean),
      observedMean: roundMoney(bin.observedMean)
    }))
  };
}

function buildCalibrationBins(rows) {
  const ordered = rows.slice().sort((left, right) => left.predicted - right.predicted);
  const binCount = Math.min(5, Math.max(2, Math.floor(ordered.length / 10)));
  const bins = [];
  for (let index = 0; index < binCount; index += 1) {
    const start = Math.floor(index * ordered.length / binCount);
    const end = Math.floor((index + 1) * ordered.length / binCount);
    const items = ordered.slice(start, end);
    if (!items.length) continue;
    bins.push({
      labelFa: `بازه ${index + 1}`,
      count: items.length,
      predictedMean: mean(items.map(item => item.predicted)),
      observedMean: mean(items.map(item => item.observed))
    });
  }
  return bins;
}

function buildModelRegistry(rows, backtest) {
  const champion = backtest.candidates.find(item => item.role === "champion");
  const challenger = backtest.candidates.find(item => item.role === "challenger");
  const controlRows = rows.filter(row => row.treatment === "control").length;
  const treatmentRows = rows.length - controlRows;
  const challengerWins = Boolean(
    champion?.metrics && challenger?.metrics &&
    challenger.metrics.calibrationMae <= champion.metrics.calibrationMae * 0.95 &&
    challenger.metrics.policyValuePerCustomer > champion.metrics.policyValuePerCustomer
  );
  const checks = [
    promotionCheck("sample", "حداقل ۲۰۰ مشتری", rows.length >= MIN_PROMOTION_ROWS, `${rows.length} ردیف`),
    promotionCheck("arms", "حداقل ۵۰ مشتری در هر بازو", controlRows >= MIN_PROMOTION_ARM && treatmentRows >= MIN_PROMOTION_ARM, `${controlRows} کنترل / ${treatmentRows} اقدام`),
    promotionCheck("offline_win", "برتری Challenger در calibration و policy value", challengerWins, challengerWins ? "برتری آفلاین مشاهده شد" : "برتری پایدار ثبت نشد"),
    promotionCheck("decision_grade_pilot", "حداقل یک پایلوت تصادفی تصمیم‌درجه", false, "هنوز به outcome معتبر متصل نشده است"),
    promotionCheck("repeatability", "تکرار نتیجه در دو پنجره مستقل", false, "نیازمند پایلوت دوم")
  ];
  const eligible = checks.every(item => item.passed);
  return {
    championId: champion?.id || "transparent-risk-profit-v1",
    challengerId: challenger?.id || "shrunken-net-value-v1",
    promotionGate: {
      eligible,
      status: eligible ? "eligible" : "blocked",
      statusFa: eligible ? "آماده بررسی انسانی برای promotion" : "ارتقای مدل مسدود است",
      recommendationFa: eligible
        ? "کمیته محصول و داده می‌تواند promotion کنترل‌شده را بررسی کند."
        : "Champion حفظ شود؛ Challenger فقط در shadow mode بماند.",
      checks
    }
  };
}

function buildDistributionProfile(rows) {
  const numeric = {};
  for (const [key, labelFa, accessor] of numericFeatures) {
    numeric[key] = numericProfile(rows.map(accessor).filter(Number.isFinite), labelFa);
  }
  const categorical = {};
  for (const [key, labelFa, accessor, hashValues] of categoricalFeatures) {
    categorical[key] = categoricalProfile(rows.map(accessor), labelFa, hashValues);
  }
  const completeness = {};
  for (const key of ["customerId", "treatment", "exposure", "outcome", "revenue", "grossMargin", "incentiveCost", "channelCost"]) {
    completeness[key] = roundFour(mean(rows.map(row => row.sourcePresence?.[key] ? 1 : 0)));
  }
  return { numeric, categorical, completeness };
}

function evaluateDrift(current, previous, currentBacktest, previousBacktest, currentRows = []) {
  if (!previous) {
    return {
      status: "baseline_pending",
      statusFa: "خط مبنای drift ثبت شد",
      score: null,
      maxIndex: null,
      summaryFa: "این نخستین snapshot است؛ drift از ورود بعدی قابل سنجش می‌شود.",
      features: [],
      performance: { status: "baseline_pending", statusFa: "در انتظار مقایسه بعدی" }
    };
  }

  const features = [];
  for (const [key, labelFa, accessor] of numericFeatures) {
    const currentValues = currentRows.map(accessor).filter(Number.isFinite);
    const value = populationStabilityIndex(previous.numeric[key], currentValues);
    features.push(driftFeature(key, labelFa, "psi", value));
  }
  for (const [key, labelFa] of categoricalFeatures) {
    const value = jensenShannon(previous.categorical[key]?.proportions, current.categorical[key]?.proportions);
    features.push(driftFeature(key, labelFa, "jsd", value));
  }
  for (const [key, labelFa] of Object.entries(completenessLabels)) {
    const value = Math.abs(Number(current.completeness?.[key] || 0) - Number(previous.completeness?.[key] || 0));
    features.push(driftFeature(`completeness_${key}`, labelFa, "delta", value));
  }
  const maxIndex = Math.max(0, ...features.map(item => item.value || 0));
  const performance = evaluatePerformanceDrift(currentBacktest, previousBacktest);
  const dataStatus = driftStatus(maxIndex);
  const status = highestSeverity(dataStatus, performance.status);
  return {
    status,
    statusFa: driftStatusFa(status),
    score: Math.max(0, Math.round(100 - Math.min(1, maxIndex) * 100)),
    maxIndex: roundFour(maxIndex),
    summaryFa: status === "critical"
      ? "توزیع داده به‌طور معنادار تغییر کرده؛ تصمیم‌های مدل باید بازبینی شوند."
      : status === "warning"
        ? "تغییر قابل توجه دیده شد؛ اجرای shadow و بررسی featureها توصیه می‌شود."
        : "توزیع داده نسبت به snapshot قبلی پایدار است.",
    features: features.sort((left, right) => right.value - left.value),
    performance
  };
}

function evaluatePerformanceDrift(currentBacktest, previousBacktest) {
  const current = currentBacktest?.candidates?.find(item => item.role === "champion")?.metrics;
  const previous = previousBacktest?.candidates?.find(item => item.role === "champion")?.metrics;
  if (!current || !previous || !(previous.calibrationMae > 0)) {
    return { status: "unavailable", statusFa: "داده کافی برای مقایسه عملکرد نیست", relativeMaeChange: null };
  }
  const relativeMaeChange = (current.calibrationMae - previous.calibrationMae) / previous.calibrationMae;
  const status = relativeMaeChange > 0.5 ? "critical" : relativeMaeChange > 0.25 ? "warning" : "stable";
  return {
    status,
    statusFa: status === "critical" ? "افت شدید calibration" : status === "warning" ? "افت calibration" : "عملکرد آفلاین پایدار",
    relativeMaeChange: roundFour(relativeMaeChange)
  };
}

function toPublicModelGovernance(governance) {
  if (!governance) return null;
  return {
    version: governance.version,
    generatedAt: governance.generatedAt,
    claimLevel: governance.claimLevel,
    claimLevelFa: governance.claimLevelFa,
    dataSnapshot: {
      rowCount: governance.dataSnapshot?.rowCount || 0,
      controlRows: governance.dataSnapshot?.controlRows || 0,
      treatmentRows: governance.dataSnapshot?.treatmentRows || 0,
      observedOutcomeRate: governance.dataSnapshot?.observedOutcomeRate ?? null
    },
    backtest: governance.backtest,
    registry: governance.registry,
    drift: governance.drift
  };
}

function buildOutcomeMonitor(outcomeRecord) {
  const summary = outcomeRecord?.analysis?.summary || outcomeRecord?.summary;
  if (!summary) {
    return {
      status: "pending",
      statusFa: "در انتظار outcome",
      summaryFa: "پس از ورود outcome، شکاف پیش‌بینی و نتیجه واقعی پایش می‌شود."
    };
  }
  const predicted = Number(summary.predictedIncrementalProfit || 0);
  const observed = Number(summary.observedIncrementalProfit || 0);
  const absoluteGap = observed - predicted;
  const relativeGap = Math.abs(predicted) > 0 ? absoluteGap / Math.abs(predicted) : null;
  const decisionStatus = summary.decisionStatus || "needs_review";
  const status = decisionStatus === "scale" && (relativeGap === null || Math.abs(relativeGap) <= 0.25)
    ? "stable"
    : decisionStatus === "stop" || (relativeGap !== null && Math.abs(relativeGap) > 0.5)
      ? "critical"
      : "warning";
  return {
    status,
    statusFa: status === "stable" ? "نتیجه با سیاست تصمیم سازگار است" : status === "critical" ? "شکاف عملکرد بحرانی" : "نیازمند بازبینی عملکرد",
    predictedIncrementalProfit: Math.round(predicted),
    observedIncrementalProfit: Math.round(observed),
    absoluteGap: Math.round(absoluteGap),
    relativeGap: roundFourNullable(relativeGap),
    decisionStatus,
    evidenceStatus: summary.evidenceStatus || "descriptive_only",
    summaryFa: status === "stable"
      ? "نتیجه واقعی در محدوده قابل قبول قرار دارد."
      : "قبل از تغییر مدل یا بودجه، علت شکاف prediction و outcome بررسی شود."
  };
}

function numericProfile(values, labelFa) {
  if (!values.length) return { labelFa, count: 0, mean: null, edges: [], proportions: [] };
  const sorted = values.slice().sort((a, b) => a - b);
  const edges = unique([0.2, 0.4, 0.6, 0.8].map(point => quantile(sorted, point)));
  return {
    labelFa,
    count: values.length,
    mean: roundFour(mean(values)),
    edges,
    proportions: bucketProportions(values, edges)
  };
}

function categoricalProfile(values, labelFa, hashValues = false) {
  const counts = {};
  values.forEach(value => {
    const normalized = String(value || "unknown");
    const key = hashValues ? `category_${crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16)}` : normalized;
    counts[key] = (counts[key] || 0) + 1;
  });
  const total = Math.max(1, values.length);
  const ordered = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  const retained = ordered.slice(0, 49);
  const otherCount = ordered.slice(49).reduce((sum, item) => sum + item[1], 0);
  if (otherCount) retained.push(["__other__", otherCount]);
  return {
    labelFa,
    count: values.length,
    proportions: Object.fromEntries(retained.map(([key, count]) => [key, count / total]))
  };
}

function populationStabilityIndex(previous, currentValues) {
  if (!previous?.count || !currentValues?.length) return 0;
  const expected = previous.proportions || [];
  const actual = bucketProportions(currentValues, previous.edges || []);
  return expected.reduce((sum, value, index) => {
    const left = Math.max(0.0001, value || 0);
    const right = Math.max(0.0001, actual[index] || 0);
    return sum + (right - left) * Math.log(right / left);
  }, 0);
}

function jensenShannon(previous = {}, current = {}) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  let divergence = 0;
  for (const key of keys) {
    const left = Math.max(0.0001, previous[key] || 0);
    const right = Math.max(0.0001, current[key] || 0);
    const midpoint = (left + right) / 2;
    divergence += 0.5 * left * Math.log(left / midpoint) + 0.5 * right * Math.log(right / midpoint);
  }
  return divergence;
}

function driftFeature(key, labelFa, method, value) {
  const status = driftStatus(value);
  return { key, labelFa, method, value: roundFour(value), status, statusFa: driftStatusFa(status) };
}

function driftStatus(value) {
  if (value >= DRIFT_CRITICAL) return "critical";
  if (value >= DRIFT_WARNING) return "warning";
  return "stable";
}

function driftStatusFa(status) {
  if (status === "critical") return "تغییر بحرانی";
  if (status === "warning") return "نیازمند بررسی";
  return "پایدار";
}

function highestSeverity(...statuses) {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  return "stable";
}

function emptyCandidate(id, role, nameFa, sampleRows = 0) {
  return {
    id,
    role,
    nameFa,
    status: "insufficient_sample",
    statusFa: "نمونه کافی نیست",
    sampleRows,
    metrics: null,
    calibrationBins: []
  };
}

function promotionCheck(key, labelFa, passed, detailFa) {
  return { key, labelFa, passed, detailFa };
}

function noActionPrediction() {
  return { action: "control", predictedIncrementalProfit: 0 };
}

function contributionProfit(row) {
  return row.outcomeRevenue * row.grossMarginRate - row.incentiveCost - row.channelCost;
}

function stableFold(customerId, folds) {
  const value = parseInt(crypto.createHash("sha256").update(String(customerId)).digest("hex").slice(0, 8), 16);
  return value % folds;
}

function bucketProportions(values, edges) {
  const counts = Array(edges.length + 1).fill(0);
  values.forEach(value => {
    let index = 0;
    while (index < edges.length && value > edges[index]) index += 1;
    counts[index] += 1;
  });
  const total = Math.max(1, values.length);
  return counts.map(count => count / total);
}

function regressionSlope(xs, ys, weights) {
  if (xs.length < 2 || xs.every(value => value === xs[0])) return null;
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const meanX = xs.reduce((sum, value, index) => sum + value * weights[index], 0) / totalWeight;
  const meanY = ys.reduce((sum, value, index) => sum + value * weights[index], 0) / totalWeight;
  const numerator = xs.reduce((sum, value, index) => sum + weights[index] * (value - meanX) * (ys[index] - meanY), 0);
  const denominator = xs.reduce((sum, value, index) => sum + weights[index] * (value - meanX) ** 2, 0);
  return denominator > 0 ? numerator / denominator : null;
}

function weightedMean(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  return totalWeight > 0 ? items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight : 0;
}

function quantile(values, probability) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

function unique(values) {
  return [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
}

function roundMoney(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function roundFour(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function roundFourNullable(value) {
  return value === null || value === undefined || !Number.isFinite(value) ? null : roundFour(value);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

module.exports = {
  buildModelGovernance,
  buildOutcomeMonitor,
  evaluateDrift,
  runCrossValidatedBacktest,
  toPublicModelGovernance
};

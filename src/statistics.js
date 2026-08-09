const DEFAULT_ALPHA = 0.05;
const DEFAULT_POWER = 0.8;
const DEFAULT_MIN_SAMPLE_PER_ARM = 50;

function analyzeExperimentOutcome(rows, experiment, options = {}) {
  const assignments = new Map((experiment?.assignments || []).map(item => [item.customerId, item]));
  const plan = experiment?.design?.analysisPlan || defaultAnalysisPlan();
  const prepared = rows.map(row => {
    const assignment = assignments.get(row.customerId);
    return {
      group: row.assignedGroup === "control" ? "control" : "treatment",
      contributionProfit: contributionProfit(row),
      revenue: row.outcomeRevenue,
      converted: row.converted ? 1 : 0,
      cost: row.actualIncentiveCost + row.actualChannelCost,
      baseline: finiteOrNull(assignment?.baselineRevenue)
    };
  });
  const control = prepared.filter(item => item.group === "control");
  const treatment = prepared.filter(item => item.group === "treatment");
  const alpha = finiteProbability(plan.alpha, DEFAULT_ALPHA);
  const targetPower = finiteProbability(plan.targetPower, DEFAULT_POWER);
  const cuped = applyCuped(prepared);
  const primary = compareMeans(
    cuped.rows.filter(item => item.group === "treatment").map(item => item.adjustedContributionProfit),
    cuped.rows.filter(item => item.group === "control").map(item => item.adjustedContributionProfit),
    { alpha, targetPower }
  );
  const unadjustedPrimary = compareMeans(
    treatment.map(item => item.contributionProfit),
    control.map(item => item.contributionProfit),
    { alpha, targetPower }
  );
  const revenue = compareMeans(
    treatment.map(item => item.revenue),
    control.map(item => item.revenue),
    { alpha, targetPower }
  );
  const conversion = compareProportions(
    treatment.reduce((sum, item) => sum + item.converted, 0),
    treatment.length,
    control.reduce((sum, item) => sum + item.converted, 0),
    control.length,
    alpha
  );
  const guardrails = evaluateGuardrails({ revenue, conversion, treatment, control, plan });
  const minimumSamplePerArm = positiveInteger(plan.minimumSamplePerArm, DEFAULT_MIN_SAMPLE_PER_ARM);
  const sampleAdequate = treatment.length >= minimumSamplePerArm && control.length >= minimumSamplePerArm;

  return {
    method: cuped.applied ? "cuped_welch_itt" : "welch_itt",
    methodFa: cuped.applied ? "برآورد ITT تعدیل‌شده با CUPED و فاصله اطمینان Welch" : "برآورد ITT با فاصله اطمینان Welch",
    estimand: plan.estimand || "intention_to_treat_policy_vs_control",
    estimandFa: plan.estimandFa || "اثر تخصیص به سیاست MarginLift در مقایسه با کنترل، برای هر مشتری تخصیص‌یافته",
    alpha,
    confidenceLevel: 1 - alpha,
    targetPower,
    sample: {
      treatment: treatment.length,
      control: control.length,
      minimumPerArm: minimumSamplePerArm,
      adequate: sampleAdequate
    },
    primary: {
      key: "contribution_profit_per_assigned_customer",
      labelFa: "سود مشارکتی افزایشی به‌ازای هر مشتری تخصیص‌یافته",
      ...primary,
      rawEstimate: unadjustedPrimary.estimate,
      cupedApplied: cuped.applied,
      varianceReduction: cuped.varianceReduction,
      theta: cuped.theta
    },
    secondary: {
      revenuePerCustomer: revenue,
      conversionRate: conversion,
      averageTreatmentCost: mean(treatment.map(item => item.cost)),
      averageControlCost: mean(control.map(item => item.cost))
    },
    guardrails,
    valid: primary.valid && revenue.valid && conversion.valid,
    limitationsFa: buildLimitations(primary, sampleAdequate, cuped)
  };
}

function compareMeans(treatmentValues, controlValues, options = {}) {
  const alpha = finiteProbability(options.alpha, DEFAULT_ALPHA);
  const targetPower = finiteProbability(options.targetPower, DEFAULT_POWER);
  const treatment = treatmentValues.filter(Number.isFinite);
  const control = controlValues.filter(Number.isFinite);
  const nTreatment = treatment.length;
  const nControl = control.length;
  const meanTreatment = mean(treatment);
  const meanControl = mean(control);
  const estimate = meanTreatment - meanControl;
  const varianceTreatment = sampleVariance(treatment);
  const varianceControl = sampleVariance(control);

  if (nTreatment < 2 || nControl < 2 || !Number.isFinite(varianceTreatment) || !Number.isFinite(varianceControl)) {
    return invalidComparison(estimate, meanTreatment, meanControl, nTreatment, nControl, "برای برآورد عدم‌قطعیت حداقل دو مشاهده در هر بازو لازم است.");
  }

  const treatmentTerm = varianceTreatment / nTreatment;
  const controlTerm = varianceControl / nControl;
  const standardError = Math.sqrt(treatmentTerm + controlTerm);
  if (!(standardError > 0)) {
    return invalidComparison(estimate, meanTreatment, meanControl, nTreatment, nControl, "واریانس outcome صفر است؛ آزمون آماری قابل اتکا نیست.");
  }

  const numerator = Math.pow(treatmentTerm + controlTerm, 2);
  const denominator = Math.pow(treatmentTerm, 2) / (nTreatment - 1) + Math.pow(controlTerm, 2) / (nControl - 1);
  const degreesOfFreedom = denominator > 0 ? numerator / denominator : nTreatment + nControl - 2;
  const statistic = estimate / standardError;
  const pValue = clamp(2 * (1 - studentTCdf(Math.abs(statistic), degreesOfFreedom)), 0, 1);
  const critical = studentTQuantile(1 - alpha / 2, degreesOfFreedom);
  const ciLow = estimate - critical * standardError;
  const ciHigh = estimate + critical * standardError;
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(targetPower);
  const minimumDetectableEffect = (zAlpha + zBeta) * standardError;
  const achievedPower = twoSidedNormalPower(estimate, standardError, alpha);

  return {
    valid: true,
    estimate,
    meanTreatment,
    meanControl,
    standardError,
    ciLow,
    ciHigh,
    pValue,
    statistic,
    degreesOfFreedom,
    minimumDetectableEffect,
    achievedPower,
    significant: pValue < alpha,
    direction: ciLow > 0 ? "positive" : ciHigh < 0 ? "negative" : "inconclusive",
    nTreatment,
    nControl
  };
}

function compareProportions(treatmentSuccesses, treatmentTotal, controlSuccesses, controlTotal, alpha = DEFAULT_ALPHA) {
  if (treatmentTotal < 2 || controlTotal < 2) {
    return { valid: false, estimate: null, ciLow: null, ciHigh: null, pValue: null, direction: "inconclusive" };
  }
  const treatmentRate = treatmentSuccesses / treatmentTotal;
  const controlRate = controlSuccesses / controlTotal;
  const estimate = treatmentRate - controlRate;
  const unpooledSe = Math.sqrt(
    treatmentRate * (1 - treatmentRate) / treatmentTotal +
    controlRate * (1 - controlRate) / controlTotal
  );
  const pooledRate = (treatmentSuccesses + controlSuccesses) / (treatmentTotal + controlTotal);
  const pooledSe = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / treatmentTotal + 1 / controlTotal));
  const critical = normalQuantile(1 - alpha / 2);
  const treatmentInterval = wilsonInterval(treatmentSuccesses, treatmentTotal, critical);
  const controlInterval = wilsonInterval(controlSuccesses, controlTotal, critical);
  const ciLow = estimate - Math.sqrt(
    (treatmentRate - treatmentInterval.low) ** 2 +
    (controlInterval.high - controlRate) ** 2
  );
  const ciHigh = estimate + Math.sqrt(
    (treatmentInterval.high - treatmentRate) ** 2 +
    (controlRate - controlInterval.low) ** 2
  );
  const statistic = pooledSe > 0 ? estimate / pooledSe : 0;
  const pValue = pooledSe > 0 ? clamp(2 * (1 - normalCdf(Math.abs(statistic))), 0, 1) : 1;
  return {
    valid: true,
    estimate,
    treatmentRate,
    controlRate,
    standardError: unpooledSe,
    ciLow,
    ciHigh,
    pValue,
    significant: pValue < alpha,
    direction: ciLow > 0 ? "positive" : ciHigh < 0 ? "negative" : "inconclusive"
  };
}

function wilsonInterval(successes, total, critical) {
  const rate = successes / total;
  const criticalSquared = critical ** 2;
  const denominator = 1 + criticalSquared / total;
  const center = (rate + criticalSquared / (2 * total)) / denominator;
  const halfWidth = critical * Math.sqrt(
    rate * (1 - rate) / total + criticalSquared / (4 * total ** 2)
  ) / denominator;
  return {
    low: clamp(center - halfWidth, 0, 1),
    high: clamp(center + halfWidth, 0, 1)
  };
}

function applyCuped(rows) {
  const complete = rows.length > 0 && rows.every(item => Number.isFinite(item.baseline));
  if (!complete) return cupedNotApplied(rows, "متغیر پیش از آزمایش برای همه مشتریان موجود نیست.");
  const baselines = rows.map(item => item.baseline);
  const outcomes = rows.map(item => item.contributionProfit);
  const baselineVariance = sampleVariance(baselines);
  if (!(baselineVariance > 0)) return cupedNotApplied(rows, "واریانس متغیر پیش از آزمایش صفر است.");
  const theta = covariance(outcomes, baselines) / baselineVariance;
  const baselineMean = mean(baselines);
  const adjusted = rows.map(item => ({
    ...item,
    adjustedContributionProfit: item.contributionProfit - theta * (item.baseline - baselineMean)
  }));
  const rawVariance = sampleVariance(outcomes);
  const adjustedVariance = sampleVariance(adjusted.map(item => item.adjustedContributionProfit));
  const varianceReduction = rawVariance > 0 ? clamp(1 - adjustedVariance / rawVariance, 0, 1) : 0;
  return { applied: true, theta, varianceReduction, rows: adjusted, noteFa: "CUPED با درآمد ۹۰ روز پیش از آزمایش اعمال شد." };
}

function evaluateGuardrails({ revenue, conversion, treatment, control, plan }) {
  const revenueTolerance = finiteNumber(plan.guardrails?.revenueRelativeTolerance, -0.05);
  const conversionTolerance = finiteNumber(plan.guardrails?.conversionAbsoluteTolerance, -0.02);
  const revenueMargin = Math.abs(revenue.meanControl || 0) * revenueTolerance;
  const conversionMargin = conversionTolerance;
  const maxCost = finiteOrNull(plan.guardrails?.maxCostPerAssignedCustomer);
  const treatmentCost = mean(treatment.map(item => item.cost));

  return [
    nonInferiorityGuardrail("revenue_per_customer", "درآمد به‌ازای مشتری", revenue, revenueMargin),
    nonInferiorityGuardrail("conversion_rate", "نرخ تبدیل", conversion, conversionMargin),
    maxGuardrail("cost_per_assigned_customer", "هزینه به‌ازای مشتری تخصیص‌یافته", treatmentCost, maxCost)
  ];
}

function nonInferiorityGuardrail(key, labelFa, comparison, margin) {
  if (!comparison.valid) return guardrail(key, labelFa, "unavailable", margin, comparison, "داده کافی نیست.");
  if (comparison.ciLow >= margin) return guardrail(key, labelFa, "pass", margin, comparison, "عدم آسیب در محدوده تعیین‌شده تأیید شد.");
  if (comparison.ciHigh < margin) return guardrail(key, labelFa, "fail", margin, comparison, "آسیب معنادار از آستانه مجاز بیشتر است.");
  return guardrail(key, labelFa, "inconclusive", margin, comparison, "فاصله اطمینان از آستانه عبور می‌کند؛ داده بیشتری لازم است.");
}

function maxGuardrail(key, labelFa, estimate, maximum) {
  if (!Number.isFinite(maximum)) return guardrail(key, labelFa, "unavailable", null, { estimate }, "سقف هزینه پیش از اجرا ثبت نشده است.");
  return guardrail(key, labelFa, estimate <= maximum ? "pass" : "fail", maximum, { estimate }, estimate <= maximum ? "در سقف ثبت‌شده است." : "از سقف ثبت‌شده عبور کرده است.");
}

function guardrail(key, labelFa, status, threshold, comparison, noteFa) {
  return {
    key,
    labelFa,
    status,
    statusFa: status === "pass" ? "تأیید" : status === "fail" ? "نقض‌شده" : status === "inconclusive" ? "نامطمئن" : "ثبت نشده",
    passed: status === "pass",
    threshold,
    estimate: comparison.estimate,
    ciLow: comparison.ciLow ?? null,
    ciHigh: comparison.ciHigh ?? null,
    noteFa
  };
}

function decideExperiment({ integrity, statistics, observedRoi, minimumRoi = 1 }) {
  if (!integrity?.decisionEligible) return decision("needs_review", "Integrity Gate کامل عبور نکرده است؛ تصمیم بودجه‌ای مجاز نیست.");
  if (!statistics?.valid || !statistics.primary?.valid) return decision("needs_review", "عدم‌قطعیت آماری قابل محاسبه نیست.");
  const failedGuardrail = statistics.guardrails.find(item => item.status === "fail");
  if (failedGuardrail) return decision("stop", `Guardrail «${failedGuardrail.labelFa}» نقض شده است.`);
  if (statistics.primary.ciHigh <= 0) return decision("stop", "کران بالای فاصله اطمینان سود افزایشی مثبت نیست.");
  const unresolvedGuardrail = statistics.guardrails.find(item => item.status === "inconclusive");
  const scaleReady = statistics.primary.ciLow > 0 &&
    statistics.sample.adequate &&
    !unresolvedGuardrail &&
    Number.isFinite(observedRoi) && observedRoi >= minimumRoi;
  if (scaleReady) return decision("scale", "اثر مثبت، حجم نمونه، guardrailها و کف ROI هم‌زمان تأیید شده‌اند.");
  if (statistics.primary.estimate > 0) {
    const reason = !statistics.sample.adequate
      ? "اثر مثبت است، اما حجم نمونه به حد تصمیم نرسیده است."
      : unresolvedGuardrail
        ? `Guardrail «${unresolvedGuardrail.labelFa}» هنوز نامطمئن است.`
        : observedRoi < minimumRoi
          ? "اثر مثبت است، اما ROI به کف اقتصادی ثبت‌شده نرسیده است."
          : "فاصله اطمینان هنوز صفر را قطع می‌کند.";
    return decision("iterate", reason);
  }
  return decision("iterate", "برآورد نقطه‌ای مثبت نیست، اما شواهد برای توقف قطعی نیز کافی نیست.");
}

function defaultAnalysisPlan(source = {}) {
  return {
    version: "analysis-plan-v1",
    estimand: "intention_to_treat_policy_vs_control",
    estimandFa: "اثر تخصیص به سیاست MarginLift در مقایسه با کنترل، برای هر مشتری تخصیص‌یافته",
    primaryMetric: "contribution_profit_per_assigned_customer",
    alpha: DEFAULT_ALPHA,
    targetPower: DEFAULT_POWER,
    minimumSamplePerArm: DEFAULT_MIN_SAMPLE_PER_ARM,
    minimumRoi: 1,
    plannedConversionSamplePerArm: finiteOrNull(source.sampleSize?.perGroup),
    guardrails: {
      revenueRelativeTolerance: -0.05,
      conversionAbsoluteTolerance: -0.02,
      maxCostPerAssignedCustomer: null
    }
  };
}

function contributionProfit(row) {
  return row.outcomeRevenue * row.grossMarginRate - row.actualIncentiveCost - row.actualChannelCost;
}

function invalidComparison(estimate, meanTreatment, meanControl, nTreatment, nControl, reasonFa) {
  return {
    valid: false,
    estimate: Number.isFinite(estimate) ? estimate : null,
    meanTreatment: Number.isFinite(meanTreatment) ? meanTreatment : null,
    meanControl: Number.isFinite(meanControl) ? meanControl : null,
    standardError: null,
    ciLow: null,
    ciHigh: null,
    pValue: null,
    minimumDetectableEffect: null,
    achievedPower: null,
    significant: false,
    direction: "inconclusive",
    nTreatment,
    nControl,
    reasonFa
  };
}

function cupedNotApplied(rows, noteFa) {
  return {
    applied: false,
    theta: null,
    varianceReduction: 0,
    rows: rows.map(item => ({ ...item, adjustedContributionProfit: item.contributionProfit })),
    noteFa
  };
}

function buildLimitations(primary, sampleAdequate, cuped) {
  const notes = [];
  if (!primary.valid) notes.push(primary.reasonFa);
  if (!sampleAdequate) notes.push("حجم نمونه به کف از پیش تعیین‌شده هر بازو نرسیده است.");
  if (!cuped.applied) notes.push(cuped.noteFa);
  notes.push("تحلیل pooled treatment اثر کل policy را می‌سنجد؛ نتیجه هر نوع مشوق باید جداگانه و فقط با توان کافی بررسی شود.");
  return notes.filter(Boolean);
}

function decision(status, rationaleFa) {
  return { status, rationaleFa };
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sampleVariance(values) {
  if (values.length < 2) return NaN;
  const average = mean(values);
  return values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / (values.length - 1);
}

function covariance(left, right) {
  if (left.length !== right.length || left.length < 2) return NaN;
  const leftMean = mean(left);
  const rightMean = mean(right);
  return left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0) / (left.length - 1);
}

function twoSidedNormalPower(effect, standardError, alpha) {
  if (!(standardError > 0)) return null;
  const nonCentrality = Math.abs(effect) / standardError;
  const critical = normalQuantile(1 - alpha / 2);
  return clamp(1 - normalCdf(critical - nonCentrality) + normalCdf(-critical - nonCentrality), 0, 1);
}

function studentTCdf(value, degreesOfFreedom) {
  if (!Number.isFinite(value) || !(degreesOfFreedom > 0)) return NaN;
  const x = degreesOfFreedom / (degreesOfFreedom + value * value);
  const beta = regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5);
  return value >= 0 ? 1 - beta / 2 : beta / 2;
}

function studentTQuantile(probability, degreesOfFreedom) {
  if (!(probability > 0 && probability < 1) || !(degreesOfFreedom > 0)) return NaN;
  if (probability === 0.5) return 0;
  const sign = probability < 0.5 ? -1 : 1;
  const target = probability < 0.5 ? 1 - probability : probability;
  let low = 0;
  let high = 1;
  while (studentTCdf(high, degreesOfFreedom) < target && high < 1e6) high *= 2;
  for (let index = 0; index < 80; index += 1) {
    const middle = (low + high) / 2;
    if (studentTCdf(middle, degreesOfFreedom) < target) low = middle;
    else high = middle;
  }
  return sign * (low + high) / 2;
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return front * betaContinuedFraction(x, a, b) / a;
  return 1 - front * betaContinuedFraction(1 - x, b, a) / b;
}

function betaContinuedFraction(x, a, b) {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const floor = 1e-300;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let result = d;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const even = iteration * 2;
    let aa = iteration * (b - iteration) * x / ((qam + even) * (a + even));
    d = 1 + aa * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + aa / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    result *= d * c;
    aa = -(a + iteration) * (qab + iteration) * x / ((a + even) * (qap + even));
    d = 1 + aa * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + aa / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return result;
}

function logGamma(value) {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  let shifted = value - 1;
  let accumulator = 0.9999999999998099;
  coefficients.forEach((coefficient, index) => {
    accumulator += coefficient / (shifted + index + 1);
  });
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(accumulator);
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const result = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * result;
}

function normalQuantile(probability) {
  if (!(probability > 0 && probability < 1)) return NaN;
  let low = -8;
  let high = 8;
  for (let index = 0; index < 80; index += 1) {
    const middle = (low + high) / 2;
    if (normalCdf(middle) < probability) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function finiteProbability(value, fallback) {
  const parsed = Number(value);
  return parsed > 0 && parsed < 1 ? parsed : fallback;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

module.exports = {
  analyzeExperimentOutcome,
  compareMeans,
  compareProportions,
  decideExperiment,
  defaultAnalysisPlan,
  studentTCdf,
  studentTQuantile
};

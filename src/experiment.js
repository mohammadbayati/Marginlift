const crypto = require("crypto");
const { defaultAnalysisPlan } = require("./statistics");

const knownGroups = new Set(["control", "push_only", "small_discount", "high_incentive"]);
const randomizedMethods = new Set(["randomized", "deterministic_hash"]);
const defaultOutcomeWindowDays = 30;
const srmAlpha = 0.01;

function buildExperimentRecord(options) {
  const rows = options.rows || [];
  const assignments = rows.map(row => ({
    customerId: row.customerId,
    assignedGroup: row.treatment,
    exposed: Boolean(row.exposed),
    baselineRevenue: Number.isFinite(Number(row.revenue90d)) ? Number(row.revenue90d) : null
  }));
  const duplicateCustomerIds = findDuplicates(assignments.map(item => item.customerId));
  const unknownGroups = [...new Set(assignments
    .map(item => item.assignedGroup)
    .filter(group => !knownGroups.has(group)))];
  const expectedAllocation = countBy(assignments, item => item.assignedGroup);
  const assignmentMethod = normalizeAssignmentMethod(options.assignmentMethod);
  const createdAt = options.createdAt || new Date().toISOString();

  return {
    id: options.id,
    organizationId: options.organizationId,
    customerAnalysisId: options.customerAnalysisId,
    name: options.name,
    status: duplicateCustomerIds.length || unknownGroups.length ? "blocked" : "draft",
    dataset: {
      hash: hashDataset(options.csvText),
      schemaVersion: "customer-events-v1",
      rowCount: rows.length
    },
    design: {
      randomizationUnit: "customer_id",
      assignmentMethod,
      assignmentMethodFa: assignmentMethodLabel(assignmentMethod),
      expectedAllocation,
      outcomeWindowDays: normalizeWindowDays(options.outcomeWindowDays),
      randomizationEvidence: normalizeRandomizationEvidence(options.randomizationEvidence),
      analysisPlan: {
        ...defaultAnalysisPlan(options.analysisPlan),
        lockedAt: createdAt,
        lockStatus: "locked"
      }
    },
    assignmentIntegrity: {
      passed: duplicateCustomerIds.length === 0 && unknownGroups.length === 0,
      duplicateCustomerIds,
      unknownGroups
    },
    randomizationSeed: options.randomizationSeed || null,
    assignments,
    createdAt,
    updatedAt: createdAt
  };
}

function auditOutcomeRows(experiment, rows, options = {}) {
  const analyzedAt = new Date(options.analyzedAt || new Date().toISOString());
  const assignments = experiment?.assignments || [];
  const assignmentMap = new Map(assignments.map(item => [item.customerId, item]));
  const duplicateCustomerIds = findDuplicates(rows.map(row => row.customerId));
  const unknownCustomerIds = rows
    .map(row => row.customerId)
    .filter(customerId => !assignmentMap.has(customerId));
  const groupMismatches = rows.filter(row => {
    const assignment = assignmentMap.get(row.customerId);
    return assignment && assignment.assignedGroup !== row.assignedGroup;
  }).map(row => row.customerId);
  const unknownGroups = rows
    .filter(row => !knownGroups.has(row.assignedGroup))
    .map(row => row.assignedGroup);
  const invalidFinanceRows = rows.filter(row =>
    !isNonNegative(row.outcomeRevenue) ||
    !isNonNegative(row.actualIncentiveCost) ||
    !isNonNegative(row.actualChannelCost) ||
    !isRate(row.grossMarginRate)
  ).map(row => row.customerId);
  const treatmentRows = rows.filter(row => row.assignedGroup !== "control");
  const invalidExposureRows = treatmentRows
    .filter(row => !isValidDate(row.exposedAt))
    .map(row => row.customerId);
  const contaminatedControlRows = rows
    .filter(row => row.assignedGroup === "control" && isValidDate(row.exposedAt))
    .map(row => row.customerId);
  const fatalIssues = [
    issue("duplicate_outcome", "customer_id تکراری در outcome", duplicateCustomerIds),
    issue("unknown_customer", "customer_id خارج از Experiment Registry", unique(unknownCustomerIds)),
    issue("assignment_mismatch", "عدم تطابق assigned_group با assignment ثبت‌شده", groupMismatches),
    issue("unknown_group", "گروه ناشناخته در outcome", unique(unknownGroups)),
    issue("invalid_finance", "درآمد، هزینه یا margin نامعتبر", invalidFinanceRows),
    issue("missing_exposure_at", "زمان exposure برای treatment نامعتبر یا خالی", invalidExposureRows)
  ].filter(item => item.items.length);

  const coverage = assignments.length > 0 ? rows.length / assignments.length : 0;
  const coveragePassed = assignments.length > 0 && coverage >= 0.95 && coverage <= 1;
  const window = evaluateOutcomeWindow(treatmentRows, experiment?.design?.outcomeWindowDays, analyzedAt);
  const srm = evaluateSrm(experiment?.design?.expectedAllocation || {}, rows);
  const randomizationDeclared = randomizedMethods.has(experiment?.design?.assignmentMethod) &&
    experiment?.design?.randomizationEvidence?.verified === true;
  const prospectiveRegistration = evaluateProspectiveRegistration(experiment, treatmentRows);
  const assignmentIntegrityPassed = Boolean(experiment?.assignmentIntegrity?.passed);
  const controlsPresent = rows.some(row => row.assignedGroup === "control");
  const treatmentsPresent = treatmentRows.length > 0;
  const decisionEligible = fatalIssues.length === 0 &&
    assignmentIntegrityPassed &&
    randomizationDeclared &&
    prospectiveRegistration.passed &&
    coveragePassed &&
    window.passed &&
    srm.passed &&
    contaminatedControlRows.length === 0 &&
    controlsPresent &&
    treatmentsPresent;

  return {
    status: fatalIssues.length ? "rejected" : decisionEligible ? "pass" : "needs_review",
    statusFa: fatalIssues.length
      ? "قرارداد outcome رد شد"
      : decisionEligible ? "گیت سلامت اولیه عبور کرد" : "نتیجه فقط برای بازبینی توصیفی",
    fatal: fatalIssues.length > 0,
    decisionEligible,
    experimentId: experiment?.id || null,
    datasetHash: experiment?.dataset?.hash || null,
    analyzedAt: analyzedAt.toISOString(),
    summary: {
      assignmentRows: assignments.length,
      outcomeRows: rows.length,
      coverage: roundFour(coverage),
      duplicateCount: duplicateCustomerIds.length,
      unknownCustomerCount: unique(unknownCustomerIds).length,
      mismatchCount: groupMismatches.length,
      contaminatedControlCount: contaminatedControlRows.length,
      srmPValue: srm.pValue
    },
    checks: [
      check("experiment_link", "اتصال به Experiment Registry", Boolean(experiment?.id), experiment?.id || "آزمایش پیدا نشد"),
      check("assignment_integrity", "یکتایی assignment", assignmentIntegrityPassed, assignmentIntegrityPassed ? "assignment یکتا است" : "assignment تکراری یا گروه ناشناخته دارد"),
      check("randomization", "روش randomization", randomizationDeclared, experiment?.design?.assignmentMethodFa || "اعلام نشده"),
      check("preregistration", "ثبت Analysis Plan پیش از exposure", prospectiveRegistration.passed, prospectiveRegistration.detailFa),
      check("outcome_uniqueness", "یکتایی outcome", duplicateCustomerIds.length === 0, duplicateCustomerIds.length ? `${duplicateCustomerIds.length} شناسه تکراری` : "بدون تکرار"),
      check("assignment_linkage", "تطابق outcome و assignment", unknownCustomerIds.length === 0 && groupMismatches.length === 0, `${unique(unknownCustomerIds).length} ناشناخته / ${groupMismatches.length} عدم تطابق`),
      check("exposure", "ثبت exposure درمان", invalidExposureRows.length === 0, invalidExposureRows.length ? `${invalidExposureRows.length} ردیف ناقص` : "موجود"),
      check("control_contamination", "عدم مواجهه گروه کنترل", contaminatedControlRows.length === 0, contaminatedControlRows.length ? `${contaminatedControlRows.length} کنترل مواجهه‌دیده` : "سالم"),
      check("outcome_coverage", "پوشش outcome", coveragePassed, `${Math.round(coverage * 100)}٪ از assignmentها`),
      check("outcome_window", "بسته‌شدن پنجره outcome", window.passed, window.detailFa),
      check("srm", "Sample Ratio Mismatch", srm.passed, srm.detailFa),
      check("finance_contract", "مقادیر مالی معتبر", invalidFinanceRows.length === 0, invalidFinanceRows.length ? `${invalidFinanceRows.length} ردیف نامعتبر` : "غیرمنفی و margin معتبر")
    ],
    fatalIssues
  };
}

function toPublicExperiment(experiment) {
  if (!experiment) return null;
  return {
    id: experiment.id,
    customerAnalysisId: experiment.customerAnalysisId,
    name: experiment.name,
    status: experiment.status,
    statusFa: experimentStatusLabel(experiment.status),
    dataset: experiment.dataset,
    design: experiment.design,
    assignmentIntegrity: {
      passed: Boolean(experiment.assignmentIntegrity?.passed),
      duplicateCount: experiment.assignmentIntegrity?.duplicateCustomerIds?.length || 0,
      unknownGroups: experiment.assignmentIntegrity?.unknownGroups || []
    },
    assignmentSummary: {
      total: experiment.assignments?.length || 0,
      groups: experiment.design?.expectedAllocation || {}
    },
    acceptsOutcome: !["blocked", "demo_only"].includes(experiment.status),
    createdAt: experiment.createdAt
  };
}

function experimentStatusLabel(status) {
  if (status === "blocked") return "نیازمند اصلاح assignment";
  if (status === "demo_only") return "نمونه نمایشی؛ outcome واقعی پذیرفته نمی‌شود";
  if (status === "outcome_received") return "Outcome نسخه‌دار دریافت شده";
  if (status === "registered") return "پایلوت prospective ثبت و قفل شده است";
  return "ثبت‌شده؛ روش تخصیص باید پیش از اجرا تأیید شود";
}

function hashDataset(csvText) {
  const normalized = String(csvText || "").replace(/\r\n/g, "\n").trim();
  return `sha256:${crypto.createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

function evaluateProspectiveRegistration(experiment, treatmentRows) {
  const lockedAt = new Date(experiment?.design?.analysisPlan?.lockedAt || "");
  const exposureDates = treatmentRows
    .map(row => new Date(row.exposedAt))
    .filter(date => !Number.isNaN(date.getTime()));
  if (Number.isNaN(lockedAt.getTime())) {
    return { passed: false, detailFa: "زمان قفل‌شدن Analysis Plan ثبت نشده است" };
  }
  if (!exposureDates.length) {
    return { passed: false, detailFa: "زمان exposure معتبر برای مقایسه وجود ندارد" };
  }
  const firstExposure = new Date(Math.min(...exposureDates.map(date => date.getTime())));
  const passed = lockedAt.getTime() <= firstExposure.getTime();
  return {
    passed,
    detailFa: passed
      ? `Plan در ${lockedAt.toISOString()} و پیش از نخستین exposure قفل شده است`
      : `Plan پس از نخستین exposure در ${firstExposure.toISOString()} ثبت شده است`
  };
}

function evaluateOutcomeWindow(rows, windowDays, analyzedAt) {
  if (!rows.length) return { passed: false, detailFa: "treatment وجود ندارد" };
  const dates = rows.map(row => new Date(row.exposedAt)).filter(date => !Number.isNaN(date.getTime()));
  if (dates.length !== rows.length) return { passed: false, detailFa: "exposure_at ناقص است" };
  const latestExposure = new Date(Math.max(...dates.map(date => date.getTime())));
  const days = normalizeWindowDays(windowDays);
  const closesAt = new Date(latestExposure.getTime() + days * 24 * 60 * 60 * 1000);
  const passed = analyzedAt >= closesAt;
  return {
    passed,
    closesAt: closesAt.toISOString(),
    detailFa: passed ? `پنجره ${days}روزه بسته شده است` : `پنجره ${days}روزه تا ${closesAt.toISOString().slice(0, 10)} باز است`
  };
}

function evaluateSrm(expectedAllocation, rows) {
  const groups = Object.keys(expectedAllocation).filter(group => expectedAllocation[group] > 0);
  const expectedTotal = groups.reduce((sum, group) => sum + expectedAllocation[group], 0);
  if (groups.length < 2 || expectedTotal <= 0 || rows.length === 0) {
    return { passed: false, pValue: null, detailFa: "نسبت مورد انتظار گروه‌ها موجود نیست" };
  }
  const observed = countBy(rows, row => row.assignedGroup);
  const expectedCounts = groups.map(group => rows.length * expectedAllocation[group] / expectedTotal);
  if (expectedCounts.some(value => value < 5)) {
    return { passed: false, pValue: null, detailFa: "نمونه برای آزمون SRM کافی نیست" };
  }
  const chiSquare = groups.reduce((sum, group, index) => {
    const expected = expectedCounts[index];
    const actual = observed[group] || 0;
    return sum + Math.pow(actual - expected, 2) / expected;
  }, 0);
  const pValue = chiSquareSurvival(chiSquare, groups.length - 1);
  const passed = pValue >= srmAlpha;
  return {
    passed,
    pValue: roundFour(pValue),
    chiSquare: roundFour(chiSquare),
    detailFa: passed ? `سالم؛ p=${roundFour(pValue)}` : `Mismatch؛ p=${roundFour(pValue)}`
  };
}

function chiSquareSurvival(value, degreesOfFreedom) {
  const z = Math.sqrt(Math.max(0, value) / 2);
  if (degreesOfFreedom === 1) return erfc(z);
  if (degreesOfFreedom === 2) return Math.exp(-value / 2);
  if (degreesOfFreedom === 3) return erfc(z) + 2 / Math.sqrt(Math.PI) * z * Math.exp(-z * z);
  return 0;
}

function erfc(value) {
  const z = Math.abs(value);
  const t = 1 / (1 + z / 2);
  const approximation = t * Math.exp(
    -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277))))))))
  );
  return value >= 0 ? approximation : 2 - approximation;
}

function countBy(rows, selector) {
  return rows.reduce((counts, row) => {
    const key = selector(row);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function findDuplicates(values) {
  const counts = values.reduce((result, value) => {
    result.set(value, (result.get(value) || 0) + 1);
    return result;
  }, new Map());
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function normalizeAssignmentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["randomized", "deterministic_hash", "observed_historical"].includes(normalized)
    ? normalized
    : "observed_historical";
}

function normalizeRandomizationEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") {
    return { verified: false, source: "unverified_declaration" };
  }
  return {
    verified: evidence.verified === true && evidence.source === "server_generated",
    source: evidence.source === "server_generated" ? "server_generated" : "unverified_declaration",
    algorithm: String(evidence.algorithm || ""),
    seedHash: String(evidence.seedHash || ""),
    populationHash: String(evidence.populationHash || ""),
    generatedAt: String(evidence.generatedAt || ""),
    holdoutRate: Number.isFinite(Number(evidence.holdoutRate)) ? Number(evidence.holdoutRate) : null
  };
}

function assignmentMethodLabel(method) {
  if (method === "randomized") return "تخصیص تصادفی ثبت‌شده";
  if (method === "deterministic_hash") return "تخصیص پایدار مبتنی بر hash";
  return "تخصیص تاریخی؛ randomization اعلام نشده";
}

function normalizeWindowDays(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 180 ? parsed : defaultOutcomeWindowDays;
}

function issue(key, messageFa, items) {
  return { key, messageFa, items };
}

function check(key, labelFa, passed, detailFa) {
  return { key, labelFa, passed: Boolean(passed), detailFa };
}

function isNonNegative(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function isRate(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1;
}

function isValidDate(value) {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function unique(values) {
  return [...new Set(values)];
}

function roundFour(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

module.exports = {
  auditOutcomeRows,
  buildExperimentRecord,
  evaluateSrm,
  hashDataset,
  toPublicExperiment
};

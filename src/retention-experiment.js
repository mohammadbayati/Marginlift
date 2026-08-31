const crypto = require("crypto");
const { evaluateSrm } = require("./experiment");
const { evidenceMeta, resolveRetentionEvidence } = require("./evidence");
const { parseIranianDate, parseIranianNumber } = require("./iran-data");

const POLICIES = new Set(["current_crm_policy", "marginlift_policy"]);
const ACTIONS = new Set(["no_action", "message_no_discount", "targeted_discount"]);

function buildRetentionExperiment(options = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  const seed = String(options.seed || crypto.randomBytes(32).toString("hex"));
  const analysis = options.analysis || {};
  const decisions = analysis.decisionQueue || analysis.workspace?.queue || [];
  const customers = [...new Set(decisions.map(item => item.customerIdHash).filter(Boolean))].sort();
  const assignments = customers.map(customerIdHash => ({
    customerIdHash,
    assignedPolicy: stableArm(seed, customerIdHash),
    assignedAt: createdAt
  }));
  const expectedAllocation = countBy(assignments, item => item.assignedPolicy);
  const populationHash = sha256(customers.join("\n"));
  const metricContract = options.metricContract || {};

  return {
    id: options.id,
    organizationId: options.organizationId,
    sourceType: "retention_analysis",
    sourceId: analysis.id,
    retentionAnalysisId: analysis.id,
    metricContractId: metricContract.id,
    metricContractVersion: metricContract.version,
    name: clean(options.name) || "پایلوت سیاست نگهداشت MarginLift",
    status: assignments.length ? "registered" : "blocked",
    design: {
      comparison: ["current_crm_policy", "marginlift_policy"],
      randomizationUnit: "customer_id_hash",
      assignmentMethod: "deterministic_hash",
      expectedAllocation,
      outcomeWindowDays: Number(metricContract.outcomeWindowDays || 30),
      primaryMetric: metricContract.primaryMetric,
      primaryMetricFa: metricContract.primaryMetricFa,
      analysisMethod: "intention_to_treat",
      analysisPlan: {
        version: `retention-plan-v${metricContract.version || 1}`,
        lockedAt: createdAt,
        lockStatus: "locked",
        followupWindowsDays: metricContract.followupWindowsDays || [90, 180]
      },
      randomizationEvidence: {
        verified: true,
        source: "server_generated",
        algorithm: "sha256_mod_2",
        seedHash: sha256(seed),
        populationHash,
        generatedAt: createdAt
      }
    },
    prerequisites: {
      metricContractLocked: metricContract.status === "locked",
      healthyShadowRunIds: (options.shadowRuns || []).map(item => item.id)
    },
    assignmentIntegrity: {
      passed: assignments.length > 0 && new Set(assignments.map(item => item.customerIdHash)).size === assignments.length,
      duplicateCustomerIds: []
    },
    assignments,
    randomizationSeed: seed,
    createdAt,
    updatedAt: createdAt
  };
}

function normalizeRetentionOutcomeRows(rows = []) {
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    customerIdHash: clean(pick(row, "customer_id_hash", "customerIdHash")),
    assignedPolicy: clean(pick(row, "assigned_policy", "assignedPolicy")),
    actualAction: clean(pick(row, "actual_action", "actualAction")) || "no_action",
    assignedAt: normalizedDateText(pick(row, "assigned_at", "assignedAt")),
    deliveredAt: normalizedOptionalDateText(pick(row, "delivered_at", "deliveredAt")),
    exposedAt: normalizedOptionalDateText(pick(row, "exposed_at", "exposedAt")),
    outcomeAt: normalizedDateText(pick(row, "outcome_at", "outcomeAt")),
    repurchased: parseBoolean(pick(row, "repurchased", "converted")),
    netRevenue: parseNonNegative(pick(row, "net_revenue", "outcome_revenue", "netRevenue")),
    contributionMargin: parseNonNegative(pick(row, "contribution_margin", "contributionMargin")),
    incentiveCost: parseNonNegative(pick(row, "incentive_cost", "actual_incentive_cost", "incentiveCost")),
    channelCost: parseNonNegative(pick(row, "channel_cost", "actual_channel_cost", "channelCost")),
    refundAmount: parseNonNegative(pick(row, "refund_amount", "refundAmount")),
    optOut: parseBoolean(pick(row, "opt_out", "optOut")),
    complaint: parseBoolean(pick(row, "complaint"))
  }));
}

function auditRetentionOutcome(experiment, rows, options = {}) {
  const assignments = experiment?.assignments || [];
  const assignmentMap = new Map(assignments.map(item => [item.customerIdHash, item]));
  const duplicateIds = duplicates(rows.map(item => item.customerIdHash));
  const unknownIds = unique(rows.filter(item => !assignmentMap.has(item.customerIdHash)).map(item => item.customerIdHash));
  const policyMismatches = rows.filter(item => assignmentMap.get(item.customerIdHash)?.assignedPolicy !== item.assignedPolicy).map(item => item.customerIdHash);
  const unknownPolicies = unique(rows.filter(item => !POLICIES.has(item.assignedPolicy)).map(item => item.assignedPolicy));
  const unknownActions = unique(rows.filter(item => !ACTIONS.has(item.actualAction)).map(item => item.actualAction));
  const invalidDates = rows.filter(item => !validDate(item.assignedAt) || !validDate(item.outcomeAt)).map(item => item.customerIdHash);
  const invalidFinance = rows.filter(item => [item.netRevenue, item.contributionMargin, item.incentiveCost, item.channelCost, item.refundAmount].some(value => value === null)).map(item => item.customerIdHash);
  const missingIds = assignments.filter(item => !rows.some(row => row.customerIdHash === item.customerIdHash)).map(item => item.customerIdHash);
  const coverage = assignments.length ? rows.length / assignments.length : 0;
  const coveragePassed = coverage >= 0.95 && coverage <= 1 && missingIds.length <= Math.ceil(assignments.length * 0.05);
  const srm = evaluateSrm(
    experiment?.design?.expectedAllocation || {},
    rows.map(item => ({ assignedGroup: item.assignedPolicy }))
  );
  const closesAt = new Date(new Date(experiment?.createdAt || 0).getTime() + Number(experiment?.design?.outcomeWindowDays || 30) * 86400000);
  const analyzedAt = new Date(options.analyzedAt || new Date().toISOString());
  const windowPassed = validDate(closesAt.toISOString()) && analyzedAt >= closesAt;
  const prospective = rows.every(item => new Date(item.assignedAt) >= new Date(experiment?.design?.analysisPlan?.lockedAt || 0));
  const fatalIssues = [
    issue("duplicate_outcome", "شناسه مشتری در Outcome تکراری است.", duplicateIds),
    issue("unknown_customer", "شناسه مشتری در Assignment ثبت نشده است.", unknownIds),
    issue("assignment_mismatch", "سیاست تخصیص‌یافته با Registry تطابق ندارد.", policyMismatches),
    issue("unknown_policy", "سیاست ناشناخته است.", unknownPolicies),
    issue("unknown_action", "اقدام اجراشده ناشناخته است.", unknownActions),
    issue("invalid_date", "زمان تخصیص یا Outcome نامعتبر است.", invalidDates),
    issue("invalid_finance", "مقادیر مالی باید موجود و غیرمنفی باشند.", invalidFinance)
  ].filter(item => item.items.length);
  const decisionEligible = fatalIssues.length === 0 &&
    Boolean(experiment?.assignmentIntegrity?.passed) &&
    experiment?.design?.randomizationEvidence?.verified === true &&
    prospective && coveragePassed && windowPassed && srm.passed;

  return {
    status: fatalIssues.length ? "rejected" : decisionEligible ? "pass" : "needs_review",
    statusFa: fatalIssues.length ? "قرارداد Outcome رد شد" : decisionEligible ? "گیت سلامت آزمایش عبور کرد" : "نیازمند بازبینی سلامت آزمایش",
    fatal: fatalIssues.length > 0,
    decisionEligible,
    analyzedAt: analyzedAt.toISOString(),
    summary: {
      assignmentRows: assignments.length,
      outcomeRows: rows.length,
      coverage: round(coverage, 4),
      missingOutcomeCount: missingIds.length,
      srmPValue: srm.pValue,
      closesAt: closesAt.toISOString()
    },
    checks: [
      check("assignment_integrity", "یکتایی Assignment", Boolean(experiment?.assignmentIntegrity?.passed)),
      check("randomization", "تخصیص سمت سرور", experiment?.design?.randomizationEvidence?.verified === true),
      check("preregistration", "قفل Plan پیش از تخصیص", prospective),
      check("outcome_coverage", "پوشش Outcome حداقل ۹۵٪", coveragePassed),
      check("outcome_window", "بسته‌شدن پنجره ۳۰روزه", windowPassed),
      check("srm", "سلامت نسبت نمونه", srm.passed),
      check("finance_contract", "کامل‌بودن مقادیر مالی", invalidFinance.length === 0)
    ],
    fatalIssues
  };
}

function analyzeRetentionOutcome(experiment, rows, integrity, options = {}) {
  const arms = Object.fromEntries([...POLICIES].map(policy => [policy, summarizeArm(rows.filter(item => item.assignedPolicy === policy))]));
  const current = arms.current_crm_policy;
  const marginlift = arms.marginlift_policy;
  const estimate = marginlift.meanContributionProfit - current.meanContributionProfit;
  const standardError = Math.sqrt(varianceOfMean(marginlift) + varianceOfMean(current));
  const interval = {
    lower: round(estimate - 1.96 * standardError, 2),
    upper: round(estimate + 1.96 * standardError, 2)
  };
  const decision = !integrity.decisionEligible
    ? "needs_review"
    : interval.lower > 0 ? "provisional_scale_candidate" : estimate < 0 ? "stop" : "needs_review";
  const outcome = {
    experimentId: experiment.id,
    sourceType: "retention_analysis",
    sourceId: experiment.sourceId,
    metricContractId: experiment.metricContractId,
    evidenceLevel: "pilot_estimate",
    evidenceLabelFa: evidenceMeta("pilot_estimate").labelFa,
    integrity,
    summary: {
      primaryMetric: experiment.design.primaryMetric,
      primaryMetricFa: experiment.design.primaryMetricFa,
      incrementalContributionProfitPerAssignedCustomer: round(estimate, 2),
      confidenceInterval95: interval,
      incrementalNetRevenuePerAssignedCustomer: round(marginlift.meanNetRevenue - current.meanNetRevenue, 2),
      incrementalRepurchaseRate: round(marginlift.repurchaseRate - current.repurchaseRate, 4),
      financeVerificationStatus: options.financeVerificationStatus || "pending",
      decision,
      decisionFa: decisionLabel(decision)
    },
    arms
  };
  outcome.evidenceLevel = resolveRetentionEvidence({ outcome });
  outcome.evidenceLabelFa = evidenceMeta(outcome.evidenceLevel).labelFa;
  return outcome;
}

function verifyRetentionFinance(outcome, verification = {}) {
  if (!outcome?.integrity?.decisionEligible) throw new Error("تا عبور گیت سلامت آزمایش، تطبیق مالی قابل تأیید نیست.");
  const reasonFa = clean(verification.reasonFa);
  if (reasonFa.length < 12) throw new Error("یادداشت تطبیق مالی باید حداقل ۱۲ نویسه باشد.");
  const verified = {
    ...outcome,
    financeVerification: {
      reviewerFa: clean(verification.reviewerFa) || "نماینده مالی مشتری",
      reasonFa,
      actorId: verification.actorId || null,
      verifiedAt: new Date().toISOString()
    },
    summary: { ...outcome.summary, financeVerificationStatus: "verified" }
  };
  verified.evidenceLevel = resolveRetentionEvidence({ outcome: verified });
  verified.evidenceLabelFa = evidenceMeta(verified.evidenceLevel).labelFa;
  return verified;
}

function publicRetentionExperiment(experiment) {
  if (!experiment) return null;
  return {
    id: experiment.id,
    sourceType: experiment.sourceType,
    sourceId: experiment.sourceId,
    name: experiment.name,
    status: experiment.status,
    metricContractId: experiment.metricContractId,
    metricContractVersion: experiment.metricContractVersion,
    design: experiment.design,
    prerequisites: experiment.prerequisites,
    assignmentIntegrity: experiment.assignmentIntegrity,
    assignmentSummary: { total: experiment.assignments.length, groups: experiment.design.expectedAllocation },
    createdAt: experiment.createdAt
  };
}

function retentionAssignmentCsv(experiment) {
  const headers = ["experiment_id", "customer_id_hash", "assigned_policy", "assigned_at", "analysis_plan_version"];
  const lines = [headers.join(",")];
  experiment.assignments.forEach(item => lines.push([
    experiment.id, item.customerIdHash, item.assignedPolicy, item.assignedAt, experiment.design.analysisPlan.version
  ].map(csvCell).join(",")));
  return `\uFEFF${lines.join("\n")}\n`;
}

function summarizeArm(rows) {
  const profits = rows.map(item => item.contributionMargin - item.incentiveCost - item.channelCost - item.refundAmount);
  const revenues = rows.map(item => item.netRevenue);
  const count = rows.length;
  return {
    assignedCustomers: count,
    meanContributionProfit: round(mean(profits), 2),
    meanNetRevenue: round(mean(revenues), 2),
    repurchaseRate: round(count ? rows.filter(item => item.repurchased).length / count : 0, 4),
    totalIncentiveCost: round(rows.reduce((sum, item) => sum + item.incentiveCost, 0), 2),
    totalChannelCost: round(rows.reduce((sum, item) => sum + item.channelCost, 0), 2),
    optOutRate: round(count ? rows.filter(item => item.optOut).length / count : 0, 4),
    complaintRate: round(count ? rows.filter(item => item.complaint).length / count : 0, 4),
    varianceContributionProfit: sampleVariance(profits)
  };
}

function varianceOfMean(arm) {
  return arm.assignedCustomers > 1 ? arm.varianceContributionProfit / arm.assignedCustomers : 0;
}

function stableArm(seed, customerId) {
  const value = parseInt(crypto.createHash("sha256").update(`${seed}:${customerId}`).digest("hex").slice(0, 8), 16);
  return value % 2 === 0 ? "current_crm_policy" : "marginlift_policy";
}

function pick(row, ...keys) {
  for (const key of keys) if (row[key] !== undefined && row[key] !== "") return row[key];
  return "";
}

function parseBoolean(value) {
  return ["1", "true", "yes", "بله"].includes(clean(value).toLowerCase());
}

function parseNonNegative(value) {
  const number = parseIranianNumber(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableText(value) { return clean(value) || null; }
function normalizedDateText(value) { const date = parseIranianDate(value); return date ? date.toISOString() : clean(value); }
function normalizedOptionalDateText(value) { return clean(value) ? normalizedDateText(value) : null; }
function validDate(value) { return Boolean(parseIranianDate(value)); }
function clean(value) { return String(value ?? "").trim(); }
function sha256(value) { return `sha256:${crypto.createHash("sha256").update(String(value)).digest("hex")}`; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function duplicates(values) { const counts = countBy(values, item => item); return Object.keys(counts).filter(key => counts[key] > 1); }
function countBy(rows, selector) { return rows.reduce((acc, row) => { const key = selector(row); acc[key] = (acc[key] || 0) + 1; return acc; }, {}); }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function sampleVariance(values) { if (values.length < 2) return 0; const average = mean(values); return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1); }
function round(value, digits) { const factor = 10 ** digits; return Math.round(Number(value) * factor) / factor; }
function issue(key, messageFa, items) { return { key, messageFa, items }; }
function check(key, labelFa, passed) { return { key, labelFa, passed: Boolean(passed) }; }
function decisionLabel(value) { return ({ provisional_scale_candidate: "نامزد Scale پس از تأیید مالی", needs_review: "نیازمند بازبینی", stop: "توقف سیاست" })[value] || value; }
function csvCell(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

module.exports = {
  analyzeRetentionOutcome,
  auditRetentionOutcome,
  buildRetentionExperiment,
  normalizeRetentionOutcomeRows,
  publicRetentionExperiment,
  retentionAssignmentCsv,
  verifyRetentionFinance
};

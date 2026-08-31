const crypto = require("crypto");
const { evaluateSrm } = require("./experiment");
const { evidenceMeta, resolveRetentionEvidence } = require("./evidence");
const { parseIranianDate, parseIranianNumber } = require("./iran-data");

const POLICIES = new Set(["current_crm_policy", "marginlift_policy"]);
const ACTIONS = new Set(["no_action", "message_no_discount", "targeted_discount"]);

function buildRetentionExperimentAdmission(options = {}) {
  const analysis = options.analysis || null;
  const metricContract = options.metricContract || null;
  const shadowRuns = Array.isArray(options.shadowRuns) ? options.shadowRuns : [];
  const decisions = analysis?.decisionQueue || analysis?.workspace?.queue || [];
  const uniqueCustomers = new Set(decisions.map(item => item.customerIdHash).filter(Boolean)).size;
  const minimumSamplePerPolicy = Number(metricContract?.minimumSamplePerPolicy || 0);
  const stableShadow = shadowRuns.length >= 2 && shadowRuns[0]?.status === "ready" && shadowRuns[1]?.status === "ready" && shadowRuns[0]?.stability?.passed === true;
  const checks = [
    admissionCheck("customer_dataset", "داده واقعی مشتری", Boolean(analysis && analysis.source === "customer_upload" && analysis.isDemoScenario !== true), "فایل نمونه یا سناریوی دمو برای Live Holdout مجاز نیست."),
    admissionCheck("data_readiness", "آمادگی داده", analysis?.readiness?.status === "ready", "وضعیت داده باید ready باشد؛ diagnostic_only فقط برای تحلیل تاریخی است."),
    admissionCheck("dataset_lineage", "Lineage و هش داده", /^sha256:[a-f0-9]{64}$/.test(String(analysis?.datasetHash || "")), "فایل باید از مسیر Preview/Import جدید و با dataset hash معتبر ثبت شود."),
    admissionCheck("configuration_current", "نسخه تنظیمات", options.configurationCurrent !== false, "تنظیمات چرخه پس از تحلیل تغییر کرده و تحلیل باید دوباره اجرا شود."),
    admissionCheck("contact_safety", "قرارداد ایمنی تماس", analysis?.contactSafety?.contractReady === true, "رضایت، عدم تماس، کانال ترجیحی و سقف تماس باید کامل باشد."),
    admissionCheck("metric_contract", "Metric Contract قفل‌شده", metricContract?.status === "locked", "قرارداد باید با تأیید CRM، Data و Finance قفل شود."),
    admissionCheck("shadow_stability", "دو Shadow Run پایدار", stableShadow, "دو اجرای متوالی ready با منبع و policy یکسان لازم است."),
    admissionCheck("sample_support", "کف نمونه مصوب", minimumSamplePerPolicy >= 2 && uniqueCustomers >= minimumSamplePerPolicy * 2, `حداقل ${minimumSamplePerPolicy || "نامشخص"} مشتری در هر سیاست لازم است؛ جمعیت فعلی ${uniqueCustomers} نفر است.`)
  ];
  return {
    ready: checks.every(item => item.passed),
    checks,
    blockersFa: checks.filter(item => !item.passed).map(item => item.detailFa),
    population: { uniqueCustomers, minimumSamplePerPolicy, requiredTotal: minimumSamplePerPolicy >= 2 ? minimumSamplePerPolicy * 2 : null }
  };
}

function buildRetentionExperiment(options = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  const seed = String(options.seed || crypto.randomBytes(32).toString("hex"));
  const analysis = options.analysis || {};
  const decisions = analysis.decisionQueue || analysis.workspace?.queue || [];
  const customers = [...new Set(decisions.map(item => item.customerIdHash).filter(Boolean))].sort();
  const randomizedCustomers = [...customers].sort((left, right) => stableHash(seed, left).localeCompare(stableHash(seed, right)));
  const assignments = randomizedCustomers.map((customerIdHash, index) => ({
    assignmentId: `rasg_${sha256(`${seed}:${customerIdHash}`).replace("sha256:", "").slice(0, 24)}`,
    customerIdHash,
    assignedPolicy: index % 2 === 0 ? "current_crm_policy" : "marginlift_policy",
    assignedAt: createdAt
  }));
  const expectedAllocation = countBy(assignments, item => item.assignedPolicy);
  const populationHash = sha256(customers.join("\n"));
  const metricContract = options.metricContract || {};
  const outcomeWindowDays = Number(metricContract.outcomeWindowDays || 30);
  const outcomeClosesAt = new Date(new Date(createdAt).getTime() + outcomeWindowDays * 86400000).toISOString();
  const minimumSamplePerPolicy = Number(metricContract.minimumSamplePerPolicy || 0);
  const sampleSupportPassed = minimumSamplePerPolicy >= 2 && [...POLICIES].every(policy => Number(expectedAllocation[policy] || 0) >= minimumSamplePerPolicy);
  const assignmentRegistryHash = sha256(assignments.map(item => [item.assignmentId, item.customerIdHash, item.assignedPolicy, item.assignedAt].join("|")).join("\n"));

  return {
    id: options.id,
    organizationId: options.organizationId,
    sourceType: "retention_analysis",
    sourceId: analysis.id,
    retentionAnalysisId: analysis.id,
    metricContractId: metricContract.id,
    metricContractVersion: metricContract.version,
    name: clean(options.name) || "پایلوت سیاست نگهداشت MarginLift",
    status: assignments.length && sampleSupportPassed ? "registered" : "blocked",
    design: {
      comparison: ["current_crm_policy", "marginlift_policy"],
      randomizationUnit: "customer_id_hash",
      assignmentMethod: "deterministic_hash_blocked_1_1",
      expectedAllocation,
      outcomeWindowDays,
      outcomeClosesAt,
      minimumSamplePerPolicy,
      primaryMetric: metricContract.primaryMetric,
      primaryMetricFa: metricContract.primaryMetricFa,
      analysisMethod: "intention_to_treat",
      analysisPlan: {
        version: `retention-plan-v${metricContract.version || 1}`,
        lockedAt: createdAt,
        lockStatus: "locked",
        followupWindowsDays: metricContract.followupWindowsDays || [90, 180]
      },
      decisionRules: normalizeDecisionRules(metricContract.decisionRules),
      randomizationEvidence: {
        verified: true,
        source: "server_generated",
        algorithm: "sha256_rank_then_alternate",
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
      passed: assignments.length > 0 && sampleSupportPassed && new Set(assignments.map(item => item.customerIdHash)).size === assignments.length,
      lockStatus: "locked",
      lockedAt: createdAt,
      registryHash: assignmentRegistryHash,
      populationHash,
      sampleSupportPassed,
      minimumSamplePerPolicy,
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
    complaint: parseBoolean(pick(row, "complaint")),
    contaminated: parseNullableBoolean(pick(row, "contaminated", "campaign_overlap"))
  }));
}

function auditRetentionOutcome(experiment, rows, options = {}) {
  const assignments = experiment?.assignments || [];
  const assignmentMap = new Map(assignments.map(item => [item.customerIdHash, item]));
  const missingCustomerIds = rows.filter(item => !item.customerIdHash).map(item => item.rowNumber);
  const duplicateIds = duplicates(rows.map(item => item.customerIdHash));
  const unknownIds = unique(rows.filter(item => !assignmentMap.has(item.customerIdHash)).map(item => item.customerIdHash));
  const policyMismatches = rows.filter(item => assignmentMap.get(item.customerIdHash)?.assignedPolicy !== item.assignedPolicy).map(item => item.customerIdHash);
  const assignmentTimeMismatches = rows.filter(item => {
    const registered = assignmentMap.get(item.customerIdHash)?.assignedAt;
    return registered && validDate(item.assignedAt) && new Date(registered).getTime() !== new Date(item.assignedAt).getTime();
  }).map(item => item.customerIdHash);
  const unknownPolicies = unique(rows.filter(item => !POLICIES.has(item.assignedPolicy)).map(item => item.assignedPolicy));
  const unknownActions = unique(rows.filter(item => !ACTIONS.has(item.actualAction)).map(item => item.actualAction));
  const invalidDates = rows.filter(item => !validDate(item.assignedAt) || !validDate(item.outcomeAt) || !validOptionalDate(item.deliveredAt) || !validOptionalDate(item.exposedAt)).map(item => item.customerIdHash || `row_${item.rowNumber}`);
  const invalidFinance = rows.filter(item => [item.netRevenue, item.contributionMargin, item.incentiveCost, item.channelCost, item.refundAmount].some(value => value === null)).map(item => item.customerIdHash);
  const missingIds = assignments.filter(item => !rows.some(row => row.customerIdHash === item.customerIdHash)).map(item => item.customerIdHash);
  const knownUniqueRows = new Set(rows.filter(item => assignmentMap.has(item.customerIdHash)).map(item => item.customerIdHash)).size;
  const coverage = assignments.length ? knownUniqueRows / assignments.length : 0;
  const coveragePassed = coverage >= 0.95 && coverage <= 1 && missingIds.length <= Math.ceil(assignments.length * 0.05);
  const srm = evaluateSrm(
    experiment?.design?.expectedAllocation || {},
    rows.map(item => ({ assignedGroup: item.assignedPolicy }))
  );
  const observedAllocation = countBy(rows, item => item.assignedPolicy);
  const allocationExact = [...POLICIES].every(policy => Number(observedAllocation[policy] || 0) === Number(experiment?.design?.expectedAllocation?.[policy] || 0));
  const srmPassed = allocationExact || srm.passed;
  const closesAt = new Date(experiment?.design?.outcomeClosesAt || new Date(new Date(experiment?.createdAt || 0).getTime() + Number(experiment?.design?.outcomeWindowDays || 30) * 86400000));
  const analyzedAt = new Date(options.analyzedAt || new Date().toISOString());
  const windowPassed = validDate(closesAt.toISOString()) && analyzedAt >= closesAt;
  const prospective = rows.every(item => validDate(item.assignedAt) && new Date(item.assignedAt) >= new Date(experiment?.design?.analysisPlan?.lockedAt || 0));
  const outOfWindowOutcomes = rows.filter(item => validDate(item.assignedAt) && validDate(item.outcomeAt) && (
    new Date(item.outcomeAt) < new Date(item.assignedAt) || new Date(item.outcomeAt) > closesAt
  )).map(item => item.customerIdHash);
  const invalidExposureTimeline = rows.filter(item => [item.deliveredAt, item.exposedAt].filter(Boolean).some(value => validDate(value) && (
    new Date(value) < new Date(item.assignedAt) || new Date(value) > closesAt
  ))).map(item => item.customerIdHash);
  const invalidExposureOrder = rows.filter(item => item.deliveredAt && item.exposedAt && validDate(item.deliveredAt) && validDate(item.exposedAt) && new Date(item.exposedAt) < new Date(item.deliveredAt)).map(item => item.customerIdHash);
  const registryHashPassed = experiment?.assignmentIntegrity?.lockStatus === "locked" && experiment?.assignmentIntegrity?.registryHash === assignmentRegistryHash(assignments);
  const sampleSupportPassed = experiment?.assignmentIntegrity?.sampleSupportPassed === true;
  const contaminationPassed = rows.length > 0 && rows.every(item => item.contaminated === false);
  const fatalIssues = [
    issue("missing_customer_id", "شناسه هش‌شده مشتری در Outcome الزامی است.", missingCustomerIds),
    issue("duplicate_outcome", "شناسه مشتری در Outcome تکراری است.", duplicateIds),
    issue("unknown_customer", "شناسه مشتری در Assignment ثبت نشده است.", unknownIds),
    issue("assignment_mismatch", "سیاست تخصیص‌یافته با Registry تطابق ندارد.", policyMismatches),
    issue("assignment_time_mismatch", "زمان تخصیص با Registry قفل‌شده تطابق ندارد.", assignmentTimeMismatches),
    issue("unknown_policy", "سیاست ناشناخته است.", unknownPolicies),
    issue("unknown_action", "اقدام اجراشده ناشناخته است.", unknownActions),
    issue("invalid_date", "زمان تخصیص، تماس یا Outcome نامعتبر است.", invalidDates),
    issue("outcome_outside_window", "Outcome باید از زمان تخصیص تا پایان پنجره ۳۰روزه ثبت شود.", outOfWindowOutcomes),
    issue("exposure_outside_window", "Delivery و Exposure باید داخل پنجره Outcome باشند.", invalidExposureTimeline),
    issue("exposure_before_delivery", "Exposure نمی‌تواند پیش از Delivery ثبت شود.", invalidExposureOrder),
    issue("invalid_finance", "مقادیر مالی باید موجود و غیرمنفی باشند.", invalidFinance)
  ].filter(item => item.items.length);
  const decisionEligible = fatalIssues.length === 0 &&
    Boolean(experiment?.assignmentIntegrity?.passed) && registryHashPassed && sampleSupportPassed &&
    experiment?.design?.randomizationEvidence?.verified === true &&
    prospective && coveragePassed && windowPassed && srmPassed && contaminationPassed;

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
      contaminatedOutcomeCount: rows.filter(item => item.contaminated === true).length,
      missingContaminationEvidenceCount: rows.filter(item => item.contaminated === null).length,
      closesAt: closesAt.toISOString()
    },
    checks: [
      check("assignment_integrity", "یکتایی Assignment", Boolean(experiment?.assignmentIntegrity?.passed)),
      check("assignment_registry", "Registry قفل‌شده و بدون تغییر", registryHashPassed),
      check("sample_support", "کف نمونه هر سیاست", sampleSupportPassed),
      check("randomization", "تخصیص سمت سرور", experiment?.design?.randomizationEvidence?.verified === true),
      check("preregistration", "قفل Plan پیش از تخصیص", prospective),
      check("outcome_coverage", "پوشش Outcome حداقل ۹۵٪", coveragePassed),
      check("outcome_window", "بسته‌شدن پنجره ۳۰روزه", windowPassed),
      check("srm", "سلامت نسبت نمونه", srmPassed),
      check("contamination", "نبود آلودگی کمپین یا سیاست", contaminationPassed),
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
  const guardrails = evaluateGuardrails(current, marginlift, experiment?.design?.decisionRules || {});
  const decision = !integrity.decisionEligible
    ? "needs_review"
    : shouldStop(estimate, guardrails, experiment?.design?.decisionRules) ? "stop" : scaleGatePassed(estimate, interval, guardrails, experiment?.design?.decisionRules) ? "provisional_scale_candidate" : "needs_review";
  const expectedReconciliation = financeTotals(rows);
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
      decisionFa: decisionLabel(decision),
      recommendationFa: decisionRecommendation(decision)
    },
    arms,
    decisionRules: experiment?.design?.decisionRules || normalizeDecisionRules(),
    guardrails,
    financeReconciliation: {
      status: "pending",
      currencyUnit: options.currencyUnit || "toman",
      expected: expectedReconciliation,
      tolerance: null,
      checks: []
    }
  };
  outcome.evidenceLevel = resolveRetentionEvidence({ outcome });
  outcome.evidenceLabelFa = evidenceMeta(outcome.evidenceLevel).labelFa;
  return outcome;
}

function verifyRetentionFinance(outcome, verification = {}) {
  if (!outcome?.integrity?.decisionEligible) throw new Error("تا عبور گیت سلامت آزمایش، تطبیق مالی قابل تأیید نیست.");
  if (outcome?.summary?.financeVerificationStatus === "verified") throw new Error("این نسخه Outcome قبلاً توسط Finance تأیید شده است.");
  const reasonFa = clean(verification.reasonFa);
  if (reasonFa.length < 12) throw new Error("یادداشت تطبیق مالی باید حداقل ۱۲ نویسه باشد.");
  const reconciliation = reconcileFinance(outcome.financeReconciliation?.expected, verification.reconciliation, verification.toleranceToman);
  if (!reconciliation.passed) throw new Error(`تطبیق مالی ناموفق است: ${reconciliation.failedLabelsFa.join("، ")}`);
  const finalDecision = finalDecisionFor(outcome);
  const verified = {
    ...outcome,
    financeVerification: {
      reviewerFa: clean(verification.reviewerFa) || "نماینده مالی مشتری",
      reasonFa,
      actorId: verification.actorId || null,
      verifiedAt: new Date().toISOString()
    },
    financeReconciliation: reconciliation,
    summary: {
      ...outcome.summary,
      financeVerificationStatus: "verified",
      decision: finalDecision,
      decisionFa: decisionLabel(finalDecision),
      recommendationFa: decisionRecommendation(finalDecision)
    }
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
  const headers = ["experiment_id", "assignment_id", "customer_id_hash", "assigned_policy", "assigned_at", "outcome_closes_at", "assignment_registry_hash", "analysis_plan_version"];
  const lines = [headers.join(",")];
  experiment.assignments.forEach(item => lines.push([
    experiment.id, item.assignmentId, item.customerIdHash, item.assignedPolicy, item.assignedAt, experiment.design.outcomeClosesAt, experiment.assignmentIntegrity.registryHash, experiment.design.analysisPlan.version
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
    totalNetRevenue: round(rows.reduce((sum, item) => sum + item.netRevenue, 0), 2),
    totalContributionMargin: round(rows.reduce((sum, item) => sum + item.contributionMargin, 0), 2),
    totalRefundAmount: round(rows.reduce((sum, item) => sum + item.refundAmount, 0), 2),
    totalContributionProfit: round(profits.reduce((sum, value) => sum + value, 0), 2),
    meanIncentiveCost: round(count ? rows.reduce((sum, item) => sum + item.incentiveCost, 0) / count : 0, 2),
    optOutRate: round(count ? rows.filter(item => item.optOut).length / count : 0, 4),
    complaintRate: round(count ? rows.filter(item => item.complaint).length / count : 0, 4),
    varianceContributionProfit: sampleVariance(profits)
  };
}

function financeTotals(rows) {
  return {
    totalNetRevenue: round(rows.reduce((sum, item) => sum + item.netRevenue, 0), 2),
    totalContributionMargin: round(rows.reduce((sum, item) => sum + item.contributionMargin, 0), 2),
    totalIncentiveCost: round(rows.reduce((sum, item) => sum + item.incentiveCost, 0), 2),
    totalChannelCost: round(rows.reduce((sum, item) => sum + item.channelCost, 0), 2),
    totalRefundAmount: round(rows.reduce((sum, item) => sum + item.refundAmount, 0), 2)
  };
}

function reconcileFinance(expected = {}, submitted = {}, toleranceInput = 0) {
  const labelsFa = {
    totalNetRevenue: "درآمد خالص",
    totalContributionMargin: "حاشیه سود مشارکتی",
    totalIncentiveCost: "هزینه مشوق",
    totalChannelCost: "هزینه کانال",
    totalRefundAmount: "بازپرداخت"
  };
  const tolerance = Number(toleranceInput);
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("تلورانس تطبیق مالی باید عددی نامنفی باشد.");
  const checks = Object.keys(labelsFa).map(key => {
    const sourceValue = Number(submitted?.[key]);
    const expectedValue = Number(expected?.[key]);
    const difference = Number.isFinite(sourceValue) && Number.isFinite(expectedValue) ? round(sourceValue - expectedValue, 2) : null;
    return { key, labelFa: labelsFa[key], expectedValue, sourceValue: Number.isFinite(sourceValue) ? sourceValue : null, difference, passed: difference !== null && Math.abs(difference) <= tolerance };
  });
  return {
    status: checks.every(item => item.passed) ? "verified" : "mismatch",
    passed: checks.every(item => item.passed),
    tolerance,
    expected,
    submitted,
    checks,
    failedLabelsFa: checks.filter(item => !item.passed).map(item => item.labelFa),
    verifiedAt: checks.every(item => item.passed) ? new Date().toISOString() : null
  };
}

function evaluateGuardrails(current, marginlift, rulesInput = {}) {
  const rules = normalizeDecisionRules(rulesInput);
  const checks = [
    guardrail("incremental_net_revenue", "کف درآمد افزایشی", marginlift.meanNetRevenue - current.meanNetRevenue, rules.minIncrementalNetRevenuePerAssignedCustomer, "minimum"),
    guardrail("incremental_incentive_cost", "سقف افزایش هزینه مشوق", marginlift.meanIncentiveCost - current.meanIncentiveCost, rules.maxIncrementalIncentiveCostPerAssignedCustomer, "maximum"),
    guardrail("opt_out_delta", "سقف افزایش opt-out", marginlift.optOutRate - current.optOutRate, rules.maxOptOutRateDelta, "maximum"),
    guardrail("complaint_delta", "سقف افزایش شکایت", marginlift.complaintRate - current.complaintRate, rules.maxComplaintRateDelta, "maximum")
  ];
  return {
    configured: checks.every(item => item.threshold !== null),
    passed: checks.every(item => item.passed),
    checks
  };
}

function guardrail(key, labelFa, observedInput, thresholdInput, direction) {
  const observed = round(observedInput, 4);
  const threshold = finiteOrNull(thresholdInput);
  const passed = threshold !== null && (direction === "minimum" ? observed >= threshold : observed <= threshold);
  return { key, labelFa, observed, threshold, direction, passed };
}

function shouldStop(estimate, guardrails, rulesInput = {}) {
  const rules = normalizeDecisionRules(rulesInput);
  return guardrails.checks.some(item => item.threshold !== null && !item.passed) || (rules.stopWhenPointEstimateNegative && estimate < 0);
}

function finalDecisionFor(outcome) {
  if (shouldStop(outcome.summary.incrementalContributionProfitPerAssignedCustomer, outcome.guardrails, outcome.decisionRules)) return "stop";
  if (scaleGatePassed(outcome.summary.incrementalContributionProfitPerAssignedCustomer, outcome.summary.confidenceInterval95, outcome.guardrails, outcome.decisionRules)) return "scale";
  return "review";
}

function scaleGatePassed(estimate, interval, guardrails, rulesInput = {}) {
  const rules = normalizeDecisionRules(rulesInput);
  const statisticalGate = rules.requirePositiveLowerBoundForScale ? Number(interval?.lower) > 0 : Number(estimate) > 0;
  return statisticalGate && guardrails?.configured === true && guardrails?.passed === true;
}

function normalizeDecisionRules(value = {}) {
  return {
    requirePositiveLowerBoundForScale: value.requirePositiveLowerBoundForScale !== false,
    stopWhenPointEstimateNegative: value.stopWhenPointEstimateNegative !== false,
    minIncrementalNetRevenuePerAssignedCustomer: finiteOrNull(value.minIncrementalNetRevenuePerAssignedCustomer),
    maxIncrementalIncentiveCostPerAssignedCustomer: finiteOrNull(value.maxIncrementalIncentiveCostPerAssignedCustomer),
    maxOptOutRateDelta: finiteOrNull(value.maxOptOutRateDelta),
    maxComplaintRateDelta: finiteOrNull(value.maxComplaintRateDelta)
  };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function assignmentRegistryHash(assignments = []) {
  return sha256(assignments.map(item => [item.assignmentId, item.customerIdHash, item.assignedPolicy, item.assignedAt].join("|")).join("\n"));
}

function varianceOfMean(arm) {
  return arm.assignedCustomers > 1 ? arm.varianceContributionProfit / arm.assignedCustomers : 0;
}

function stableHash(seed, customerId) { return crypto.createHash("sha256").update(`${seed}:${customerId}`).digest("hex"); }

function pick(row, ...keys) {
  for (const key of keys) if (row[key] !== undefined && row[key] !== "") return row[key];
  return "";
}

function parseBoolean(value) {
  return ["1", "true", "yes", "بله"].includes(clean(value).toLowerCase());
}

function parseNullableBoolean(value) {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  if (["1", "true", "yes", "بله"].includes(text)) return true;
  if (["0", "false", "no", "خیر"].includes(text)) return false;
  return null;
}

function parseNonNegative(value) {
  const number = parseIranianNumber(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableText(value) { return clean(value) || null; }
function normalizedDateText(value) { const date = parseIranianDate(value); return date ? date.toISOString() : clean(value); }
function normalizedOptionalDateText(value) { return clean(value) ? normalizedDateText(value) : null; }
function validDate(value) { return Boolean(parseIranianDate(value)); }
function validOptionalDate(value) { return !value || validDate(value); }
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
function decisionLabel(value) { return ({ provisional_scale_candidate: "نامزد Scale پس از تأیید مالی", needs_review: "نیازمند بازبینی", scale: "Scale کنترل‌شده", review: "بازبینی پیش از تصمیم", stop: "توقف سیاست" })[value] || value; }
function decisionRecommendation(value) { return ({ provisional_scale_candidate: "ابتدا اعداد را با Finance تطبیق دهید.", needs_review: "بودجه را افزایش ندهید و گیت‌های ناموفق را رفع کنید.", scale: "افزایش تدریجی دامنه با حفظ holdout و Guardrailها.", review: "تا رفع عدم‌قطعیت یا مغایرت، بودجه جدید آزاد نشود.", stop: "اجرای سیاست متوقف و علت زیان یا نقض Guardrail بررسی شود." })[value] || "تصمیم نیازمند بازبینی است."; }
function csvCell(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function admissionCheck(key, labelFa, passed, detailFa) { return { key, labelFa, passed: Boolean(passed), detailFa }; }

module.exports = {
  analyzeRetentionOutcome,
  auditRetentionOutcome,
  buildRetentionExperimentAdmission,
  buildRetentionExperiment,
  normalizeRetentionOutcomeRows,
  publicRetentionExperiment,
  retentionAssignmentCsv,
  verifyRetentionFinance
};

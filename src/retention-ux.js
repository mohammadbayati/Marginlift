const { hashDataset } = require("./experiment");
const { EVIDENCE_LEVELS, evidenceMeta } = require("./evidence");

const TODAY_STATES = Object.freeze([
  "awaiting_data",
  "needs_data_fix",
  "observational_ready",
  "shadow_ready",
  "pilot_registered",
  "needs_review",
  "verified"
]);
const READOUT_ROLES = Object.freeze(["executive", "crm", "finance", "data"]);
const EVIDENCE_ORDER = Object.freeze([
  "none",
  "observational_estimate",
  "shadow_result",
  "pilot_estimate",
  "verified_incremental"
]);

function buildRetentionPreviewContract(previewInput = {}, options = {}) {
  const preview = previewInput && typeof previewInput === "object" ? previewInput : {};
  const datasetHash = options.datasetHash || hashDataset(options.csvText || "");
  const qualityIssues = [];
  if ((preview.missingRequired || []).length) {
    qualityIssues.push(issue("critical", "required_mapping", "ستون‌های ضروری هنوز تطبیق داده نشده‌اند.", preview.missingRequired));
  }
  if (preview.privacy?.blocked) {
    qualityIssues.push(issue("critical", "direct_identifier", "شناسه مستقیم یا داده تماس باید پیش از ورود حذف یا هش شود.", preview.privacy.piiHeaders || preview.privacy.findings || []));
  }
  for (const check of preview.readiness?.checks || []) {
    if (!check.passed) qualityIssues.push(issue(check.blocking ? "critical" : "fixable", check.key || "readiness", check.detailFa || check.labelFa || "این کنترل داده نیازمند بازبینی است."));
  }
  for (const warning of preview.readiness?.warnings || []) {
    qualityIssues.push(issue("recommendation", "readiness_warning", warning));
  }
  const criticalCount = qualityIssues.filter(item => item.group === "critical").length;
  const canImport = preview.readyForImport === true && criticalCount === 0;
  return {
    ...preview,
    datasetHash,
    canImport,
    qualityIssues,
    quality: {
      status: canImport ? (qualityIssues.length ? "ready_with_notes" : "ready") : "blocked",
      groups: {
        critical: qualityIssues.filter(item => item.group === "critical"),
        fixable: qualityIssues.filter(item => item.group === "fixable"),
        recommendation: qualityIssues.filter(item => item.group === "recommendation")
      }
    },
    claimBoundary: claimBoundary("observational_estimate")
  };
}

function issue(group, code, messageFa, details = []) {
  return { group, code, messageFa, details: Array.isArray(details) ? details : [] };
}

function matchesExpectedDatasetHash(expected, actual) {
  return !String(expected || "").trim() || String(expected).trim() === String(actual || "").trim();
}

function enrichRetentionWorkspace(baseInput = {}, context = {}) {
  const base = baseInput && typeof baseInput === "object" ? baseInput : {};
  const record = context.record || null;
  const workspace = base.workspace || record?.workspace || {};
  const evidence = base.evidence || evidenceMeta(workspace.evidenceLevel || (record ? "observational_estimate" : "none"));
  const today = buildRetentionToday({
    record,
    workspace,
    stale: Boolean(base.stale),
    evidence,
    shadowRun: context.shadowRun || null,
    experiment: context.experiment || base.experiment || null,
    outcome: context.outcome || base.outcome || null
  });
  const dataContext = buildDataContext(record, base, today);
  return {
    ...base,
    workspace,
    today,
    dataContext,
    visualizations: buildVisualizations({ record, workspace, evidence, today, outcome: context.outcome || base.outcome || null })
  };
}

function buildRetentionToday(input = {}) {
  const state = resolveTodayState(input);
  const evidenceLevel = input.evidence?.key || input.workspace?.evidenceLevel || (input.record ? "observational_estimate" : "none");
  const copy = state === "verified" ? verifiedCopy(input.outcome) : todayCopy(state, input.workspace || {});
  return {
    state,
    labelFa: copy.labelFa,
    decisionFa: copy.decisionFa,
    headlineFa: copy.headlineFa,
    blockerFa: copy.blockerFa,
    ownerFa: ownerForState(state, input),
    nextActionFa: copy.nextActionFa,
    cta: ctaForState(state),
    primaryMetric: primaryMetric(state, input),
    evidenceLevel,
    evidence: evidenceMeta(evidenceLevel),
    claimBoundary: claimBoundary(evidenceLevel, input.outcome)
  };
}

function verifiedCopy(outcome) {
  const decision = outcome?.summary?.decision;
  const values = {
    scale: { labelFa: "اثر افزایشی تأییدشده", decisionFa: "Scale کنترل‌شده", headlineFa: "سود افزایشی و Guardrailها تأیید شده‌اند", blockerFa: "مانع بحرانی ثبت نشده است.", nextActionFa: "دامنه را مرحله‌ای افزایش دهید و holdout را حفظ کنید." },
    review: { labelFa: "اثر افزایشی تأییدشده", decisionFa: "Review", headlineFa: "نتیجه معتبر است اما برای Scale کافی نیست", blockerFa: "فاصله اطمینان یا Guardrailها نیازمند تصمیم انسانی است.", nextActionFa: "فرضیه، segment یا اندازه نمونه را بازبینی کنید." },
    stop: { labelFa: "اثر افزایشی تأییدشده", decisionFa: "Stop", headlineFa: "سیاست جدید ارزش ادامه‌دادن ندارد", blockerFa: "سود منفی یا نقض Guardrail ثبت شده است.", nextActionFa: "بودجه و تماس را متوقف و علت شکست را بررسی کنید." }
  };
  return values[decision] || todayCopy("verified", {});
}

function resolveTodayState(input) {
  if (!input.record) return "awaiting_data";
  if (input.stale || !["ready", "diagnostic_only"].includes(input.record.readiness?.status)) return "needs_data_fix";
  if (input.evidence?.key === "verified_incremental") return "verified";
  if (input.outcome) return "needs_review";
  if (input.experiment) return "pilot_registered";
  if (input.shadowRun) return "shadow_ready";
  return "observational_ready";
}

function todayCopy(state, workspace) {
  const values = {
    awaiting_data: { labelFa: "در انتظار داده", decisionFa: "ابتدا قرارداد داده را کامل کنید.", headlineFa: "هنوز تصمیم قابل‌دفاعی وجود ندارد", blockerFa: "فایل تراکنش ناشناس وارد نشده است.", nextActionFa: "یک نمونه CSV را پیش‌نمایش کنید." },
    needs_data_fix: { labelFa: "نیازمند اصلاح داده", decisionFa: "پایلوت را شروع نکنید.", headlineFa: "کیفیت داده مانع تصمیم معتبر است", blockerFa: workspace.nextActionFa || "کنترل‌های حیاتی داده پاس نشده‌اند.", nextActionFa: "خطاهای قرارداد داده را رفع کنید." },
    observational_ready: { labelFa: "برآورد تاریخی", decisionFa: "سیاست را فقط در Shadow بررسی کنید.", headlineFa: workspace.headlineFa || "خط مبنای خرید مجدد آماده است", blockerFa: "اثر اقدام و Saveability هنوز اندازه‌گیری نشده است.", nextActionFa: "یک Shadow Run نسخه‌دار بسازید." },
    shadow_ready: { labelFa: "نتیجه Shadow", decisionFa: "برای Live Pilot آماده‌سازی کنید.", headlineFa: "سیاست از نظر عملیاتی قابل اجراست", blockerFa: "اثر مشتری هنوز با holdout سنجیده نشده است.", nextActionFa: "Metric Contract و طراحی holdout را قفل کنید." },
    pilot_registered: { labelFa: "پایلوت ثبت‌شده", decisionFa: "تخصیص را اجرا و outcome را کامل کنید.", headlineFa: "پایلوت prospective ثبت شده است", blockerFa: "پنجره outcome هنوز بسته نشده است.", nextActionFa: "سلامت assignment و exposure را پایش کنید." },
    needs_review: { labelFa: "نیازمند بازبینی", decisionFa: "بودجه را تا رفع ابهام افزایش ندهید.", headlineFa: "نتیجه پایلوت برای Scale کافی نیست", blockerFa: "گیت آماری یا تطبیق Finance کامل نشده است.", nextActionFa: "Integrity و reconciliation مالی را بازبینی کنید." },
    verified: { labelFa: "اثر افزایشی تأییدشده", decisionFa: "طبق Guardrail مصوب Scale/Stop کنید.", headlineFa: "نتیجه پایلوت قابل استفاده در تصمیم است", blockerFa: "مانع بحرانی ثبت نشده است.", nextActionFa: "Decision Receipt را ثبت و محدوده اجرا را تأیید کنید." }
  };
  return values[state];
}

function ownerForState(state, input) {
  if (state === "awaiting_data" || state === "needs_data_fix") return "مالک داده";
  if (state === "observational_ready" || state === "shadow_ready") return "مالک CRM";
  if (state === "pilot_registered") return "مالک آزمایش";
  if (state === "needs_review") return input.outcome?.integrity?.decisionEligible ? "نماینده Finance" : "مالک آزمایش";
  return "مدیر تصمیم";
}

function ctaForState(state) {
  const values = {
    awaiting_data: { labelFa: "ورود داده", href: "/app/data" },
    needs_data_fix: { labelFa: "اصلاح قرارداد داده", href: "/app/data" },
    observational_ready: { labelFa: "مشاهده شواهد", href: "/app/evidence" },
    shadow_ready: { labelFa: "طراحی پایلوت", href: "/app/pilot" },
    pilot_registered: { labelFa: "پیگیری پایلوت", href: "/app/pilot" },
    needs_review: { labelFa: "بازبینی شواهد", href: "/app/evidence" },
    verified: { labelFa: "دریافت گزارش", href: "/app/report" }
  };
  return values[state];
}

function primaryMetric(state, input) {
  if (["needs_review", "verified"].includes(state)) {
    const value = nullableNumber(input.outcome?.summary?.incrementalContributionProfitPerAssignedCustomer);
    return { key: "incremental_contribution_profit_per_assigned_customer", labelFa: "سود افزایشی به‌ازای مشتری تخصیص‌یافته", value, unit: "toman", available: value !== null };
  }
  if (["observational_ready", "shadow_ready", "pilot_registered"].includes(state)) {
    const value = nullableNumber(input.workspace?.metrics?.medianRepurchaseDays);
    return { key: "median_repurchase_days", labelFa: "میانه زمان خرید مجدد", value, unit: "day", available: value !== null };
  }
  return { key: null, labelFa: "عدد اصلی", value: null, unit: null, available: false };
}

function buildDataContext(record, base, today) {
  return {
    provenance: record?.isDemoScenario ? "sample_data" : record ? "customer_data_without_verified_pilot" : "no_data",
    environmentLabelFa: record?.isDemoScenario ? "داده نمونه" : record ? today.evidence.labelFa : "بدون داده",
    analysisId: record?.id || null,
    datasetHash: record?.datasetHash || null,
    datasetVersion: record?.baseline?.modelCard?.datasetVersion || null,
    modelVersion: record?.baseline?.modelCard?.modelVersion || record?.baseline?.baselineVersion || null,
    policyVersion: base.workspace?.policyVersion || null,
    source: record?.source || null,
    rowCount: nullableNumber(record?.rowCount),
    cutoffAt: record?.cutoffAt || null,
    importedAt: record?.createdAt || null,
    stale: Boolean(base.stale),
    readiness: record?.readiness || null,
    claimBoundary: today.claimBoundary
  };
}

function buildVisualizations({ record, workspace, evidence, today, outcome }) {
  return {
    profitWaterfall: profitWaterfall(record, outcome, evidence.key),
    treatmentControl: treatmentControl(outcome, evidence.key),
    retentionCohort: retentionCohort(record, evidence.key),
    evidenceLadder: evidenceLadder(evidence.key, today)
  };
}

function profitWaterfall(record, outcome, evidenceLevel) {
  const current = nullableNumber(outcome?.arms?.current_crm_policy?.meanContributionProfit);
  const marginlift = nullableNumber(outcome?.arms?.marginlift_policy?.meanContributionProfit);
  const incremental = nullableNumber(outcome?.summary?.incrementalContributionProfitPerAssignedCustomer);
  if (current !== null && marginlift !== null && incremental !== null) {
    return visualization("profit_waterfall", evidenceLevel, "toman_per_assigned_customer", [
      { key: "current_policy", labelFa: "سیاست فعلی", value: current, kind: "total" },
      { key: "incremental", labelFa: "اثر MarginLift", value: incremental, kind: "delta" },
      { key: "marginlift_policy", labelFa: "سیاست MarginLift", value: marginlift, kind: "total" }
    ], "تفکیک سود مشارکتی پایلوت بر مبنای ITT");
  }
  const margins = (record?.decisionQueue || []).map(item => nullableNumber(item.averageContributionMargin)).filter(value => value !== null);
  if (!margins.length) return unavailable("profit_waterfall", evidenceLevel, "financial_components_unavailable");
  const average = margins.reduce((sum, value) => sum + value, 0) / margins.length;
  return visualization("profit_waterfall", "observational_estimate", "toman_observed_margin", [
    { key: "observed_margin", labelFa: "میانگین سود ثبت‌شده", value: round(average), kind: "observed" },
    { key: "incremental_effect", labelFa: "اثر افزایشی", value: null, kind: "not_estimable" }
  ], "تفکیک مشاهده‌ای؛ اثر اقدام هنوز ناموجود است");
}

function treatmentControl(outcome, evidenceLevel) {
  const treatment = outcome?.arms?.marginlift_policy;
  const control = outcome?.arms?.current_crm_policy;
  if (!treatment || !control) return unavailable("treatment_control", evidenceLevel, "registered_experiment_outcome_required");
  return {
    ...visualization("treatment_control", evidenceLevel, "toman_per_assigned_customer", [
      { key: "treatment", labelFa: "سیاست MarginLift", value: nullableNumber(treatment.meanContributionProfit), sampleSize: treatment.customers || treatment.count || null },
      { key: "control", labelFa: "سیاست فعلی CRM", value: nullableNumber(control.meanContributionProfit), sampleSize: control.customers || control.count || null }
    ], "مقایسه ITT دو سیاست"),
    estimate: nullableNumber(outcome.summary?.incrementalContributionProfitPerAssignedCustomer),
    confidenceInterval95: outcome.summary?.confidenceInterval95 || null,
    integrity: outcome.integrity || null
  };
}

function retentionCohort(record, evidenceLevel) {
  const curve = record?.baseline?.overall?.curve;
  if (!Array.isArray(curve) || !curve.length) return unavailable("retention_cohort", evidenceLevel, "kaplan_meier_curve_unavailable");
  return visualization("retention_cohort", "observational_estimate", "probability", curve.map(point => ({
    timeDays: point.timeDays,
    atRisk: point.atRisk,
    survivalProbability: point.survivalProbability,
    confidenceLower: point.confidenceLower,
    confidenceUpper: point.confidenceUpper
  })), "احتمال عدم خرید مجدد در کانال با فاصله اطمینان");
}

function evidenceLadder(current, today) {
  const rank = EVIDENCE_ORDER.indexOf(current);
  return visualization("evidence_ladder", current, null, EVIDENCE_ORDER.map((level, index) => ({
    level,
    labelFa: evidenceMeta(level).labelFa,
    claimFa: evidenceMeta(level).claimFa,
    reached: index <= rank,
    current: level === current,
    blockerFa: level === current ? today.blockerFa : null
  })), "مسیر ارتقای ادعا از داده تا اثر تأییدشده");
}

function visualization(key, evidenceLevel, unit, data, descriptionFa) {
  return { key, available: true, evidenceLevel, unit, data, descriptionFa, sourceFa: "موتور شواهد MarginLift" };
}

function unavailable(key, evidenceLevel, reason) {
  return { key, available: false, evidenceLevel, unit: null, data: null, reason, sourceFa: "موتور شواهد MarginLift" };
}

function claimBoundary(level, outcome = null) {
  const canRecommendScale = level === "verified_incremental" && outcome?.summary?.decision === "scale";
  return {
    evidenceLevel: level,
    canClaimCausality: level === "verified_incremental",
    canClaimIncrementalProfit: level === "verified_incremental",
    canRecommendScale,
    disclaimerRequired: level !== "verified_incremental",
    claimFa: level === "verified_incremental" && outcome?.summary?.recommendationFa
      ? `${evidenceMeta(level).claimFa} ${outcome.summary.recommendationFa}`
      : evidenceMeta(level).claimFa
  };
}

function buildRetentionReadout({ contract, organization, record }, roleInput) {
  const role = normalizeReadoutRole(roleInput);
  const today = contract.today;
  const queue = record?.decisionQueue || contract.workspace?.queue || [];
  const common = {
    role,
    generatedAt: new Date().toISOString(),
    organization: { id: organization?.id || null, name: organization?.name || "فضای کاری" },
    decision: { state: today.state, decisionFa: today.decisionFa, headlineFa: today.headlineFa, nextActionFa: today.nextActionFa },
    primaryMetric: today.primaryMetric,
    evidence: { ...today.evidence, boundary: today.claimBoundary },
    riskFa: today.blockerFa,
    dataContext: contract.dataContext,
    versions: {
      analysisId: record?.id || null,
      datasetHash: contract.dataContext?.datasetHash || null,
      datasetVersion: contract.dataContext?.datasetVersion || null,
      modelVersion: contract.dataContext?.modelVersion || null,
      policyVersion: contract.dataContext?.policyVersion || null
    },
    owners: [
      { roleFa: today.ownerFa, actionFa: today.nextActionFa },
      { roleFa: "مالک شواهد", actionFa: "سلامت داده، آزمایش و مرز ادعا را تأیید کند." },
      { roleFa: "تصمیم‌گیر بودجه", actionFa: "پس از عبور از Gate، تصمیم Scale/Review/Stop را ثبت کند." }
    ]
  };
  const content = {
    executive: { ...common, queueSize: queue.length, recommendationFa: today.decisionFa },
    crm: { ...common, actionMix: summarizeActions(queue), contactSafety: contract.workspace?.contactSafety || null },
    finance: {
      ...common,
      profitWaterfall: contract.visualizations?.profitWaterfall,
      financeVerified: today.evidenceLevel === "verified_incremental",
      finalDecision: contract.outcome?.summary?.decision || null,
      guardrails: contract.outcome?.guardrails || null,
      reconciliation: contract.outcome?.financeReconciliation || null,
      confidenceInterval95: contract.outcome?.summary?.confidenceInterval95 || null
    },
    data: { ...common, dataContext: contract.dataContext, treatmentControl: contract.visualizations?.treatmentControl, retentionCohort: contract.visualizations?.retentionCohort }
  }[role];
  return { schemaVersion: "retention_readout_v1", role, ...content };
}

function buildRetentionDecisionReceipt({ record, contract, decisionId, ledgerEntries = [] }) {
  const decision = (record?.decisionQueue || []).find(item => item.decisionId === decisionId);
  if (!decision) return null;
  const history = ledgerEntries.filter(item => item.entityType === "retention_decision" && item.entityId === decisionId);
  return {
    schemaVersion: "retention_decision_receipt_v1",
    decision: {
      decisionId: decision.decisionId,
      customerIdHash: decision.customerIdHash,
      recommendation: decision.recommendedAction,
      recommendationFa: decision.recommendedActionFa,
      rationaleFa: decision.decisionReasonFa,
      evidenceLevel: decision.evidenceLevel,
      confidenceFa: decision.confidenceFa,
      expectedIncrementalProfit: decision.expectedIncrementalProfit,
      actionCost: decision.actionCost,
      claimBoundary: contract.today?.claimBoundary || claimBoundary(decision.evidenceLevel)
    },
    alternatives: decision.actionAlternatives || [],
    guardrails: decision.guardrails || [],
    unknowns: [
      decision.riskProbability === null ? "risk_probability" : null,
      decision.saveabilityByAction === null ? "saveability_by_action" : null,
      decision.expectedIncrementalProfit === null ? "expected_incremental_profit" : null
    ].filter(Boolean),
    versions: {
      analysisId: record.id,
      datasetHash: record.datasetHash || null,
      datasetVersion: decision.datasetVersion || record.baseline?.modelCard?.datasetVersion || null,
      modelVersion: decision.modelVersion || record.baseline?.modelCard?.modelVersion || null,
      policyVersion: decision.policyVersion || record.workspace?.policyVersion || null
    },
    override: decision.override || null,
    overrideHistory: history,
    generatedAt: new Date().toISOString()
  };
}

function summarizeActions(queue) {
  const values = new Map();
  for (const item of queue) {
    const key = item.override?.action || item.recommendedAction || "unknown";
    const current = values.get(key) || { key, labelFa: item.recommendedActionFa || key, count: 0 };
    current.count += 1;
    values.set(key, current);
  }
  return [...values.values()].sort((a, b) => b.count - a.count);
}

function normalizeReadoutRole(value) {
  const role = String(value || "executive").trim().toLowerCase();
  return READOUT_ROLES.includes(role) ? role : "executive";
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

module.exports = {
  EVIDENCE_ORDER,
  READOUT_ROLES,
  TODAY_STATES,
  buildRetentionDecisionReceipt,
  buildRetentionPreviewContract,
  buildRetentionReadout,
  buildRetentionToday,
  enrichRetentionWorkspace,
  matchesExpectedDatasetHash,
  normalizeReadoutRole
};

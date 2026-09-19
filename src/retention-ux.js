const crypto = require("crypto");

const { hashDataset } = require("./experiment");
const {
  EVIDENCE_LEVELS,
  canClaimCausality,
  canClaimVerifiedIncrementalProfit,
  createEvidenceMetadata,
  requiresDisclaimer
} = require("./truth-contract");

const TODAY_STATES = Object.freeze([
  "awaiting_data",
  "needs_data_fix",
  "observational_ready",
  "shadow_ready",
  "pilot_registered",
  "needs_review",
  "verified"
]);
const QUALITY_SEVERITIES = Object.freeze(["error", "warning", "info"]);
const READOUT_ROLES = Object.freeze(["executive", "crm", "finance", "data"]);
const EVIDENCE_LADDER = Object.freeze([
  EVIDENCE_LEVELS.OBSERVED,
  EVIDENCE_LEVELS.SIMULATED,
  EVIDENCE_LEVELS.SHADOW,
  EVIDENCE_LEVELS.EXPERIMENTAL,
  EVIDENCE_LEVELS.VERIFIED_INCREMENTAL
]);

function buildRetentionPreviewContract(previewInput = {}, options = {}) {
  const preview = previewInput && typeof previewInput === "object" ? previewInput : {};
  const datasetHash = options.datasetHash || hashDataset(options.csvText || "");
  const issues = buildPreviewQualityIssues(preview);
  const severityCounts = Object.fromEntries(QUALITY_SEVERITIES.map(severity => [
    severity,
    issues.filter(issue => issue.severity === severity).length
  ]));
  const canImport = preview.readyForImport === true && severityCounts.error === 0;

  return {
    ...preview,
    datasetHash,
    canImport,
    qualityIssues: issues,
    quality: {
      status: canImport ? (severityCounts.warning ? "ready_with_warnings" : "ready") : "blocked",
      issues,
      severityCounts,
      severityDefinitions: QUALITY_SEVERITIES.map(severity => ({
        severity,
        blocksImport: severity === "error"
      }))
    },
    claimBoundary: buildClaimBoundary(EVIDENCE_LEVELS.OBSERVED, {
      sourceType: "retention_import_preview",
      limitations: ["preview_not_imported", "no_experiment_outcome"]
    })
  };
}

function buildPreviewQualityIssues(preview) {
  const issues = [];
  if (Array.isArray(preview.missingRequired) && preview.missingRequired.length) {
    issues.push(qualityIssue(
      "RETENTION_REQUIRED_MAPPING_MISSING",
      "error",
      "Required retention fields are not mapped.",
      { fields: preview.missingRequired }
    ));
  }
  if (preview.privacy?.blocked) {
    issues.push(qualityIssue(
      "RETENTION_DIRECT_IDENTIFIER_DETECTED",
      "error",
      "Direct identifiers must be removed or hashed before import.",
      {
        piiHeaders: preview.privacy.piiHeaders || [],
        exposedIdentifiers: preview.privacy.exposedIdentifiers || 0
      }
    ));
  }

  for (const check of preview.readiness?.checks || []) {
    if (check.passed) continue;
    issues.push(qualityIssue(
      `RETENTION_${String(check.key || "QUALITY_CHECK").toUpperCase()}`,
      check.blocking ? "error" : "warning",
      check.detailFa || check.labelFa || "Retention data quality check needs attention.",
      { check: check.key || null, blocking: Boolean(check.blocking) }
    ));
  }
  for (const [index, warning] of (preview.readiness?.warnings || []).entries()) {
    issues.push(qualityIssue(
      `RETENTION_READINESS_WARNING_${index + 1}`,
      "warning",
      warning,
      {}
    ));
  }
  issues.push(qualityIssue(
    "RETENTION_PREVIEW_FINGERPRINTED",
    "info",
    "The preview is bound to a deterministic dataset fingerprint.",
    { rowCount: nullableNumber(preview.rowCount) }
  ));
  return deduplicateIssues(issues);
}

function qualityIssue(code, severity, message, details) {
  return {
    code,
    severity: QUALITY_SEVERITIES.includes(severity) ? severity : "info",
    message,
    details: details && typeof details === "object" ? details : {}
  };
}

function deduplicateIssues(issues) {
  const seen = new Set();
  return issues.filter(issue => {
    const key = `${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchesExpectedDatasetHash(expectedDatasetHash, actualDatasetHash) {
  const expected = nullableText(expectedDatasetHash);
  if (!expected) return true;
  return expected === nullableText(actualDatasetHash);
}

function createRetentionDecisionId(item = {}, context = {}) {
  const payload = [
    context.analysisId || item.analysisId || null,
    item.customerIdHash || null,
    item.channel || null,
    item.productType || null,
    item.policyVersion || context.policyVersion || null,
    item.recommendedAction || null
  ];
  const digest = crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  return `rdec_${digest.slice(0, 24)}`;
}

function enrichRetentionWorkspace(baseInput = {}, options = {}) {
  const base = baseInput && typeof baseInput === "object" ? baseInput : {};
  const context = resolveRetentionContext(options);
  const record = options.record || context.record || null;
  const workspaceInput = base.workspace || record?.workspace || {};
  const queue = (record?.decisionQueue || workspaceInput.queue || []).map(item => ({
    ...item,
    id: item.id || createRetentionDecisionId(item, { analysisId: record?.id, policyVersion: workspaceInput.policyVersion })
  }));
  const workspace = { ...workspaceInput, queue };
  const normalizedBase = {
    ...base,
    analysis: base.analysis ? {
      ...base.analysis,
      datasetHash: base.analysis.datasetHash || record?.datasetHash || null
    } : null,
    workspace
  };
  const today = buildRetentionToday({
    ...context,
    record,
    stale: Boolean(base.stale),
    workspace
  });
  const dataContext = buildRetentionDataContext({
    ...context,
    record,
    stale: Boolean(base.stale),
    configuration: base.configuration || record?.configurationSnapshot || null,
    workspace
  });
  const visualizations = buildRetentionVisualizations({
    ...context,
    record,
    workspace,
    today,
    dataContext
  });

  return {
    ...normalizedBase,
    today,
    dataContext,
    visualizations
  };
}

function buildRetentionToday(input = {}) {
  const state = resolveTodayState(input);
  const evidenceLevel = resolveEvidenceLevel(input, state);
  const primaryMetric = resolvePrimaryMetric(input, state, evidenceLevel);
  const copy = todayCopy(state, input);
  return {
    state,
    status: state,
    labelFa: copy.labelFa,
    headlineFa: copy.headlineFa,
    nextActionFa: copy.nextActionFa,
    primaryMetric,
    evidenceLevel,
    evidenceMetadata: evidenceLevel ? buildEvidenceMetadata(input, evidenceLevel) : null,
    claimBoundary: buildClaimBoundary(evidenceLevel, {
      evidenceMetadata: evidenceLevel ? buildEvidenceMetadata(input, evidenceLevel) : null
    })
  };
}

function resolveTodayState(input) {
  const record = input.record || null;
  const readiness = record?.readiness || input.readiness || null;
  if (!record) return "awaiting_data";
  if (input.stale || !readiness || readiness.status !== "ready") return "needs_data_fix";
  if (isVerified(input)) return "verified";
  if (needsReview(input)) return "needs_review";
  if (input.experiment && ["registered", "running", "outcome_received", "completed"].includes(input.experiment.status)) {
    return "pilot_registered";
  }
  if (input.shadowRun?.status === "ready") return "shadow_ready";
  return "observational_ready";
}

function isVerified(input) {
  if (input.verified === true) return true;
  const levels = [
    input.evidenceMetadata?.evidence_level,
    input.outcome?.evidenceMetadata?.evidence_level,
    input.businessImpact?.evidenceMetadata?.evidence_level,
    input.businessImpact?.evidence_metadata?.evidence_level
  ];
  return levels.includes(EVIDENCE_LEVELS.VERIFIED_INCREMENTAL);
}

function needsReview(input) {
  if (input.needsReview === true) return true;
  if (input.outcome && !isVerified(input)) return true;
  if (["needs_review", "blocked", "rejected"].includes(input.shadowRun?.status)) return true;
  const integrityStatus = input.integrityAssessment?.overall_status || input.integrityAssessment?.status;
  return ["BLOCKED", "INVALIDATED", "needs_review", "blocked", "rejected"].includes(integrityStatus);
}

function resolveEvidenceLevel(input, state) {
  if (state === "awaiting_data") return null;
  const candidates = [
    input.evidenceMetadata?.evidence_level,
    input.outcome?.evidenceMetadata?.evidence_level,
    input.businessImpact?.evidenceMetadata?.evidence_level,
    input.businessImpact?.evidence_metadata?.evidence_level
  ];
  const canonical = candidates.find(level => EVIDENCE_LADDER.includes(level));
  if (state === "verified") return EVIDENCE_LEVELS.VERIFIED_INCREMENTAL;
  if (canonical) return canonical;
  if (["shadow_ready", "pilot_registered"].includes(state) && input.shadowRun) return EVIDENCE_LEVELS.SHADOW;
  return EVIDENCE_LEVELS.OBSERVED;
}

function buildEvidenceMetadata(input, evidenceLevel) {
  const source = input.evidenceMetadata
    || input.outcome?.evidenceMetadata
    || input.businessImpact?.evidenceMetadata
    || input.businessImpact?.evidence_metadata
    || {};
  return createEvidenceMetadata({
    ...source,
    evidence_level: evidenceLevel,
    source_type: source.source_type || `retention_${String(evidenceLevel).toLowerCase()}`,
    data_snapshot_id: source.data_snapshot_id || input.record?.datasetHash || null,
    generated_at: source.generated_at || input.outcome?.createdAt || input.shadowRun?.createdAt || input.record?.createdAt || null
  });
}

function resolvePrimaryMetric(input, state, evidenceLevel) {
  const outcome = input.outcome || {};
  const businessImpact = input.businessImpact || {};
  const experimentalValue = firstNullableNumber([
    outcome.summary?.primaryEstimatePerCustomer,
    outcome.statistics?.primary?.estimate,
    businessImpact.realizedImpact?.measuredImpact,
    businessImpact.impactModel?.incrementalValue
  ]);
  const observationalValue = firstNullableNumber([
    input.workspace?.metrics?.medianRepurchaseDays,
    input.record?.baseline?.overall?.medianTimeToRepurchaseDays
  ]);
  const usesExperimentalMetric = ["pilot_registered", "needs_review", "verified"].includes(state);
  const value = usesExperimentalMetric ? experimentalValue : observationalValue;
  const key = usesExperimentalMetric
    ? outcome.statistics?.primary?.key || businessImpact.impactModel?.metric || "incremental_contribution_profit_per_assigned_customer"
    : "median_time_to_repurchase_days";
  const labelFa = usesExperimentalMetric
    ? outcome.statistics?.primary?.labelFa || "سود افزایشی به‌ازای مشتری تخصیص‌یافته"
    : "میانه زمان خرید مجدد";
  const unit = usesExperimentalMetric ? businessImpact.impactModel?.unit || "toman_per_assigned_customer" : "day";
  return {
    key,
    labelFa,
    value,
    unit,
    available: value !== null,
    evidenceLevel,
    verified: evidenceLevel === EVIDENCE_LEVELS.VERIFIED_INCREMENTAL
  };
}

function todayCopy(state, input) {
  const workspace = input.workspace || {};
  const defaults = {
    awaiting_data: {
      labelFa: "در انتظار داده",
      headlineFa: workspace.headlineFa || "داده نگهداشت هنوز وارد نشده است",
      nextActionFa: workspace.nextActionFa || "فایل تراکنش را پیش‌نمایش و وارد کنید."
    },
    needs_data_fix: {
      labelFa: "نیازمند اصلاح داده",
      headlineFa: workspace.headlineFa || "قرارداد داده برای تحلیل آماده نیست",
      nextActionFa: workspace.nextActionFa || input.record?.readiness?.nextActionFa || "خطاهای داده را رفع و دوباره وارد کنید."
    },
    observational_ready: {
      labelFa: "مشاهده تاریخی آماده",
      headlineFa: workspace.headlineFa || "خط مبنای مشاهده‌ای آماده است",
      nextActionFa: workspace.nextActionFa || "سیاست را در Shadow Mode ارزیابی کنید."
    },
    shadow_ready: {
      labelFa: "Shadow آماده",
      headlineFa: "سیاست در اجرای آفلاین آماده بازبینی است",
      nextActionFa: "قرارداد پایلوت و holdout را پیش از اقدام زنده ثبت کنید."
    },
    pilot_registered: {
      labelFa: "پایلوت ثبت شده",
      headlineFa: "پایلوت prospective ثبت شده است",
      nextActionFa: "سلامت assignment، exposure و outcome را پایش کنید."
    },
    needs_review: {
      labelFa: "نیازمند بازبینی",
      headlineFa: "شواهد فعلی برای تصمیم نهایی کافی نیست",
      nextActionFa: "unknownها و guardrailهای نامطمئن را پیش از تصمیم رفع کنید."
    },
    verified: {
      labelFa: "تأیید شده",
      headlineFa: "نتیجه با شواهد افزایشی تأیید شده است",
      nextActionFa: "رسید تصمیم و حدود اجرای مصوب را مرور کنید."
    }
  };
  return defaults[state];
}

function buildRetentionDataContext(input = {}) {
  const record = input.record || null;
  if (!record) {
    return {
      available: false,
      analysisId: null,
      datasetHash: null,
      source: null,
      rowCount: null,
      cutoffAt: null,
      importedAt: null,
      stale: Boolean(input.stale),
      readiness: null,
      qualityIssues: []
    };
  }
  const readiness = record.readiness || null;
  return {
    available: true,
    analysisId: record.id || null,
    datasetHash: record.datasetHash || null,
    datasetVersion: record.baseline?.modelCard?.datasetVersion || null,
    modelVersion: record.baseline?.modelCard?.modelVersion || record.baseline?.baselineVersion || null,
    policyVersion: input.workspace?.policyVersion || record.workspace?.policyVersion || null,
    configurationHash: record.configurationHash || null,
    source: record.source || null,
    rowCount: nullableNumber(record.rowCount),
    cutoffAt: record.cutoffAt || null,
    importedAt: record.createdAt || null,
    stale: Boolean(input.stale),
    readiness: readiness ? {
      status: readiness.status || null,
      score: nullableNumber(readiness.score),
      summary: readiness.summary || null
    } : null,
    qualityIssues: buildReadinessIssues(readiness)
  };
}

function buildReadinessIssues(readiness) {
  if (!readiness) return [];
  const issues = [];
  for (const check of readiness.checks || []) {
    if (check.passed) continue;
    issues.push(qualityIssue(
      `RETENTION_${String(check.key || "QUALITY_CHECK").toUpperCase()}`,
      check.blocking ? "error" : "warning",
      check.detailFa || check.labelFa || "Retention data quality check needs attention.",
      { check: check.key || null }
    ));
  }
  for (const [index, warning] of (readiness.warnings || []).entries()) {
    issues.push(qualityIssue(`RETENTION_WARNING_${index + 1}`, "warning", warning, {}));
  }
  return deduplicateIssues(issues);
}

function buildRetentionVisualizations(input = {}) {
  const evidenceLevel = input.today?.evidenceLevel || resolveEvidenceLevel(input, resolveTodayState(input));
  return {
    profitWaterfall: buildProfitWaterfall(input, evidenceLevel),
    treatmentControl: buildTreatmentControl(input, evidenceLevel),
    retentionCohort: buildRetentionCohort(input, evidenceLevel),
    evidenceLadder: buildEvidenceLadder(input, evidenceLevel)
  };
}

function buildProfitWaterfall(input, evidenceLevel) {
  const explicit = input.businessImpact?.visualizations?.profitWaterfall
    || input.outcome?.visualizations?.profitWaterfall;
  if (Array.isArray(explicit) && explicit.length) {
    return availableVisualization("profitWaterfall", explicit, evidenceLevel, null);
  }
  const impact = input.businessImpact?.impactModel;
  const baseline = nullableNumber(impact?.baselineValue);
  const observed = nullableNumber(impact?.observedValue);
  const incremental = nullableNumber(impact?.incrementalValue);
  if (baseline === null || observed === null || incremental === null) {
    return unavailableVisualization("profitWaterfall", "FINANCIAL_COMPONENTS_UNAVAILABLE", evidenceLevel);
  }
  return availableVisualization("profitWaterfall", [
    { key: "baseline", value: baseline, kind: "total" },
    { key: "incremental", value: incremental, kind: "delta" },
    { key: "observed", value: observed, kind: "total" }
  ], evidenceLevel, impact.unit || null);
}

function buildTreatmentControl(input, evidenceLevel) {
  const explicit = input.outcome?.visualizations?.treatmentControl;
  if (Array.isArray(explicit) && explicit.length) {
    return availableVisualization("treatmentControl", explicit, evidenceLevel, null);
  }
  const primary = input.outcome?.statistics?.primary;
  const treatment = nullableNumber(primary?.meanTreatment);
  const control = nullableNumber(primary?.meanControl);
  if (treatment === null || control === null) {
    return unavailableVisualization("treatmentControl", "TREATMENT_CONTROL_OUTCOME_UNAVAILABLE", evidenceLevel);
  }
  return {
    ...availableVisualization("treatmentControl", [
      { key: "treatment", value: treatment, sampleSize: nullableNumber(primary.nTreatment) },
      { key: "control", value: control, sampleSize: nullableNumber(primary.nControl) }
    ], evidenceLevel, "toman_per_assigned_customer"),
    estimate: nullableNumber(primary.estimate),
    confidenceInterval: {
      low: nullableNumber(primary.ciLow),
      high: nullableNumber(primary.ciHigh)
    }
  };
}

function buildRetentionCohort(input, evidenceLevel) {
  const states = input.workspace?.states || input.record?.workspace?.states;
  if (!Array.isArray(states) || !input.record) {
    return unavailableVisualization("retentionCohort", "RETENTION_COHORT_UNAVAILABLE", evidenceLevel);
  }
  return availableVisualization("retentionCohort", states.map(state => ({
    key: state.key,
    labelFa: state.labelFa || null,
    count: nullableNumber(state.count),
    share: nullableNumber(state.share)
  })), evidenceLevel, "customer");
}

function buildEvidenceLadder(input, evidenceLevel) {
  if (!evidenceLevel) return unavailableVisualization("evidenceLadder", "EVIDENCE_UNAVAILABLE", null);
  const known = new Set([EVIDENCE_LEVELS.OBSERVED]);
  if (input.shadowRun) known.add(EVIDENCE_LEVELS.SHADOW);
  const outcomeLevel = input.outcome?.evidenceMetadata?.evidence_level;
  if (EVIDENCE_LADDER.includes(outcomeLevel)) known.add(outcomeLevel);
  if (evidenceLevel === EVIDENCE_LEVELS.VERIFIED_INCREMENTAL) known.add(EVIDENCE_LEVELS.VERIFIED_INCREMENTAL);
  if (evidenceLevel === EVIDENCE_LEVELS.EXPERIMENTAL) known.add(EVIDENCE_LEVELS.EXPERIMENTAL);
  if (evidenceLevel === EVIDENCE_LEVELS.SIMULATED) known.add(EVIDENCE_LEVELS.SIMULATED);
  return availableVisualization("evidenceLadder", EVIDENCE_LADDER.map(level => ({
    level,
    available: known.has(level),
    current: level === evidenceLevel
  })), evidenceLevel, null);
}

function availableVisualization(key, data, evidenceLevel, unit) {
  return { key, available: true, data, unit, reason: null, evidenceLevel };
}

function unavailableVisualization(key, reason, evidenceLevel) {
  return { key, available: false, data: null, unit: null, reason, evidenceLevel: evidenceLevel || null };
}

function buildClaimBoundary(evidenceLevel, options = {}) {
  if (!evidenceLevel) {
    return {
      evidenceLevel: null,
      evidenceMetadata: null,
      canClaimCausality: false,
      canClaimIncrementalProfit: false,
      canRecommendScale: false,
      requiresDisclaimer: true,
      allowedClaims: [],
      prohibitedClaims: ["causal_effect", "incremental_profit", "scale_recommendation"]
    };
  }
  const evidenceMetadata = options.evidenceMetadata || createEvidenceMetadata({
    evidence_level: evidenceLevel,
    source_type: options.sourceType || "retention_ux",
    limitations: options.limitations || []
  });
  const causal = canClaimCausality(evidenceLevel);
  const verifiedProfit = canClaimVerifiedIncrementalProfit(evidenceLevel);
  const allowedClaims = ["descriptive_metrics"];
  if ([EVIDENCE_LEVELS.OBSERVED, EVIDENCE_LEVELS.SHADOW].includes(evidenceLevel)) allowedClaims.push("observational_patterns");
  if (evidenceLevel === EVIDENCE_LEVELS.SHADOW) allowedClaims.push("operational_feasibility");
  if (causal) allowedClaims.push("causal_effect");
  if (verifiedProfit) allowedClaims.push("incremental_profit", "scale_recommendation");
  return {
    evidenceLevel,
    evidenceMetadata,
    canClaimCausality: causal,
    canClaimIncrementalProfit: verifiedProfit,
    canRecommendScale: verifiedProfit,
    requiresDisclaimer: requiresDisclaimer(evidenceLevel) || evidenceMetadata.claim_permissions?.requires_disclaimer === true,
    allowedClaims,
    prohibitedClaims: [
      !causal ? "causal_effect" : null,
      !verifiedProfit ? "incremental_profit" : null,
      !verifiedProfit ? "scale_recommendation" : null
    ].filter(Boolean)
  };
}

function buildRetentionReadout(input = {}, roleInput = "executive") {
  const role = normalizeReadoutRole(roleInput);
  const contract = input.contract?.today ? input.contract : enrichRetentionWorkspace(input.contract || {}, input);
  const record = input.record || null;
  const views = buildRoleViews(contract, record);
  return {
    schemaVersion: "retention_readout_v1",
    structured: true,
    role,
    audience: role,
    available: Boolean(record),
    generatedAt: input.generatedAt || record?.createdAt || null,
    organization: input.organization ? {
      id: input.organization.id || null,
      name: input.organization.name || null
    } : null,
    today: contract.today,
    dataContext: contract.dataContext,
    claimBoundary: contract.today?.claimBoundary || buildClaimBoundary(null),
    visualizations: contract.visualizations,
    content: views[role],
    views,
    [role]: views[role]
  };
}

function buildRoleViews(contract, record) {
  const workspace = contract.workspace || {};
  const queue = workspace.queue || [];
  const actionCounts = summarizeActions(queue);
  const primaryMetric = contract.today?.primaryMetric || null;
  const common = {
    available: Boolean(record),
    state: contract.today?.state || "awaiting_data",
    nextActionFa: contract.today?.nextActionFa || null
  };
  return {
    executive: {
      ...common,
      headlineFa: contract.today?.headlineFa || null,
      primaryMetric,
      decisionCount: queue.length,
      evidenceLevel: contract.today?.evidenceLevel || null
    },
    crm: {
      ...common,
      actionCounts,
      queueSize: queue.length,
      contactSafety: workspace.contactSafety || null,
      canExportAudience: workspace.contactSafety?.contractReady === true && workspace.contactSafety?.summary?.actionAllowed > 0
    },
    finance: {
      ...common,
      primaryMetric,
      profitWaterfall: contract.visualizations?.profitWaterfall || unavailableVisualization("profitWaterfall", "FINANCIAL_COMPONENTS_UNAVAILABLE", null),
      verifiedIncrementalProfit: contract.today?.claimBoundary?.canClaimIncrementalProfit === true
    },
    data: {
      ...common,
      dataContext: contract.dataContext,
      treatmentControl: contract.visualizations?.treatmentControl || unavailableVisualization("treatmentControl", "TREATMENT_CONTROL_OUTCOME_UNAVAILABLE", null),
      retentionCohort: contract.visualizations?.retentionCohort || unavailableVisualization("retentionCohort", "RETENTION_COHORT_UNAVAILABLE", null)
    }
  };
}

function buildRetentionDecisionReceipt(input = {}) {
  const context = resolveRetentionContext(input);
  const record = input.record || context.record || null;
  if (!record) return null;
  const queue = (record.decisionQueue || record.workspace?.queue || []).map(item => ({
    ...item,
    id: item.id || createRetentionDecisionId(item, { analysisId: record.id, policyVersion: record.workspace?.policyVersion })
  }));
  const decisionId = input.decisionId || input.id || input.decision?.id;
  const candidate = input.decision || queue.find(item => item.id === decisionId) || null;
  if (!candidate) return null;
  const contract = input.contract?.today
    ? input.contract
    : enrichRetentionWorkspace({
      configuration: record.configurationSnapshot || null,
      analysis: { id: record.id, datasetHash: record.datasetHash || null },
      stale: false,
      workspace: record.workspace || {}
    }, { ...context, record });
  const evidenceLevel = contract.today?.evidenceLevel || EVIDENCE_LEVELS.OBSERVED;
  const evidence = buildReceiptEvidence({ ...context, record }, evidenceLevel);
  const claimBoundary = contract.today?.claimBoundary || buildClaimBoundary(evidenceLevel);
  const ledgerEntry = context.decisionEntries.find(entry =>
    entry.entityId === candidate.id || entry.entityId === record.id || entry.id === candidate.ledgerId
  ) || null;
  const outcomeGuardrails = context.outcome?.statistics?.guardrails || [];
  const contactSafety = candidate.contactSafety || {};
  const guardrails = [
    {
      key: "holdout_required_for_incentive",
      status: candidate.incentiveAllowed === false ? "enforced" : "unknown",
      value: candidate.incentiveAllowed === false
    },
    {
      key: "contact_policy",
      status: candidate.actionAllowed === true ? "pass" : candidate.actionAllowed === false ? "blocked" : "unknown",
      value: candidate.actionAllowed ?? null,
      reasons: contactSafety.blockingReasons || []
    },
    ...outcomeGuardrails.map(item => ({
      key: item.key,
      status: item.status || null,
      value: nullableNumber(item.estimate),
      threshold: nullableNumber(item.threshold)
    }))
  ];
  const unknowns = [];
  if (!claimBoundary.canClaimCausality) unknowns.push({ key: "causal_effect", status: "unknown" });
  if (!claimBoundary.canClaimIncrementalProfit) unknowns.push({ key: "verified_incremental_profit", status: "unknown" });
  if (!context.outcome) unknowns.push({ key: "pilot_outcome", status: "unavailable" });
  if (candidate.actionAllowed !== true) unknowns.push({ key: "contact_eligibility", status: candidate.actionAllowed === false ? "blocked" : "unknown" });
  const overrideSource = candidate.override || ledgerEntry?.evidence?.override || null;

  return {
    schemaVersion: "retention_decision_receipt_v1",
    id: candidate.id,
    available: true,
    decision: {
      id: candidate.id,
      status: "recommendation_only",
      recommendation: candidate.recommendedAction || "no_action",
      recommendationFa: candidate.recommendedActionFa || null,
      rationaleFa: candidate.decisionReasonFa || null,
      customerIdHash: candidate.customerIdHash || null,
      state: candidate.state || null,
      createdAt: ledgerEntry?.createdAt || record.createdAt || null,
      claimBoundary
    },
    evidence,
    unknowns,
    alternatives: buildDecisionAlternatives(candidate, context),
    guardrails,
    versions: {
      analysisId: record.id || null,
      datasetHash: record.datasetHash || null,
      datasetVersion: record.baseline?.modelCard?.datasetVersion || null,
      modelVersion: record.baseline?.modelCard?.modelVersion || record.baseline?.baselineVersion || null,
      policyVersion: candidate.policyVersion || record.workspace?.policyVersion || null,
      experimentId: context.experiment?.id || null,
      outcomeVersion: context.outcome?.version || null,
      evidenceLevel
    },
    override: {
      applied: Boolean(overrideSource?.applied),
      allowed: Boolean(overrideSource?.allowed),
      actor: overrideSource?.actor || overrideSource?.actorId || null,
      reason: overrideSource?.reason || null,
      at: overrideSource?.at || overrideSource?.createdAt || null
    }
  };
}

function buildReceiptEvidence(input, evidenceLevel) {
  const evidence = [];
  if (input.record) {
    evidence.push({
      type: "retention_analysis",
      id: input.record.id || null,
      level: EVIDENCE_LEVELS.OBSERVED,
      available: true,
      datasetHash: input.record.datasetHash || null,
      createdAt: input.record.createdAt || null
    });
  }
  if (input.shadowRun) {
    evidence.push({
      type: "shadow_run",
      id: input.shadowRun.id || null,
      level: EVIDENCE_LEVELS.SHADOW,
      available: true,
      createdAt: input.shadowRun.createdAt || null
    });
  }
  if (input.outcome) {
    evidence.push({
      type: "pilot_outcome",
      id: input.outcome.id || null,
      level: input.outcome.evidenceMetadata?.evidence_level || evidenceLevel,
      available: true,
      createdAt: input.outcome.createdAt || input.outcome.analyzedAt || null
    });
  }
  if (input.businessImpact?.evidenceMetadata?.evidence_level === EVIDENCE_LEVELS.VERIFIED_INCREMENTAL) {
    evidence.push({
      type: "verified_financial_impact",
      id: input.businessImpact.id || null,
      level: EVIDENCE_LEVELS.VERIFIED_INCREMENTAL,
      available: true,
      createdAt: input.businessImpact.audit?.updatedAt || null
    });
  }
  return evidence;
}

function buildDecisionAlternatives(candidate, context) {
  const alternatives = [{
    key: "no_action",
    labelFa: "بدون اقدام",
    selected: candidate.recommendedAction === "no_action",
    requiresAdditionalEvidence: false
  }];
  if (candidate.recommendedAction !== "no_action") {
    alternatives.push({
      key: candidate.recommendedAction,
      labelFa: candidate.recommendedActionFa || null,
      selected: true,
      requiresAdditionalEvidence: true
    });
  }
  if (!context.shadowRun) alternatives.push({ key: "shadow_test", labelFa: "اجرای سایه", selected: false, requiresAdditionalEvidence: false });
  if (!context.experiment) alternatives.push({ key: "controlled_pilot", labelFa: "پایلوت کنترل‌شده", selected: false, requiresAdditionalEvidence: true });
  return alternatives;
}

function resolveRetentionContext(options = {}) {
  const db = options.db || null;
  const record = options.record || null;
  const organizationId = options.organizationId || record?.organizationId || null;
  const shadowRun = options.shadowRun || latest(
    db?.retentionShadowRuns,
    item => item.organizationId === organizationId && (!record || item.analysisId === record.id)
  );
  const experiment = options.experiment || latest(
    db?.experiments,
    item => item.organizationId === organizationId && isRetentionExperimentFor(item, record)
  );
  const outcome = options.outcome || latest(
    db?.outcomes,
    item => item.organizationId === organizationId && experiment && item.experimentId === experiment.id
  );
  const integrityAssessment = options.integrityAssessment || latest(
    db?.pilotIntegrityAssessments,
    item => item.organization_id === organizationId || item.organizationId === organizationId
      ? !experiment || item.experiment_id === experiment.id || item.experimentId === experiment.id
      : false
  );
  const businessImpact = options.businessImpact || latest(
    db?.businessImpactLedgers,
    item => item.organizationId === organizationId && (
      !experiment || item.experimentId === experiment.id || item.retentionAnalysisId === record?.id
    )
  );
  const decisionEntries = options.decisionEntries || (db?.decisionLedger || []).filter(item =>
    item.organizationId === organizationId && (!record || item.entityId === record.id || item.entityType === "retention_decision")
  );
  return { record, shadowRun, experiment, outcome: publicOutcome(outcome), integrityAssessment, businessImpact, decisionEntries };
}

function isRetentionExperimentFor(experiment, record) {
  if (!record) return false;
  return [
    experiment.retentionAnalysisId,
    experiment.analysisId,
    experiment.sourceAnalysisId,
    experiment.metadata?.retentionAnalysisId,
    experiment.dataset?.retentionAnalysisId
  ].includes(record.id);
}

function publicOutcome(stored) {
  if (!stored) return null;
  if (stored.analysis && typeof stored.analysis === "object") {
    return {
      id: stored.id || null,
      version: stored.version || 1,
      experimentId: stored.experimentId || null,
      createdAt: stored.createdAt || null,
      ...stored.analysis
    };
  }
  return stored;
}

function latest(items, predicate) {
  if (!Array.isArray(items)) return null;
  return items.filter(predicate).sort((left, right) => {
    const leftAt = new Date(left.updatedAt || left.createdAt || left.assessed_at || left.audit?.updatedAt || 0).getTime();
    const rightAt = new Date(right.updatedAt || right.createdAt || right.assessed_at || right.audit?.updatedAt || 0).getTime();
    return rightAt - leftAt;
  })[0] || null;
}

function summarizeActions(queue) {
  const counts = new Map();
  for (const item of queue) {
    const key = item.recommendedAction || "unknown";
    const current = counts.get(key) || { key, labelFa: item.recommendedActionFa || null, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((left, right) => right.count - left.count);
}

function normalizeReadoutRole(value) {
  const role = String(value || "executive").trim().toLowerCase();
  return READOUT_ROLES.includes(role) ? role : "executive";
}

function firstNullableNumber(values) {
  for (const value of values) {
    const normalized = nullableNumber(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

module.exports = {
  QUALITY_SEVERITIES,
  READOUT_ROLES,
  TODAY_STATES,
  buildClaimBoundary,
  buildRetentionDataContext,
  buildRetentionDecisionReceipt,
  buildRetentionPreviewContract,
  buildRetentionReadout,
  buildRetentionToday,
  buildRetentionVisualizations,
  createRetentionDecisionId,
  enrichRetentionWorkspace,
  matchesExpectedDatasetHash,
  normalizeReadoutRole
};

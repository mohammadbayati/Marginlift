const requiredReadinessChecks = [
  ["customer_id", "شناسه مشتری"],
  ["control", "کنترل یا holdout"],
  ["treatment", "اقدام یا treatment"],
  ["exposure", "ثبت exposure"],
  ["outcome", "نتیجه کمپین"],
  ["revenue", "درآمد"],
  ["gross_margin", "حاشیه سود"],
  ["incentive_cost", "هزینه مشوق"],
  ["channel_cost", "هزینه کانال"]
];

const { analyzeExperimentOutcome, decideExperiment } = require("./statistics");

const claimLevels = {
  observational_estimate: {
    key: "observational_estimate",
    labelFa: "برآورد مشاهده‌ای",
    evidenceTagFa: "برآورد تاریخی؛ بدون ادعای علّی"
  },
  pilot_observation: {
    key: "pilot_observation",
    labelFa: "نتیجه مشاهده‌شده پایلوت؛ تأییدنشده",
    evidenceTagFa: "نتیجه پایلوت؛ نیازمند ممیزی آزمایش"
  },
  randomized_estimate: {
    key: "randomized_estimate",
    labelFa: "برآورد افزایشی آزمایش تصادفی",
    evidenceTagFa: "برآورد آزمایشی با کنترل‌های سلامت"
  },
  verified_incremental: {
    key: "verified_incremental",
    labelFa: "اثر افزایشی تطبیق‌یافته با مالی",
    evidenceTagFa: "اثر افزایشی تأییدشده و قابل‌حسابرسی"
  }
};

function buildReadinessAudit(customerAnalysis, campaignAnalysis, outcomeRecord) {
  const quality = customerAnalysis.quality || {};
  const hasCustomerData = customerAnalysis.model?.unitFa === "customer_id";
  const checks = {
    customer_id: hasCustomerData,
    control: Boolean(quality.hasControl),
    treatment: Boolean(quality.hasTreatment) && (customerAnalysis.treatmentStats || []).some(item => item.key !== "control"),
    exposure: Boolean(quality.hasExposure),
    outcome: Boolean(quality.hasOutcome),
    revenue: Boolean(quality.hasRevenue),
    gross_margin: Boolean(quality.hasMargin),
    incentive_cost: Boolean(quality.hasIncentiveCost),
    channel_cost: Boolean(quality.hasChannelCost)
  };
  const passed = requiredReadinessChecks.filter(([key]) => checks[key]).length;
  const score = Math.round((passed / requiredReadinessChecks.length) * 100);
  const status = statusFromReadiness(checks, score);

  const claim = resolveClaimLevel(outcomeRecord);
  return {
    score,
    status,
    statusFa: statusFa(status),
    claimLevel: claim.key,
    claimLevelFa: claim.labelFa,
    claimLadder: Object.values(claimLevels),
    nextStepFa: nextStepFa(status, outcomeRecord),
    checks: requiredReadinessChecks.map(([key, labelFa]) => ({
      key,
      labelFa,
      passed: Boolean(checks[key]),
      statusFa: checks[key] ? "موجود" : "ناقص"
    })),
    notesFa: buildReadinessNotes(checks, campaignAnalysis, outcomeRecord)
  };
}

function buildSavingsSnapshot(customerAnalysis, campaignAnalysis, readiness, outcomeRecord) {
  const campaign = campaignAnalysis.campaign || {};
  const outcome = outcomeRecord?.summary;
  const hasOutcome = Boolean(outcome);
  const observedSpend = finiteOrNull(campaign.observedSpend);
  const recommendedSpend = finiteOrNull(campaign.recommendedSpend);
  const baselineProfit = finiteOrNull(campaign.baselineContributionProfit);
  const recommendedProfit = finiteOrNull(campaign.recommendedContributionProfit);
  const avoidableIncentiveCost = observedSpend !== null && recommendedSpend !== null
    ? Math.round(observedSpend - recommendedSpend)
    : null;
  const expectedIncrementalProfit = hasOutcome
    ? finiteOrNull(outcome.observedIncrementalProfit)
    : baselineProfit !== null && recommendedProfit !== null
      ? Math.round(recommendedProfit - baselineProfit)
      : null;
  const pilotRoi = hasOutcome ? finiteOrNull(outcome.observedRoi) : null;
  return {
    headlineFa: "تخفیف کمتر، سود بیشتر",
    claimLevel: readiness.claimLevel,
    claimLevelFa: readiness.claimLevelFa,
    avoidableIncentiveCost,
    expectedIncrementalProfit,
    revenueAtRisk: null,
    pilotRoi,
    confidenceFa: confidenceLabel(readiness, outcomeRecord),
    decisionFa: hasOutcome ? outcome.recommendationFa : "این اعداد برآورد تاریخی‌اند؛ پایلوت برای تصمیم بودجه‌ای لازم است.",
    evidenceTagFa: claimLevels[readiness.claimLevel]?.evidenceTagFa || claimLevels.observational_estimate.evidenceTagFa,
    metrics: {
      avoidableIncentiveCost: metricEvidence(
        "شکاف هزینه مشاهده‌شده و سیاست پیشنهادی",
        avoidableIncentiveCost,
        "observational_estimate",
        "هزینه مشاهده‌شده منهای هزینه سیاست پیشنهادی؛ صرفه‌جویی تأییدشده نیست."
      ),
      expectedIncrementalProfit: metricEvidence(
        hasOutcome ? "سود افزایشی مشاهده‌شده" : "تغییر سود مشارکتی برآوردی",
        expectedIncrementalProfit,
        hasOutcome ? readiness.claimLevel : "observational_estimate",
        hasOutcome ? "اختلاف مشاهده‌شده treatment و control؛ اعتبار آزمایش هنوز باید ممیزی شود." : "مقایسه سیاست پیشنهادی و baseline شبیه‌سازی‌شده."
      ),
      revenueAtRisk: metricEvidence(
        "درآمد در معرض ریسک",
        null,
        "unavailable",
        "تا دریافت تعریف مالی مورد تأیید مشتری محاسبه نمی‌شود."
      ),
      pilotRoi: metricEvidence(
        hasOutcome ? "ROI مشاهده‌شده پایلوت" : "ROI پایلوت",
        pilotRoi,
        hasOutcome ? readiness.claimLevel : "unavailable",
        hasOutcome ? "سود مشاهده‌شده تقسیم بر هزینه واقعی ثبت‌شده؛ هنوز اثر causal تأییدشده نیست." : "پس از ورود outcome و هزینه واقعی محاسبه می‌شود."
      )
    }
  };
}

function buildPilotWorkspace(readiness, customerAnalysis, outcomeRecord, experiment) {
  const hasOutcome = Boolean(outcomeRecord);
  const decisionStatus = outcomeRecord?.summary?.decisionStatus || "pending";
  const dataReady = readiness.status !== "blocked";
  const holdoutReady = readiness.checks.find(item => item.key === "control")?.passed;
  const experimentRegistered = Boolean(experiment?.id) && experiment.status !== "demo_only";
  const randomizationVerified = experiment?.design?.randomizationEvidence?.verified === true;
  const integrityPassed = outcomeRecord?.integrity?.decisionEligible === true;
  const decisionComplete = integrityPassed && ["scale", "stop"].includes(decisionStatus);
  return {
    overallStatusFa: hasOutcome
      ? workspaceStatusFa(decisionStatus)
      : dataReady ? "آماده طراحی پایلوت" : "در انتظار اصلاح داده",
    steps: [
      workspaceStep("data_received", "دریافت داده", "انجام‌شده", true),
      workspaceStep("data_validated", "اعتبارسنجی داده", dataReady ? "انجام‌شده" : "نیازمند اصلاح", dataReady),
      workspaceStep("historical_diagnostic", "تحلیل تاریخی", "انجام‌شده", true),
      workspaceStep("holdout_design", "ثبت Experiment و holdout", randomizationVerified ? "ثبت و پیش از اجرا قفل شده" : experimentRegistered && holdoutReady ? "پیش‌نویس؛ randomization هنوز تأیید نشده" : "در انتظار مشتری", randomizationVerified),
      workspaceStep("campaign_execution", "اجرای کمپین", hasOutcome ? "انجام‌شده" : "در انتظار مشتری", hasOutcome),
      workspaceStep("outcome_received", "دریافت outcome", hasOutcome ? "انجام‌شده" : "در انتظار مشتری", hasOutcome),
      workspaceStep("scale_stop", "تصمیم scale/iterate/stop", hasOutcome ? workspaceDecisionStatusFa(decisionStatus) : "در انتظار outcome", decisionComplete)
    ],
    ownerFa: "مدیر رشد یا CRM",
    decisionDeadlineFa: customerAnalysis.experimentPlan?.durationFa || "۳۰ روز پس از exposure",
    experimentId: experiment?.id || null,
    integrityStatus: outcomeRecord?.integrity?.status || "pending"
  };
}

function analyzeOutcomeRows(rows, customerAnalysis, integrity = null, experiment = null) {
  const predictedByCustomer = new Map((customerAnalysis.channelExport || []).map(item => [item.customer_id, item]));
  const treatmentRows = rows.filter(row => row.assignedGroup !== "control");
  const controlRows = rows.filter(row => row.assignedGroup === "control");
  const treatmentProfit = profit(treatmentRows);
  const controlProfitPerUser = controlRows.length ? profit(controlRows) / controlRows.length : 0;
  const expectedControlProfit = controlProfitPerUser * treatmentRows.length;
  const observedIncrementalProfit = Math.round(treatmentProfit - expectedControlProfit);
  const predictedProfit = treatmentRows.reduce((sum, row) => {
    const predicted = predictedByCustomer.get(row.customerId);
    return sum + Number(predicted?.expected_incremental_profit_toman || 0);
  }, 0);
  const spend = treatmentRows.reduce((sum, row) => sum + row.actualIncentiveCost + row.actualChannelCost, 0);
  const observedRoi = spend > 0 ? roundOne(observedIncrementalProfit / spend) : 0;
  const statistics = analyzeExperimentOutcome(rows, experiment);
  const minimumRoi = experiment?.design?.analysisPlan?.minimumRoi ?? 1;
  const decision = decideExperiment({ integrity, statistics, observedRoi, minimumRoi });
  const decisionGrade = integrity?.decisionEligible && statistics.valid && statistics.sample.adequate;

  return {
    rowCount: rows.length,
    summary: {
      treatmentUsers: treatmentRows.length,
      controlUsers: controlRows.length,
      observedIncrementalProfit,
      predictedIncrementalProfit: Math.round(predictedProfit),
      predictionGap: Math.round(observedIncrementalProfit - predictedProfit),
      observedRoi,
      decisionStatus: decision.status,
      decisionRationaleFa: decision.rationaleFa,
      recommendationFa: recommendationFa(decision.status),
      sampleAdequate: statistics.sample.adequate,
      primaryEstimatePerCustomer: roundMoney(statistics.primary.estimate),
      primaryCiLow: roundMoney(statistics.primary.ciLow),
      primaryCiHigh: roundMoney(statistics.primary.ciHigh),
      pValue: roundSix(statistics.primary.pValue),
      minimumDetectableEffect: roundMoney(statistics.primary.minimumDetectableEffect),
      achievedPower: roundFourNullable(statistics.primary.achievedPower),
      evidenceStatus: decisionGrade ? "decision_grade" : "descriptive_only",
      evidenceStatusFa: decisionGrade ? "آزمایش تصادفی از گیت سلامت و استنباط عبور کرده است" : "نتیجه مشاهده‌شده؛ برای ادعای علّی کافی نیست",
      financeVerificationStatus: "not_verified"
    },
    checks: [
      { labelFa: "کنترل outcome", passed: controlRows.length > 0 },
      { labelFa: "درمان outcome", passed: treatmentRows.length > 0 },
      { labelFa: "هزینه واقعی", passed: rows.every(row => row.actualIncentiveCost >= 0 && row.actualChannelCost >= 0) },
      { labelFa: "درآمد outcome", passed: rows.some(row => row.outcomeRevenue > 0) },
      { labelFa: "کفایت حجم نمونه از پیش تعیین‌شده", passed: statistics.sample.adequate },
      { labelFa: "محاسبه فاصله اطمینان", passed: statistics.primary.valid },
      ...statistics.guardrails.map(item => ({ labelFa: item.labelFa, passed: item.passed, statusFa: item.statusFa }))
    ],
    integrity,
    statistics
  };
}

function buildPilotReadout(organization, readiness, snapshot, workspace, outcomeRecord, governanceOverview = null) {
  const outcome = outcomeRecord?.summary;
  const integrity = outcomeRecord?.integrity;
  const provenance = outcomeRecord?.provenance;
  const statistics = outcomeRecord?.statistics;
  const decisionStatus = outcome?.decisionStatus || "pending";
  const nextActions = executiveNextActions(decisionStatus);
  const riskNotes = executiveRiskNotes(readiness, outcomeRecord);
  const governance = governanceOverview?.modelGovernance;
  const ledger = governanceOverview?.decisionLedger;
  const lines = [
    `# گزارش پایلوت MarginLift برای ${organization.name}`,
    "",
    "## تصمیم اجرایی",
    "",
    executiveVerdictFa(decisionStatus),
    "",
    `**پیشنهاد تصمیم:** ${executiveRecommendationFa(decisionStatus)}`,
    "",
    `**سطح شواهد:** ${snapshot.claimLevelFa}`,
    "",
    `**سطح اعتماد:** ${snapshot.confidenceFa}`,
    "",
    "## عددهای مهم برای مدیر مالی",
    "",
    "| شاخص | مقدار | برداشت مدیریتی |",
    "| --- | ---: | --- |",
    `| ${snapshot.metrics?.avoidableIncentiveCost?.labelFa || "شکاف هزینه مشاهده‌شده"} | ${formatMoney(snapshot.avoidableIncentiveCost)} | ${snapshot.metrics?.avoidableIncentiveCost?.noteFa || "برآورد تاریخی؛ صرفه‌جویی تأییدشده نیست."} |`,
    `| ${snapshot.metrics?.expectedIncrementalProfit?.labelFa || "سود افزایشی"} | ${formatMoney(snapshot.expectedIncrementalProfit)} | ${snapshot.metrics?.expectedIncrementalProfit?.noteFa || "سطح شواهد باید همراه عدد خوانده شود."} |`,
    `| ${snapshot.metrics?.revenueAtRisk?.labelFa || "درآمد در معرض ریسک"} | ${formatMoney(snapshot.revenueAtRisk)} | ${snapshot.metrics?.revenueAtRisk?.noteFa || "نیازمند قرارداد مالی مشتری است."} |`,
    `| ${snapshot.metrics?.pilotRoi?.labelFa || "ROI پایلوت"} | ${formatRatio(snapshot.pilotRoi)} | ${snapshot.metrics?.pilotRoi?.noteFa || "پس از outcome واقعی محاسبه می‌شود."} |`,
    outcome ? `| شکاف پیش‌بینی و واقعیت | ${formatMoney(outcome.predictionGap)} | اختلاف منفی یعنی مدل یا policy باید قبل از افزایش بودجه بازبینی شود. |` : `| شکاف پیش‌بینی و واقعیت | در انتظار outcome | پس از ورود نتیجه واقعی محاسبه می‌شود. |`,
    "",
    "## پیام برای مدیر مارکتینگ و CRM",
    "",
    executiveMarketingMessageFa(decisionStatus),
    "",
    "## آمادگی داده",
    "",
    `- وضعیت: ${readiness.statusFa}`,
    `- امتیاز: ${formatNumber(readiness.score)}٪`,
    `- قدم بعدی: ${readiness.nextStepFa}`,
    "",
    "## شناسنامه و سلامت آزمایش",
    "",
    `- شناسه آزمایش: ${workspace.experimentId || "ثبت نشده"}`,
    `- نسخه outcome: ${outcomeRecord?.version ? formatNumber(outcomeRecord.version) : "در انتظار outcome"}`,
    `- وضعیت Integrity Gate: ${integrity?.statusFa || "در انتظار outcome"}`,
    `- پوشش outcome: ${integrity ? `${formatNumber(Math.round((integrity.coverage || 0) * 100))}٪` : "در انتظار outcome"}`,
    `- اثرانگشت داده assignment: ${provenance?.assignmentDatasetHash || "در Registry نگهداری می‌شود"}`,
    `- اثرانگشت داده outcome: ${provenance?.outcomeDatasetHash || "در انتظار outcome"}`,
    "",
    ...(integrity?.checks || []).map(check => `- ${check.labelFa}: ${check.passed ? "تأیید" : "نیازمند بررسی"}؛ ${check.detailFa}`),
    ...(integrity?.checks?.length ? [""] : []),
    "## وضعیت اجرای پایلوت",
    "",
    ...workspace.steps.map(step => `- ${step.labelFa}: ${step.statusFa}`),
    "",
    "## نتیجه پایلوت",
    "",
    outcome
      ? `- سود افزایشی مشاهده‌شده: ${formatMoney(outcome.observedIncrementalProfit)}`
      : "- هنوز outcome وارد نشده است.",
    outcome
      ? `- شکاف پیش‌بینی/واقعیت: ${formatMoney(outcome.predictionGap)}`
      : "- readout نهایی پس از بسته‌شدن پنجره outcome صادر می‌شود.",
    outcome
      ? `- کاربران دریافت‌کننده اقدام: ${formatNumber(outcome.treatmentUsers)}`
      : "- تعداد کاربران دریافت‌کننده اقدام پس از outcome نمایش داده می‌شود.",
    outcome
      ? `- کاربران گروه کنترل: ${formatNumber(outcome.controlUsers)}`
      : "- تعداد کاربران کنترل پس از outcome نمایش داده می‌شود.",
    "",
    "## نتیجه آماری و عدم‌قطعیت",
    "",
    `- Estimand: ${statistics?.estimandFa || "هنوز ثبت نشده است"}`,
    `- روش تحلیل: ${statistics?.methodFa || "در انتظار outcome"}`,
    `- اثر ITT به‌ازای مشتری: ${formatMoney(outcome?.primaryEstimatePerCustomer)}`,
    `- فاصله اطمینان ۹۵٪: ${outcome?.primaryCiLow === null || outcome?.primaryCiLow === undefined ? "محاسبه نشد" : `${formatMoney(outcome.primaryCiLow)} تا ${formatMoney(outcome.primaryCiHigh)}`}`,
    `- p-value: ${formatDecimal(outcome?.pValue, 4)}`,
    `- توان مشاهده‌شده: ${formatStatPercent(outcome?.achievedPower)}`,
    `- حداقل اثر قابل‌تشخیص: ${formatMoney(outcome?.minimumDetectableEffect)}`,
    `- علت تصمیم: ${outcome?.decisionRationaleFa || "در انتظار outcome"}`,
    "",
    "### Guardrailها",
    "",
    ...(statistics?.guardrails?.length
      ? statistics.guardrails.map(item => `- ${item.labelFa}: ${item.statusFa}؛ ${item.noteFa}`)
      : ["- هنوز guardrail قابل محاسبه نیست."]),
    "",
    "## سلامت و حاکمیت مدل",
    "",
    `- وضعیت بک‌تست: ${governance?.backtest?.statusFa || "در انتظار ارزیابی"}`,
    `- سطح ادعا: ${governance?.claimLevelFa || "ثبت نشده"}`,
    `- وضعیت drift: ${governance?.drift?.statusFa || "در انتظار snapshot"}`,
    `- Promotion مدل: ${governance?.registry?.promotionGate?.statusFa || "مسدود"}`,
    `- یکپارچگی Decision Ledger: ${ledger?.integrity?.statusFa || "در انتظار ثبت تصمیم"}`,
    `- سیاست عملیاتی: ${governanceOverview?.operatingPolicy?.policyFa || "ارتقای خودکار مدل مجاز نیست."}`,
    "",
    "## ریسک‌ها و محدودیت‌های تصمیم",
    "",
    ...riskNotes.map(item => `- ${item}`),
    "",
    "## اقدام‌های پیشنهادی بعدی",
    "",
    ...nextActions.map(item => `- ${item}`)
  ];
  return `${lines.join("\n")}\n`;
}

function statusFromReadiness(checks, score) {
  if (!checks.customer_id || !checks.treatment || !checks.revenue) return "blocked";
  if (!checks.control || !checks.exposure || !checks.outcome) return "diagnostic_only";
  return score >= 80 ? "ready" : "diagnostic_only";
}

function statusFa(status) {
  if (status === "ready") return "قرارداد داده اولیه کامل";
  if (status === "diagnostic_only") return "فقط diagnostic تاریخی";
  return "نیازمند اصلاح داده";
}

function nextStepFa(status, outcomeRecord) {
  if (outcomeRecord) return "تصمیم scale/stop را از readout بررسی کنید.";
  if (status === "ready") return "پایلوت live holdout را اجرا و outcome را وارد کنید.";
  if (status === "diagnostic_only") return "ابتدا holdout و ثبت exposure را برای کمپین بعدی تنظیم کنید.";
  return "ستون‌های ضروری داده را کامل کنید.";
}

function buildReadinessNotes(checks, campaignAnalysis, outcomeRecord) {
  const notes = [];
  if (!checks.control) notes.push("بدون کنترل، خروجی فقط برآورد تاریخی است و ادعای causal مجاز نیست.");
  if (!checks.gross_margin) notes.push("بدون margin، ROI برای CFO کم‌اعتماد است.");
  if (!outcomeRecord) notes.push("تا قبل از outcome، اعداد مالی verified incremental نیستند.");
  if (outcomeRecord && resolveClaimLevel(outcomeRecord).key === "pilot_observation") {
    notes.push("ورود outcome فقط یک نتیجه مشاهده‌شده می‌سازد؛ SRM، randomization، کفایت نمونه و تطبیق مالی هنوز تأیید نشده‌اند.");
  }
  if ((campaignAnalysis.quality?.score || 0) < 80) notes.push("کیفیت داده سگمنتی باید قبل از scale اصلاح شود.");
  return notes.length ? notes : ["قرارداد داده برای پایلوت محدود آماده است."];
}

function confidenceLabel(readiness, outcomeRecord) {
  const claimLevel = resolveClaimLevel(outcomeRecord).key;
  if (claimLevel === "verified_incremental") return "بالا";
  if (claimLevel === "randomized_estimate") return "متوسط تا بالا";
  if (claimLevel === "pilot_observation") return "پایین؛ نیازمند ممیزی آزمایش";
  if (readiness.status === "ready") return "پایین تا متوسط";
  if (readiness.status === "diagnostic_only") return "پایین";
  return "پایین";
}

function resolveClaimLevel(outcomeRecord) {
  const summary = outcomeRecord?.summary;
  if (!summary) return claimLevels.observational_estimate;
  if (summary.evidenceStatus === "decision_grade" && summary.financeVerificationStatus === "verified") {
    return claimLevels.verified_incremental;
  }
  if (summary.evidenceStatus === "decision_grade") return claimLevels.randomized_estimate;
  return claimLevels.pilot_observation;
}

function metricEvidence(labelFa, value, evidenceLevel, noteFa) {
  return {
    labelFa,
    value,
    available: value !== null,
    evidenceLevel,
    noteFa
  };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function workspaceStep(key, labelFa, statusFa, complete) {
  return { key, labelFa, statusFa, complete };
}

function workspaceStatusFa(status) {
  if (status === "scale") return "شواهد برای گسترش کنترل‌شده آماده است";
  if (status === "stop") return "تصمیم توقف آماده اجرا است";
  if (status === "iterate") return "آزمایش نامطمئن است؛ تکرار هدفمند لازم است";
  return "تصمیم بودجه‌ای تا رفع ایرادهای شواهد مسدود است";
}

function workspaceDecisionStatusFa(status) {
  if (status === "scale") return "آماده گسترش کنترل‌شده";
  if (status === "stop") return "توقف توصیه شده";
  if (status === "iterate") return "نیازمند تکرار پایلوت";
  return "نیازمند اصلاح شواهد";
}

function profit(rows) {
  return rows.reduce((sum, row) =>
    sum + row.outcomeRevenue * row.grossMarginRate - row.actualIncentiveCost - row.actualChannelCost,
  0);
}

function recommendationFa(status) {
  if (status === "scale") return "پایلوت مثبت است؛ با سقف بودجه کنترل‌شده گسترش دهید.";
  if (status === "stop") return "اثر مالی مثبت نشد؛ اجرای گسترده متوقف شود.";
  if (status === "iterate") return "نتیجه هنوز قطعی نیست؛ پایلوت را با حجم نمونه یا طراحی اصلاح‌شده تکرار کنید.";
  return "سلامت یا ثبت آزمایش کامل نیست؛ قبل از تصمیم بودجه‌ای، شواهد را اصلاح کنید.";
}

function executiveVerdictFa(status) {
  if (status === "scale") {
    return "پایلوت از نظر مالی مثبت بوده و می‌تواند با سقف بودجه مشخص وارد اجرای محدود بعدی شود.";
  }
  if (status === "stop") {
    return "پایلوت اثر مالی قابل دفاع نشان نداده است. اجرای گسترده فعلاً توصیه نمی‌شود.";
  }
  if (status === "needs_review") {
    return "زنجیره شواهد آزمایش کامل نیست. تا رفع ایرادهای Integrity Gate، هیچ تصمیم بودجه‌ای قابل دفاع نیست.";
  }
  if (status === "iterate") {
    return "برآورد فعلی برای گسترش یا توقف قطعی نیست. نتیجه باید با نمونه بیشتر یا طراحی دقیق‌تر روشن شود.";
  }
  return "داده آماده شده، اما تا زمان دریافت outcome واقعی نباید درباره افزایش بودجه تصمیم قطعی گرفت.";
}

function executiveRecommendationFa(status) {
  if (status === "scale") return "Scale کنترل‌شده با بودجه محدود و پایش هفتگی.";
  if (status === "stop") return "توقف اجرای گسترده و بازطراحی فرضیه کمپین.";
  if (status === "needs_review") return "بازبینی قبل از scale؛ بودجه جدید تا روشن‌شدن علت اختلاف آزاد نشود.";
  if (status === "iterate") return "تکرار هدفمند پایلوت با همان معیار اصلی، نمونه کافی و بدون تغییر میان‌دوره‌ای.";
  return "اجرای پایلوت live holdout و ثبت outcome قبل از هر تصمیم بودجه‌ای.";
}

function executiveMarketingMessageFa(status) {
  if (status === "scale") {
    return "کمپین در این نمونه توانسته اثر مالی مثبت بسازد. تیم مارکتینگ می‌تواند همان policy را فقط روی سگمنت‌های مشابه و با کنترل بودجه اجرا کند.";
  }
  if (status === "stop") {
    return "پیام، پیشنهاد یا سگمنت فعلی رفتار مشتری را به اندازه کافی تغییر نداده است. قبل از کمپین بعدی باید فرضیه، مخاطب و نوع مشوق بازطراحی شود.";
  }
  if (status === "needs_review") {
    return "نتیجه فعلی به‌دلیل نقص سلامت یا ثبت آزمایش قابل تعمیم نیست. ابتدا خطای داده، تخصیص یا زمان‌بندی outcome را برطرف کنید.";
  }
  if (status === "iterate") {
    return "سیگنال اولیه وجود دارد، اما عدم‌قطعیت هنوز بالاست. فرضیه و پیام را ثابت نگه دارید و نمونه را تا حد تعیین‌شده کامل کنید.";
  }
  return "قبل از اجرای گسترده، تیم مارکتینگ باید گروه کنترل، پنجره سنجش outcome و تعریف موفقیت کمپین را نهایی کند.";
}

function executiveRiskNotes(readiness, outcomeRecord) {
  const notes = [];
  if (readiness.status !== "ready") {
    notes.push("داده هنوز برای ادعای causal کامل نیست؛ نتیجه فقط باید به‌عنوان diagnostic استفاده شود.");
  }
  if (!outcomeRecord) {
    notes.push("تا قبل از outcome واقعی، همه عددهای مالی برآورد هستند و نباید مبنای scale شوند.");
  }
  if (outcomeRecord?.summary?.decisionStatus === "needs_review") {
    notes.push("نقص در زنجیره شواهد، هرگونه نتیجه‌گیری بودجه‌ای را مسدود می‌کند.");
  }
  if (outcomeRecord?.summary?.decisionStatus === "iterate") {
    notes.push("فاصله اطمینان یا guardrailها هنوز نتیجه قطعی نمی‌دهند؛ ادامه فقط در قالب پایلوت از پیش طراحی‌شده مجاز است.");
  }
  if (outcomeRecord && resolveClaimLevel(outcomeRecord).key === "pilot_observation") {
    notes.push("این readout نتیجه مشاهده‌شده پایلوت است و تا عبور از گیت‌های سلامت آزمایش، اثر causal تأییدشده محسوب نمی‌شود.");
  }
  if (outcomeRecord?.summary?.controlUsers === 0) {
    notes.push("بدون گروه کنترل، اثر افزایشی قابل دفاع نیست.");
  }
  return notes.length ? notes : ["ریسک اصلی فعلی پایین است، اما scale باید مرحله‌ای و با سقف بودجه انجام شود."];
}

function executiveNextActions(status) {
  if (status === "scale") {
    return [
      "اجرای مرحله بعد فقط روی سگمنت‌های مشابه با سقف بودجه مشخص.",
      "نگه‌داشتن گروه کنترل برای سنجش اثر واقعی.",
      "گزارش هفتگی ROI، نرخ تبدیل و هزینه مشوق به CFO و CMO."
    ];
  }
  if (status === "stop") {
    return [
      "توقف اجرای گسترده این policy.",
      "تحلیل سگمنت‌هایی که هزینه مشوق گرفته‌اند اما رفتارشان تغییر نکرده است.",
      "طراحی یک پیشنهاد جدید با مشوق کمتر یا پیام غیرتخفیفی."
    ];
  }
  if (status === "iterate") {
    return [
      "معیار اصلی، بازوها و پنجره outcome را بدون تغییر دوباره ثبت کنید.",
      "حجم نمونه هر بازو را حداقل تا کف Analysis Plan تکمیل کنید.",
      "پایلوت را بدون peeking یا توقف زودهنگام اجرا و سپس یک‌بار تحلیل کنید."
    ];
  }
  if (status === "needs_review") {
    return [
      "بررسی کیفیت گروه کنترل، نسبت نمونه و پنجره outcome.",
      "بازبینی سگمنت هدف و مقدار مشوق قبل از اجرای بزرگ‌تر.",
      "اجرای یک پایلوت کوچک‌تر با policy اصلاح‌شده و معیار موفقیت روشن."
    ];
  }
  return [
    "اجرای کمپین با گروه کنترل ثابت.",
    "ثبت exposure و outcome در سطح مشتری.",
    "صدور readout نهایی پس از بسته‌شدن پنجره سنجش."
  ];
}

function formatMoney(value) {
  if (value === null || value === undefined) return "داده موجود نیست";
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000) return `${formatNumber(Math.round(number / 1000000))} میلیون تومان`;
  return `${formatNumber(Math.round(number))} تومان`;
}

function formatRatio(value) {
  if (value === null || value === undefined) return "داده موجود نیست";
  return `${formatNumber(value)}x`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("fa-IR").format(Number(value || 0));
}

function formatDecimal(value, digits = 2) {
  if (value === null || value === undefined) return "محاسبه نشد";
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(Number(value));
}

function formatStatPercent(value) {
  return value === null || value === undefined ? "محاسبه نشد" : `${formatDecimal(Number(value) * 100, 1)}٪`;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function roundMoney(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function roundSix(value) {
  return Number.isFinite(value) ? Math.round(value * 1000000) / 1000000 : null;
}

function roundFourNullable(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

module.exports = {
  analyzeOutcomeRows,
  buildPilotReadout,
  buildPilotWorkspace,
  buildReadinessAudit,
  buildSavingsSnapshot
};

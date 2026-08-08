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

function buildReadinessAudit(customerAnalysis, campaignAnalysis, outcomeRecord) {
  const quality = customerAnalysis.quality || {};
  const hasCustomerData = customerAnalysis.model?.unitFa === "customer_id";
  const checks = {
    customer_id: hasCustomerData,
    control: Boolean(quality.hasControl),
    treatment: (customerAnalysis.treatmentStats || []).some(item => item.key !== "control"),
    exposure: hasCustomerData,
    outcome: Boolean(quality.hasOutcome),
    revenue: (customerAnalysis.summary?.expectedIncrementalProfit || 0) >= 0,
    gross_margin: Boolean(quality.hasMargin),
    incentive_cost: Boolean(customerAnalysis.finance),
    channel_cost: Boolean(customerAnalysis.finance)
  };
  const passed = requiredReadinessChecks.filter(([key]) => checks[key]).length;
  const score = Math.round((passed / requiredReadinessChecks.length) * 100);
  const status = statusFromReadiness(checks, score);

  return {
    score,
    status,
    statusFa: statusFa(status),
    claimLevel: outcomeRecord ? "verified_incremental" : status === "ready" ? "pilot_estimate" : "observational_estimate",
    claimLevelFa: outcomeRecord ? "اثر تأییدشده پایلوت" : status === "ready" ? "تخمین پایلوت" : "برآورد تاریخی",
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
  const finance = customerAnalysis.finance || {};
  const campaign = campaignAnalysis.campaign || {};
  const outcome = outcomeRecord?.summary;
  const verified = Boolean(outcome);
  return {
    headlineFa: "تخفیف کمتر، سود بیشتر",
    claimLevel: readiness.claimLevel,
    claimLevelFa: readiness.claimLevelFa,
    avoidableIncentiveCost: Math.max(0, finance.avoidableIncentiveCost || campaign.nextSavings || 0),
    expectedIncrementalProfit: Math.max(0, verified ? outcome.observedIncrementalProfit : finance.expectedIncrementalProfit || 0),
    revenueAtRisk: Math.max(0, customerAnalysis.summary?.atRiskCustomers || 0) * 1000000,
    pilotRoi: Math.max(0, verified ? outcome.observedRoi : finance.projectedRoi || 0),
    confidenceFa: confidenceLabel(readiness, outcomeRecord),
    decisionFa: verified ? outcome.recommendationFa : "آماده طراحی پایلوت برای اثبات اثر",
    evidenceTagFa: verified ? "verified incremental" : readiness.status === "ready" ? "pilot estimate" : "observational estimate"
  };
}

function buildPilotWorkspace(readiness, customerAnalysis, outcomeRecord) {
  const hasOutcome = Boolean(outcomeRecord);
  const outcomeNeedsReview = outcomeRecord?.summary?.decisionStatus === "needs_review";
  const dataReady = readiness.status !== "blocked";
  const holdoutReady = readiness.checks.find(item => item.key === "control")?.passed;
  return {
    overallStatusFa: hasOutcome ? "آماده تصمیم scale/stop" : dataReady ? "آماده اجرای پایلوت" : "در انتظار اصلاح داده",
    steps: [
      workspaceStep("data_received", "دریافت داده", "انجام‌شده", true),
      workspaceStep("data_validated", "اعتبارسنجی داده", dataReady ? "انجام‌شده" : "نیازمند اصلاح", dataReady),
      workspaceStep("historical_diagnostic", "تحلیل تاریخی", "انجام‌شده", true),
      workspaceStep("holdout_design", "طراحی holdout", holdoutReady ? "آماده اجرا" : "در انتظار مشتری", holdoutReady),
      workspaceStep("campaign_execution", "اجرای کمپین", hasOutcome ? "انجام‌شده" : "در انتظار مشتری", hasOutcome),
      workspaceStep("outcome_received", "دریافت outcome", hasOutcome ? "انجام‌شده" : "در انتظار مشتری", hasOutcome),
      workspaceStep("scale_stop", "تصمیم scale/stop", hasOutcome ? (outcomeNeedsReview ? "نیازمند اصلاح" : "آماده اجرا") : "در انتظار outcome", hasOutcome && !outcomeNeedsReview)
    ],
    ownerFa: "مدیر رشد یا CRM",
    decisionDeadlineFa: customerAnalysis.experimentPlan?.durationFa || "۳۰ روز پس از exposure"
  };
}

function analyzeOutcomeRows(rows, customerAnalysis) {
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
  const decisionStatus = observedIncrementalProfit < predictedProfit * 0.5 ? "needs_review" : observedIncrementalProfit > 0 ? "scale" : "stop";

  return {
    rowCount: rows.length,
    summary: {
      treatmentUsers: treatmentRows.length,
      controlUsers: controlRows.length,
      observedIncrementalProfit,
      predictedIncrementalProfit: Math.round(predictedProfit),
      predictionGap: Math.round(observedIncrementalProfit - predictedProfit),
      observedRoi,
      decisionStatus,
      recommendationFa: recommendationFa(decisionStatus)
    },
    checks: [
      { labelFa: "کنترل outcome", passed: controlRows.length > 0 },
      { labelFa: "درمان outcome", passed: treatmentRows.length > 0 },
      { labelFa: "هزینه واقعی", passed: rows.every(row => row.actualIncentiveCost >= 0 && row.actualChannelCost >= 0) },
      { labelFa: "درآمد outcome", passed: rows.some(row => row.outcomeRevenue > 0) }
    ]
  };
}

function buildPilotReadout(organization, readiness, snapshot, workspace, outcomeRecord) {
  const outcome = outcomeRecord?.summary;
  const lines = [
    `# گزارش پایلوت MarginLift برای ${organization.name}`,
    "",
    "## خلاصه مدیریتی",
    "",
    `- سطح شواهد: ${snapshot.claimLevelFa}`,
    `- تصمیم: ${snapshot.decisionFa}`,
    `- سطح اعتماد: ${snapshot.confidenceFa}`,
    `- هزینه مشوق قابل حذف: ${formatMoney(snapshot.avoidableIncentiveCost)}`,
    `- سود افزایشی: ${formatMoney(snapshot.expectedIncrementalProfit)}`,
    `- ROI پایلوت: ${formatNumber(snapshot.pilotRoi)}x`,
    "",
    "## آمادگی داده",
    "",
    `- وضعیت: ${readiness.statusFa}`,
    `- امتیاز: ${formatNumber(readiness.score)}٪`,
    `- قدم بعدی: ${readiness.nextStepFa}`,
    "",
    "## وضعیت Workspace",
    "",
    ...workspace.steps.map(step => `- ${step.labelFa}: ${step.statusFa}`),
    "",
    "## Outcome",
    "",
    outcome
      ? `- سود افزایشی مشاهده‌شده: ${formatMoney(outcome.observedIncrementalProfit)}`
      : "- هنوز outcome وارد نشده است.",
    outcome
      ? `- شکاف پیش‌بینی/واقعیت: ${formatMoney(outcome.predictionGap)}`
      : "- readout نهایی پس از بسته‌شدن پنجره outcome صادر می‌شود.",
    "",
    "## توصیه",
    "",
    outcome?.recommendationFa || "فعلا پایلوت live holdout را اجرا کنید و تا قبل از outcome ادعای verified incremental نکنید."
  ];
  return `${lines.join("\n")}\n`;
}

function statusFromReadiness(checks, score) {
  if (!checks.customer_id || !checks.treatment || !checks.revenue) return "blocked";
  if (!checks.control || !checks.exposure || !checks.outcome) return "diagnostic_only";
  return score >= 80 ? "ready" : "diagnostic_only";
}

function statusFa(status) {
  if (status === "ready") return "آماده تحلیل uplift";
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
  if ((campaignAnalysis.quality?.score || 0) < 80) notes.push("کیفیت داده سگمنتی باید قبل از scale اصلاح شود.");
  return notes.length ? notes : ["قرارداد داده برای پایلوت محدود آماده است."];
}

function confidenceLabel(readiness, outcomeRecord) {
  if (outcomeRecord) return outcomeRecord.summary?.decisionStatus === "needs_review" ? "نیازمند بازبینی" : "بالا";
  if (readiness.status === "ready") return "متوسط";
  if (readiness.status === "diagnostic_only") return "پایین تا متوسط";
  return "پایین";
}

function workspaceStep(key, labelFa, statusFa, complete) {
  return { key, labelFa, statusFa, complete };
}

function profit(rows) {
  return rows.reduce((sum, row) =>
    sum + row.outcomeRevenue * row.grossMarginRate - row.actualIncentiveCost - row.actualChannelCost,
  0);
}

function recommendationFa(status) {
  if (status === "scale") return "پایلوت مثبت است؛ با سقف بودجه کنترل‌شده scale کنید.";
  if (status === "stop") return "اثر مالی مثبت نشد؛ اجرای کامل متوقف شود.";
  return "نتیجه از پیش‌بینی ضعیف‌تر است؛ policy و داده باید بازبینی شوند.";
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000) return `${formatNumber(Math.round(number / 1000000))} میلیون تومان`;
  return `${formatNumber(Math.round(number))} تومان`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("fa-IR").format(Number(value || 0));
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

module.exports = {
  analyzeOutcomeRows,
  buildPilotReadout,
  buildPilotWorkspace,
  buildReadinessAudit,
  buildSavingsSnapshot
};

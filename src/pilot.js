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
  const decisionStatus = outcome?.decisionStatus || "pending";
  const nextActions = executiveNextActions(decisionStatus);
  const riskNotes = executiveRiskNotes(readiness, outcomeRecord);
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
    `| هزینه مشوق قابل حذف | ${formatMoney(snapshot.avoidableIncentiveCost)} | بخشی از بودجه مشوق که باید برای حذف یا بازتخصیص بررسی شود. |`,
    `| سود افزایشی مشاهده‌شده | ${formatMoney(snapshot.expectedIncrementalProfit)} | اثر مالی ثبت‌شده در این پایلوت، نه وعده قطعی برای کل بازار. |`,
    `| ROI پایلوت | ${formatNumber(snapshot.pilotRoi)}x | بازده پایلوت مثبت است، اما تصمیم scale به شکاف پیش‌بینی و واقعیت وابسته است. |`,
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
  if (status === "scale") return "پایلوت مثبت است؛ با سقف بودجه کنترل‌شده گسترش دهید.";
  if (status === "stop") return "اثر مالی مثبت نشد؛ اجرای گسترده متوقف شود.";
  return "نتیجه پایلوت از برآورد اولیه ضعیف‌تر است؛ قبل از افزایش بودجه، سیاست مشوق و کیفیت داده را بازبینی کنید.";
}

function executiveVerdictFa(status) {
  if (status === "scale") {
    return "پایلوت از نظر مالی مثبت بوده و می‌تواند با سقف بودجه مشخص وارد اجرای محدود بعدی شود.";
  }
  if (status === "stop") {
    return "پایلوت اثر مالی قابل دفاع نشان نداده است. اجرای گسترده فعلاً توصیه نمی‌شود.";
  }
  if (status === "needs_review") {
    return "پایلوت سود مثبت نشان داده، اما نتیجه واقعی به‌طور معنادار ضعیف‌تر از پیش‌بینی بوده است. تصمیم درست، افزایش بودجه نیست؛ بازبینی policy و داده است.";
  }
  return "داده آماده شده، اما تا زمان دریافت outcome واقعی نباید درباره افزایش بودجه تصمیم قطعی گرفت.";
}

function executiveRecommendationFa(status) {
  if (status === "scale") return "Scale کنترل‌شده با بودجه محدود و پایش هفتگی.";
  if (status === "stop") return "توقف اجرای گسترده و بازطراحی فرضیه کمپین.";
  if (status === "needs_review") return "بازبینی قبل از scale؛ بودجه جدید تا روشن‌شدن علت اختلاف آزاد نشود.";
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
    return "کمپین کاملاً شکست نخورده، اما آن‌قدر از پیش‌بینی فاصله دارد که برای اجرای بزرگ‌تر قابل اتکا نیست. باید مشخص شود مشکل از سگمنت‌بندی، مقدار مشوق، زمان‌بندی کمپین یا کیفیت ثبت outcome بوده است.";
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
    notes.push("شکاف منفی بین پیش‌بینی و نتیجه واقعی، ریسک over-targeting یا کیفیت پایین policy را نشان می‌دهد.");
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

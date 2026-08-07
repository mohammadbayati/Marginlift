const treatmentLabels = {
  control: "گروه کنترل",
  push_only: "فقط پوش",
  small_discount: "تخفیف کوچک",
  high_incentive: "مشوق قوی"
};

const actionLabels = {
  control: "بدون پیشنهاد",
  push_only: "فقط پوش",
  small_discount: "تخفیف کوچک",
  high_incentive: "مشوق قوی"
};

const orderedTreatments = ["control", "push_only", "small_discount", "high_incentive"];

function analyzeCustomers(rows, options = {}) {
  if (!rows.length) {
    throw new Error("برای تحلیل مشتری‌محور، حداقل یک ردیف customer_id لازم است.");
  }

  const quality = evaluateCustomerDataQuality(rows);
  const treatmentStats = buildTreatmentStats(rows);
  const controlStats = treatmentStats.find(item => item.key === "control") || treatmentStats[0];
  const bestTreatment = chooseBestTreatment(treatmentStats, controlStats);
  const customers = rows.map(row => scoreCustomer(row, treatmentStats, controlStats));
  const prioritizedCustomers = customers
    .slice()
    .sort((a, b) => b.expectedIncrementalProfit - a.expectedIncrementalProfit || b.riskScore - a.riskScore);
  const targetable = prioritizedCustomers.filter(customer => customer.recommendedAction !== "control");
  const finance = buildFinanceSummary(customers, targetable);
  const experimentPlan = buildExperimentPlan(rows, controlStats, bestTreatment);
  const channelExport = buildChannelExport(targetable);

  return {
    name: options.name || "تحلیل مشتری‌محور نگهداشت",
    createdAt: new Date().toISOString(),
    rowCount: rows.length,
    quality,
    model: {
      name: "Transparent Segment T-Learner",
      statusFa: quality.hasControl ? "آماده پایلوت" : "نیازمند کنترل",
      unitFa: "customer_id",
      noteFa: "نسخه اولیه اثر اقدام را از اختلاف treatment/control می‌گیرد و برای هر مشتری با ریسک و CLV وزن‌دهی می‌کند."
    },
    summary: {
      customers: rows.length,
      atRiskCustomers: customers.filter(customer => customer.riskBandFa !== "کم").length,
      targetableCustomers: targetable.length,
      expectedIncrementalProfit: finance.expectedIncrementalProfit,
      avoidableIncentiveCost: finance.avoidableIncentiveCost,
      projectedRoi: finance.projectedRoi,
      bestTreatmentFa: treatmentLabels[bestTreatment?.key] || "نامشخص"
    },
    finance,
    treatmentStats,
    customers: prioritizedCustomers.slice(0, 30),
    customer360: prioritizedCustomers.slice(0, 8),
    experimentPlan,
    channelExport
  };
}

function buildTreatmentStats(rows) {
  return orderedTreatments
    .map(key => {
      const groupRows = rows.filter(row => row.treatment === key);
      const users = groupRows.length;
      const conversions = groupRows.filter(row => row.converted).length;
      const revenue = groupRows.reduce((sum, row) => sum + row.outcomeRevenue, 0);
      const contributionRevenue = groupRows.reduce((sum, row) => sum + row.outcomeRevenue * row.grossMarginRate, 0);
      const totalCost = groupRows.reduce((sum, row) => sum + row.incentiveCost + row.channelCost, 0);
      const conversionRate = users > 0 ? conversions / users : 0;
      return {
        key,
        labelFa: treatmentLabels[key],
        users,
        conversions,
        conversionRate,
        conversionRateFa: roundOne(conversionRate * 100),
        revenue: Math.round(revenue),
        contributionProfit: Math.round(contributionRevenue - totalCost),
        averageCost: users > 0 ? Math.round(totalCost / users) : 0,
        averageContribution: users > 0 ? Math.round(contributionRevenue / users) : 0
      };
    })
    .filter(item => item.users > 0);
}

function chooseBestTreatment(treatmentStats, controlStats) {
  return treatmentStats
    .filter(item => item.key !== "control")
    .map(item => ({
      ...item,
      incrementalRate: item.conversionRate - (controlStats?.conversionRate || 0),
      incrementalContribution: item.averageContribution - (controlStats?.averageContribution || 0) - item.averageCost
    }))
    .sort((a, b) => b.incrementalContribution - a.incrementalContribution || b.incrementalRate - a.incrementalRate)[0];
}

function scoreCustomer(row, treatmentStats, controlStats) {
  const riskScore = calculateRiskScore(row);
  const clv = Math.round(row.revenue90d * row.grossMarginRate * 1.8);
  const viableTreatments = treatmentStats
    .filter(item => item.key !== "control")
    .map(item => {
      const incrementalRate = Math.max(0, item.conversionRate - (controlStats?.conversionRate || 0));
      const expectedContribution = incrementalRate * Math.max(clv, item.averageContribution);
      const expectedIncrementalProfit = Math.round(expectedContribution - item.averageCost);
      return {
        key: item.key,
        actionFa: actionLabels[item.key],
        expectedIncrementalProfit,
        upliftScore: roundOne(incrementalRate * 100),
        cost: item.averageCost
      };
    })
    .sort((a, b) => b.expectedIncrementalProfit - a.expectedIncrementalProfit || a.cost - b.cost);

  const winner = viableTreatments[0] || { key: "control", actionFa: "بدون پیشنهاد", expectedIncrementalProfit: 0, upliftScore: 0 };
  const shouldAct = winner.expectedIncrementalProfit > 0 && riskScore >= 35;
  const recommended = shouldAct ? winner : { key: "control", actionFa: "بدون پیشنهاد", expectedIncrementalProfit: 0, upliftScore: 0, cost: 0 };

  return {
    customerId: row.customerId,
    segmentFa: row.segmentFa,
    riskScore,
    riskBandFa: riskBand(riskScore),
    clv,
    valueTierFa: clv >= 3000000 ? "ارزش بالا" : clv >= 1200000 ? "ارزش متوسط" : "ارزش پایین",
    lastPurchaseFa: row.daysSinceLastPurchase ? `${row.daysSinceLastPurchase} روز قبل` : "نامشخص",
    orders90d: row.orders90d,
    recommendedAction: recommended.key,
    recommendedActionFa: recommended.actionFa,
    upliftScore: recommended.upliftScore,
    expectedIncrementalProfit: recommended.expectedIncrementalProfit,
    reactionTypeFa: classifyReactionType(riskScore, recommended),
    reasonFa: buildCustomerReason(row, riskScore, clv, recommended)
  };
}

function calculateRiskScore(row) {
  const recency = Math.min(45, row.daysSinceLastPurchase * 0.65);
  const inactivity = row.orders90d <= 0 ? 25 : row.orders90d === 1 ? 14 : 4;
  const churn = row.churned ? 25 : 0;
  const lowValueSignal = row.revenue90d <= 0 ? 8 : 0;
  return Math.max(0, Math.min(100, Math.round(recency + inactivity + churn + lowValueSignal)));
}

function buildFinanceSummary(customers, targetable) {
  const expectedIncrementalProfit = targetable.reduce((sum, customer) => sum + customer.expectedIncrementalProfit, 0);
  const avoidableIncentiveCost = customers
    .filter(customer => customer.recommendedAction === "control")
    .reduce((sum, customer) => sum + Math.max(0, customer.clv * 0.04), 0);
  const estimatedSpend = targetable.reduce((sum, customer) => sum + Math.max(0, customer.clv * 0.03), 0);
  return {
    expectedIncrementalProfit: Math.round(expectedIncrementalProfit),
    avoidableIncentiveCost: Math.round(avoidableIncentiveCost),
    estimatedSpend: Math.round(estimatedSpend),
    projectedRoi: estimatedSpend > 0 ? roundOne(expectedIncrementalProfit / estimatedSpend) : 0,
    paybackFa: expectedIncrementalProfit > 0 ? "کمتر از یک چرخه کمپین" : "نیازمند داده بیشتر"
  };
}

function buildExperimentPlan(rows, controlStats, bestTreatment) {
  const baselineRate = controlStats?.conversionRate || 0.05;
  const mde = Math.max(0.015, (bestTreatment?.conversionRate || baselineRate) - baselineRate);
  const samplePerGroup = estimateSampleSize(baselineRate, mde);
  return {
    hypothesisFa: "اگر اقدام پیشنهادی فقط روی مشتریان دارای سود افزایشی مثبت اجرا شود، سود نگهداشت افزایشی نسبت به سیاست فعلی بیشتر می‌شود، چون هزینه مشوق از مشتریان قطعی و کم‌اثر حذف می‌شود.",
    primaryMetricFa: "سود افزایشی به‌ازای هر مشتری هدف‌گیری‌شده",
    guardrailsFa: ["درآمد کل", "نرخ تبدیل", "هزینه مشوق", "نسبت نمونه کنترل", "نارضایتی یا لغو"],
    audienceFa: "مشتریان با ریسک متوسط یا زیاد و CLV مثبت",
    recommendedHoldoutFa: "۱۰٪ کنترل تصادفی در هر سگمنت",
    durationFa: "۳۰ روز outcome بعد از exposure",
    sampleSize: {
      baselineConversionRate: roundOne(baselineRate * 100),
      minimumDetectableEffect: roundOne(mde * 100),
      perGroup: samplePerGroup,
      total: samplePerGroup * 2,
      currentRows: rows.length
    }
  };
}

function buildChannelExport(customers) {
  return customers.slice(0, 100).map(customer => ({
    customer_id: customer.customerId,
    segment_fa: customer.segmentFa,
    recommended_action: customer.recommendedAction,
    recommended_action_fa: customer.recommendedActionFa,
    risk_score: customer.riskScore,
    clv_toman: customer.clv,
    expected_incremental_profit_toman: customer.expectedIncrementalProfit,
    reason_fa: customer.reasonFa
  }));
}

function evaluateCustomerDataQuality(rows) {
  const issues = [];
  const hasControl = rows.some(row => row.treatment === "control");
  const hasOutcome = rows.some(row => row.converted || row.outcomeRevenue > 0);
  const hasMargin = rows.every(row => row.grossMarginRate > 0 && row.grossMarginRate <= 1);
  const uniqueCustomers = new Set(rows.map(row => row.customerId));
  if (!hasControl) issues.push("گروه کنترل در داده مشتری‌محور وجود ندارد.");
  if (!hasOutcome) issues.push("هیچ outcome قابل‌سنجشی در داده دیده نشد.");
  if (uniqueCustomers.size !== rows.length) issues.push("customer_id تکراری وجود دارد؛ برای نسخه رویدادی باید aggregation مشخص شود.");
  if (!hasMargin) issues.push("حاشیه سود باید بین صفر و یک باشد.");
  return {
    score: Math.max(0, 100 - issues.length * 25),
    labelFa: issues.length ? "نیازمند اصلاح" : "آماده تحلیل",
    hasControl,
    hasOutcome,
    hasMargin,
    issues
  };
}

function estimateSampleSize(baselineRate, mde) {
  const p1 = Math.max(0.001, Math.min(0.999, baselineRate));
  const p2 = Math.max(0.001, Math.min(0.999, baselineRate + mde));
  const pooled = (p1 + p2) / 2;
  const zAlpha = 1.96;
  const zBeta = 0.84;
  const numerator = Math.pow(
    zAlpha * Math.sqrt(2 * pooled * (1 - pooled)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
    2
  );
  return Math.max(50, Math.ceil(numerator / Math.pow(p2 - p1, 2)));
}

function riskBand(score) {
  if (score >= 70) return "زیاد";
  if (score >= 35) return "متوسط";
  return "کم";
}

function classifyReactionType(riskScore, action) {
  if (action.key === "control") return riskScore < 35 ? "خریدار قطعی یا کم‌ریسک" : "عدم اقدام اقتصادی";
  if (action.expectedIncrementalProfit > 0) return "قابل‌نجات";
  return "نیازمند آزمایش";
}

function buildCustomerReason(row, riskScore, clv, action) {
  if (action.key === "control") {
    return "اثر افزایشی یا ریسک اقتصادی برای خرج‌کردن کافی نیست؛ مشتری در کنترل یا مراقبت کم‌هزینه بماند.";
  }
  return `ریسک ${riskBand(riskScore)}، CLV ${Math.round(clv).toLocaleString("fa-IR")} تومان و uplift ${action.upliftScore.toLocaleString("fa-IR")} واحدی، این اقدام را توجیه می‌کند.`;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

module.exports = {
  analyzeCustomers
};

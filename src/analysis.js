const groupLabels = {
  control: "گروه کنترل",
  push_only: "فقط پوش",
  small_discount: "تخفیف کوچک",
  high_incentive: "مشوق قوی"
};

const actionToGroup = {
  "بدون پیشنهاد": "control",
  "فقط پوش": "push_only",
  "تخفیف کوچک": "small_discount",
  "مشوق قوی": "high_incentive"
};

const groupToAction = {
  control: "بدون پیشنهاد",
  push_only: "فقط پوش",
  small_discount: "تخفیف کوچک",
  high_incentive: "مشوق قوی"
};

const actionNotes = {
  "بدون پیشنهاد": "به کاربرانی که احتمالاً بدون تخفیف هم خرید می‌کنند، تخفیف نده.",
  "فقط پوش": "قبل از خرج‌کردن مشوق پولی، از کانال رایگان استفاده کن.",
  "تخفیف کوچک": "کاربران قابل متقاعدسازی را با هزینه کنترل‌شده هدف بگیر.",
  "مشوق قوی": "مشوق قوی را برای کاربران غیرفعال اما باارزش بالا نگه دار."
};

const orderedGroups = ["control", "push_only", "small_discount", "high_incentive"];
const actionOrder = ["بدون پیشنهاد", "فقط پوش", "تخفیف کوچک", "مشوق قوی"];
const revenueGuardrail = 90;
const minSegmentUsers = 100;
const minCampaignUsers = 1000;
const defaultBaselineGroup = "high_incentive";

function analyzeCampaign(rows, options = {}) {
  if (!rows.length) {
    throw new Error("برای تحلیل، حداقل یک ردیف کمپین لازم است.");
  }

  const normalizedRows = rows.map(normalizeRow);
  const quality = evaluateDataQuality(normalizedRows);
  const segmentsByName = groupBy(normalizedRows, row => row.segmentFa);
  const segmentResults = Object.entries(segmentsByName).map(([segmentFa, segmentRows]) =>
    analyzeSegment(segmentFa, segmentRows, quality)
  );

  const treatmentResults = analyzeTreatments(normalizedRows);
  const baseline = aggregatePolicy(segmentResults, "baseline");
  const recommended = aggregatePolicy(segmentResults, "recommended");
  const observed = aggregateObserved(normalizedRows);
  const nextSavings = Math.max(0, baseline.spend - recommended.spend);
  const observedSavings = Math.max(0, observed.spend - recommended.spend);
  const revenuePreserved = baseline.revenue > 0
    ? Math.round((recommended.revenue / baseline.revenue) * 100)
    : 100;
  const baselineProfit = baseline.profit;
  const recommendedProfit = recommended.profit;
  const contributionProfitLift = baselineProfit > 0
    ? Math.round(((recommendedProfit - baselineProfit) / baselineProfit) * 100)
    : 0;

  const actionResults = aggregateActions(segmentResults);
  const wasteItems = buildWasteItems(baseline.spend, recommended.spend, segmentResults);
  const guardrails = buildGuardrails({
    quality,
    segmentResults,
    baseline,
    observed,
    recommended,
    revenuePreserved
  });

  const campaign = {
    name: options.name || "کمپین تحلیل‌شده",
    audience: segmentResults.reduce((sum, segment) => sum + segment.users, 0),
    totalSpend: Math.round(baseline.spend),
    reportedRevenue: Math.round(baseline.revenue),
    observedSpend: Math.round(observed.spend),
    observedRevenue: Math.round(observed.revenue),
    nonIncrementalSpend: Math.round(nextSavings),
    nextSavings: Math.round(nextSavings),
    observedSavings: Math.round(observedSavings),
    baselineSpend: Math.round(baseline.spend),
    baselineRevenue: Math.round(baseline.revenue),
    baselineContributionProfit: Math.round(baselineProfit),
    recommendedSpend: Math.round(recommended.spend),
    recommendedRevenue: Math.round(recommended.revenue),
    recommendedContributionProfit: Math.round(recommendedProfit),
    contributionProfitLift,
    baselineLabelFa: baseline.labelFa,
    baselineSourceFa: baseline.sourceFa,
    revenuePreserved,
    marginLift: contributionProfitLift,
    confidence: quality.confidence,
    createdAt: new Date().toISOString()
  };

  return {
    campaign,
    policy: {
      observed: summarizePolicy(observed),
      baseline: summarizePolicy(baseline),
      current: summarizePolicy(baseline),
      recommended: summarizePolicy(recommended),
      delta: {
        spend: Math.round(recommended.spend - baseline.spend),
        revenue: Math.round(recommended.revenue - baseline.revenue),
        margin: Math.round(recommendedProfit - baselineProfit),
        savings: Math.round(nextSavings),
        observedSavings: Math.round(observedSavings),
        revenuePreserved
      }
    },
    quality,
    guardrails,
    treatments: treatmentResults,
    segments: segmentResults.map(toPublicSegment),
    actions: actionResults,
    wasteItems,
    insight: buildInsight(segmentResults)
  };
}

function normalizeRow(row) {
  return {
    ...row,
    group: normalizeGroup(row.group),
    users: Number(row.users),
    conversionRate: Number(row.conversionRate),
    costPerUser: Number(row.costPerUser || 0),
    estimatedRevenue: Number(row.estimatedRevenue || 0),
    grossMarginRate: clampRate(Number.isFinite(Number(row.grossMarginRate)) ? Number(row.grossMarginRate) : 1),
    channelCostPerUser: Number(row.channelCostPerUser || 0),
    fulfillmentSubsidyPerUser: Number(row.fulfillmentSubsidyPerUser || 0),
    baselinePolicy: normalizeGroup(row.baselinePolicy),
    isBaseline: Boolean(row.isBaseline)
  };
}

function analyzeSegment(nameFa, rows, quality) {
  const rowsByGroup = new Map(rows.map(row => [row.group, withDerivedRowMetrics(row)]));
  const control = rowsByGroup.get("control") || findLowestCostRow(rowsByGroup);
  const baseline = selectBaselineRow(rowsByGroup) || rowsByGroup.get(defaultBaselineGroup) || findHighestCostRow(rowsByGroup);
  const users = rows.reduce((sum, row) => sum + row.users, 0);
  const candidates = [...rowsByGroup.values()].map(row => evaluateCandidate(row, control, users));
  const recommended = chooseRecommendedCandidate(candidates);
  const actionFa = groupToAction[recommended.group] || "بدون پیشنهاد";

  return {
    nameFa,
    users,
    actionFa,
    uplift: recommended.liftPoints,
    reasonFa: buildReason(actionFa, recommended, quality),
    baseline: projectedPolicy(baseline, users),
    current: projectedPolicy(baseline, users),
    recommended: projectedPolicy(recommended, users),
    currentGroupFa: groupLabels[baseline.group] || baseline.group,
    baselineGroupFa: groupLabels[baseline.group] || baseline.group,
    recommendedGroupFa: groupLabels[recommended.group] || recommended.group,
    evidence: {
      liftPoints: recommended.liftPoints,
      ciLow: recommended.ciLow,
      ciHigh: recommended.ciHigh,
      incrementalConversions: recommended.incrementalConversions,
      incrementalRevenue: recommended.incrementalRevenue,
      incrementalProfit: recommended.incrementalProfit,
      lowerBoundProfit: recommended.lowerBoundProfit,
      roi: recommended.roi,
      confidenceLevel: evidenceLevel(recommended, quality),
      decisionScore: recommended.decisionScore,
      decisionStatus: recommended.decisionStatus
    }
  };
}

function withDerivedRowMetrics(row) {
  const convertedUsers = row.users * row.conversionRate;
  const contributionRevenue = row.estimatedRevenue * row.grossMarginRate;
  const variableCostPerUser = row.costPerUser + row.channelCostPerUser + row.fulfillmentSubsidyPerUser;
  return {
    ...row,
    revenuePerUser: row.users > 0 ? row.estimatedRevenue / row.users : 0,
    contributionRevenue,
    contributionRevenuePerUser: row.users > 0 ? contributionRevenue / row.users : 0,
    revenuePerConversion: convertedUsers > 0 ? row.estimatedRevenue / convertedUsers : 0,
    contributionPerConversion: convertedUsers > 0 ? contributionRevenue / convertedUsers : 0,
    variableCostPerUser,
    totalCost: variableCostPerUser * row.users
  };
}

function evaluateCandidate(row, control, segmentUsers) {
  const liftRate = row.conversionRate - control.conversionRate;
  const liftPoints = liftRate * 100;
  const comparedToSelf = row.group === control.group;
  const standardError = comparedToSelf ? 0 : Math.sqrt(
    safeVariance(row.conversionRate, row.users) + safeVariance(control.conversionRate, control.users)
  );
  const ciLow = (liftRate - 1.96 * standardError) * 100;
  const ciHigh = (liftRate + 1.96 * standardError) * 100;
  const incrementalConversions = liftRate * segmentUsers;
  const incrementalRevenue = incrementalConversions * row.revenuePerConversion;
  const incrementalContribution = incrementalConversions * row.contributionPerConversion;
  const spend = row.costPerUser * segmentUsers;
  const totalCost = row.variableCostPerUser * segmentUsers;
  const projectedRevenue = row.revenuePerUser * segmentUsers;
  const projectedContribution = row.contributionRevenuePerUser * segmentUsers;
  const projectedProfit = projectedContribution - totalCost;
  const lowerBoundContribution = (ciLow / 100) * segmentUsers * row.contributionPerConversion;
  const incrementalProfit = incrementalContribution - totalCost;
  const lowerBoundProfit = lowerBoundContribution - totalCost;
  const roi = totalCost > 0 ? incrementalProfit / totalCost : (incrementalProfit > 0 ? Infinity : 0);
  const riskPenaltyFactor = row.costPerUser === 0 ? 0.35 : 1;
  const decisionScore = projectedProfit -
    totalCost * 0.05 +
    Math.min(0, ciLow / 100) * segmentUsers * row.revenuePerConversion * riskPenaltyFactor;
  const decisionStatus = classifyDecision(row, {
    comparedToSelf,
    liftPoints,
    incrementalProfit,
    lowerBoundProfit,
    ciHigh
  });

  return {
    ...row,
    liftPoints: roundOne(liftPoints),
    ciLow: roundOne(ciLow),
    ciHigh: roundOne(ciHigh),
    incrementalConversions: Math.round(incrementalConversions),
    incrementalRevenue: Math.round(incrementalRevenue),
    incrementalProfit: Math.round(incrementalProfit),
    lowerBoundProfit: Math.round(lowerBoundProfit),
    projectedRevenue,
    projectedContribution,
    projectedProfit,
    projectedSpend: spend,
    projectedTotalCost: totalCost,
    roi,
    decisionScore,
    decisionStatus
  };
}

function classifyDecision(row, evidence) {
  if (row.group === "control") return "execute";
  if (evidence.liftPoints < 1 || evidence.ciHigh <= 0) return "no_action";
  if (row.costPerUser === 0 && evidence.incrementalProfit > 0) {
    return "execute";
  }
  if (evidence.lowerBoundProfit > 0 && evidence.incrementalProfit > 0) return "execute";
  if (evidence.incrementalProfit > 0) return "test_more";
  return "no_action";
}

function chooseRecommendedCandidate(candidates) {
  const candidatesWithSignal = candidates.filter(candidate => candidate.decisionStatus !== "no_action");

  return (candidatesWithSignal.length ? candidatesWithSignal : candidates)
    .slice()
    .sort((a, b) => b.decisionScore - a.decisionScore || a.projectedTotalCost - b.projectedTotalCost)[0];
}

function analyzeTreatments(rows) {
  const grouped = groupBy(rows, row => normalizeGroup(row.group));
  const controlRows = grouped.control || [];
  const controlUsers = controlRows.reduce((sum, row) => sum + row.users, 0);
  const controlConversion = weightedAverage(controlRows, row => row.conversionRate, row => row.users);

  return Object.entries(grouped)
    .map(([group, groupRows]) => {
      const users = groupRows.reduce((sum, row) => sum + row.users, 0);
      const weightedConversion = weightedAverage(groupRows, row => row.conversionRate, row => row.users);
      const avgCost = weightedAverage(groupRows, row => row.costPerUser, row => row.users);
      const avgGrossMargin = weightedAverage(groupRows, row => row.grossMarginRate, row => row.users);
      const se = Math.sqrt(
        safeVariance(weightedConversion, Math.max(1, users)) +
        safeVariance(controlConversion, Math.max(1, controlUsers))
      );
      const liftPoints = (weightedConversion - controlConversion) * 100;

      return {
        key: group,
        labelFa: groupLabels[group] || group,
        conversion: roundOne(weightedConversion * 100),
        lift: roundOne(liftPoints),
        ciLow: roundOne((weightedConversion - controlConversion - 1.96 * se) * 100),
        ciHigh: roundOne((weightedConversion - controlConversion + 1.96 * se) * 100),
        costPerUser: Math.round(avgCost),
        grossMarginRate: roundOne(avgGrossMargin * 100),
        users
      };
    })
    .sort((a, b) => treatmentRank(a.key) - treatmentRank(b.key));
}

function evaluateDataQuality(rows) {
  const issues = [];
  const warnings = [];
  const segmentsByName = groupBy(rows, row => row.segmentFa);
  const knownGroups = new Set(orderedGroups);

  rows.forEach((row, index) => {
    if (!knownGroups.has(row.group)) {
      issues.push(`ردیف ${index + 2}: نوع گروه کمپین شناخته‌شده نیست.`);
    }
    if (!Number.isFinite(row.users) || row.users <= 0) {
      issues.push(`ردیف ${index + 2}: تعداد کاربران باید بزرگ‌تر از صفر باشد.`);
    }
    if (!Number.isFinite(row.conversionRate) || row.conversionRate < 0 || row.conversionRate > 1) {
      issues.push(`ردیف ${index + 2}: نرخ تبدیل باید بین صفر و یک باشد.`);
    }
    if (
      row.costPerUser < 0 ||
      row.channelCostPerUser < 0 ||
      row.fulfillmentSubsidyPerUser < 0 ||
      row.estimatedRevenue < 0
    ) {
      issues.push(`ردیف ${index + 2}: هزینه و درآمد نمی‌توانند منفی باشند.`);
    }
    if (!Number.isFinite(row.grossMarginRate) || row.grossMarginRate <= 0 || row.grossMarginRate > 1) {
      issues.push(`ردیف ${index + 2}: نرخ حاشیه سود باید بین صفر و یک باشد.`);
    }
  });

  Object.entries(segmentsByName).forEach(([segment, segmentRows]) => {
    const groups = segmentRows.map(row => row.group);
    const uniqueGroups = new Set(groups);
    if (!uniqueGroups.has("control")) {
      issues.push(`سگمنت «${segment}» گروه کنترل ندارد.`);
    }
    if (uniqueGroups.size !== groups.length) {
      warnings.push(`سگمنت «${segment}» برای بعضی گروه‌ها ردیف تکراری دارد.`);
    }
    const segmentUsers = segmentRows.reduce((sum, row) => sum + row.users, 0);
    if (segmentUsers < minSegmentUsers) {
      warnings.push(`سگمنت «${segment}» حجم نمونه کمی دارد.`);
    }
    if (!selectBaselineRow(new Map(segmentRows.map(row => [row.group, row])))) {
      warnings.push(`سگمنت «${segment}» baseline صریح ندارد و فعلاً «مشوق قوی» به‌عنوان خط مبنا فرض شده است.`);
    }
  });

  const totalUsers = rows.reduce((sum, row) => sum + row.users, 0);
  if (totalUsers < minCampaignUsers) {
    warnings.push("حجم کل کمپین برای تصمیم مالی قطعی کم است.");
  }
  if (rows.some(row => row.grossMarginRate === 1)) {
    warnings.push("برای بخشی از داده‌ها حاشیه سود ناخالص ارسال نشده و محاسبه سود محافظه‌کارانه نیست.");
  }

  const score = Math.max(0, 100 - issues.length * 30 - warnings.length * 10);
  return {
    score,
    labelFa: score >= 85 ? "قابل اعتماد" : score >= 65 ? "نیازمند احتیاط" : "ضعیف",
    confidence: score >= 85 ? 88 : score >= 65 ? 72 : 55,
    issues,
    warnings,
    checks: [
      { labelFa: "وجود گروه کنترل", passed: Object.values(segmentsByName).every(segmentRows => segmentRows.some(row => row.group === "control")) },
      { labelFa: "نرخ تبدیل معتبر", passed: rows.every(row => row.conversionRate >= 0 && row.conversionRate <= 1) },
      { labelFa: "حجم داده کافی", passed: totalUsers >= minCampaignUsers },
      { labelFa: "مدل هزینه کامل", passed: rows.every(row => row.grossMarginRate < 1) },
      { labelFa: "هزینه و درآمد غیرمنفی", passed: rows.every(row =>
        row.costPerUser >= 0 &&
        row.channelCostPerUser >= 0 &&
        row.fulfillmentSubsidyPerUser >= 0 &&
        row.estimatedRevenue >= 0
      ) }
    ]
  };
}

function buildGuardrails({ quality, segmentResults, baseline, observed, recommended, revenuePreserved }) {
  const paidSegments = segmentResults.filter(segment => segment.recommended.spend > 0);
  const executablePaid = paidSegments.filter(segment => segment.evidence.decisionStatus === "execute");
  const baselineProfit = baseline.profit;
  const recommendedProfit = recommended.profit;
  const observedSpendDelta = observed.spend - recommended.spend;

  return [
    {
      labelFa: "کیفیت داده",
      valueFa: `${quality.score}٪`,
      status: quality.issues.length === 0 ? "pass" : "fail",
      noteFa: quality.issues.length === 0 ? "Schema و گروه کنترل قابل قبول‌اند." : quality.issues[0]
    },
    {
      labelFa: "درآمد محافظت‌شده",
      valueFa: `${revenuePreserved}٪`,
      status: revenuePreserved >= revenueGuardrail ? "pass" : "warn",
      noteFa: `حداقل قابل قبول برای پایلوت ${revenueGuardrail}٪ است.`
    },
    {
      labelFa: "ریسک تصمیم پولی",
      valueFa: `${executablePaid.length}/${paidSegments.length || 0}`,
      status: executablePaid.length === paidSegments.length ? "pass" : "warn",
      noteFa: "مشوق پولی فقط وقتی «اجرا» می‌شود که سود افزایشی و کران پایین ریسک قابل قبول باشد."
    },
    {
      labelFa: "سود مشارکتی",
      valueFa: recommendedProfit >= baselineProfit ? "بهبود" : "افت",
      status: recommendedProfit >= baselineProfit ? "pass" : "warn",
      noteFa: `تغییر سود مشارکتی نسبت به baseline: ${formatSignedMoney(recommendedProfit - baselineProfit)}.`
    },
    {
      labelFa: "اثر روی هزینه مشاهده‌شده",
      valueFa: formatSignedMoney(observedSpendDelta),
      status: observedSpendDelta >= 0 ? "pass" : "warn",
      noteFa: "این عدد نسبت به هزینه‌ای است که واقعاً در فایل دیده شده، نه سناریوی شبیه‌سازی‌شده."
    }
  ];
}

function aggregatePolicy(segments, key) {
  return segments.reduce((totals, segment) => ({
    spend: totals.spend + segment[key].spend,
    totalCost: totals.totalCost + segment[key].totalCost,
    revenue: totals.revenue + segment[key].revenue,
    contributionRevenue: totals.contributionRevenue + segment[key].contributionRevenue,
    profit: totals.profit + segment[key].profit,
    labelFa: segment[key].labelFa || totals.labelFa,
    sourceFa: segment[key].sourceFa || totals.sourceFa
  }), emptyPolicy());
}

function aggregateObserved(rows) {
  return rows.reduce((totals, row) => {
    const contributionRevenue = row.estimatedRevenue * row.grossMarginRate;
    const totalCost = (row.costPerUser + row.channelCostPerUser + row.fulfillmentSubsidyPerUser) * row.users;
    return {
      spend: totals.spend + row.costPerUser * row.users,
      totalCost: totals.totalCost + totalCost,
      revenue: totals.revenue + row.estimatedRevenue,
      contributionRevenue: totals.contributionRevenue + contributionRevenue,
      profit: totals.profit + contributionRevenue - totalCost,
      labelFa: "تخصیص مشاهده‌شده",
      sourceFa: "واقعی"
    };
  }, emptyPolicy());
}

function emptyPolicy() {
  return {
    spend: 0,
    totalCost: 0,
    revenue: 0,
    contributionRevenue: 0,
    profit: 0,
    labelFa: "",
    sourceFa: ""
  };
}

function aggregateActions(segments) {
  const byAction = new Map(actionOrder.map(action => [action, {
    titleFa: action,
    users: 0,
    cost: 0,
    revenue: 0,
    noteFa: actionNotes[action] || "این تصمیم با توجه به اثر افزایشی و هزینه مشوق پیشنهاد شده است."
  }]));

  segments.forEach(segment => {
    const action = byAction.get(segment.actionFa) || byAction.get("بدون پیشنهاد");
    action.users += segment.users;
    action.cost += segment.recommended.spend;
    action.revenue += segment.recommended.revenue;
  });

  return [...byAction.values()].map(action => ({
    ...action,
    cost: Math.round(action.cost),
    revenue: Math.round(action.revenue)
  }));
}

function buildWasteItems(currentSpend, recommendedSpend, segments) {
  const noOfferSavings = segments
    .filter(segment => segment.actionFa === "بدون پیشنهاد")
    .reduce((sum, segment) => sum + Math.max(0, segment.current.spend - segment.recommended.spend), 0);
  const lowTouchSavings = segments
    .filter(segment => segment.actionFa === "فقط پوش")
    .reduce((sum, segment) => sum + Math.max(0, segment.current.spend - segment.recommended.spend), 0);
  const useful = Math.max(0, recommendedSpend);
  const total = Math.max(1, currentSpend);

  return [
    { label: "مشوق مفید", value: percent(useful, total), colorKey: "useful" },
    { label: "کاربران قطعی", value: percent(noOfferSavings, total), colorKey: "high" },
    { label: "هدررفت کم‌واکنش", value: percent(lowTouchSavings, total), colorKey: "waste" }
  ];
}

function buildInsight(segments) {
  const sureUsers = segments
    .filter(segment => segment.actionFa === "بدون پیشنهاد")
    .reduce((sum, segment) => sum + segment.users, 0);
  const totalUsers = segments.reduce((sum, segment) => sum + segment.users, 0);
  const share = totalUsers > 0 ? Math.round((sureUsers / totalUsers) * 100) : 0;
  return `${share}٪ از کاربران کمپین احتمالاً بدون مشوق پولی هم خرید می‌کنند.`;
}

function toPublicSegment(segment) {
  return {
    nameFa: segment.nameFa,
    users: segment.users,
    actionFa: segment.actionFa,
    uplift: roundOne(segment.uplift),
    reasonFa: segment.reasonFa,
    currentGroupFa: segment.currentGroupFa,
    baselineGroupFa: segment.baselineGroupFa,
    recommendedGroupFa: segment.recommendedGroupFa,
    currentSpend: Math.round(segment.current.spend),
    baselineSpend: Math.round(segment.baseline.spend),
    recommendedSpend: Math.round(segment.recommended.spend),
    projectedRevenue: Math.round(segment.recommended.revenue),
    projectedContributionProfit: Math.round(segment.recommended.profit),
    incrementalProfit: segment.evidence.incrementalProfit,
    lowerBoundProfit: segment.evidence.lowerBoundProfit,
    ciLow: segment.evidence.ciLow,
    ciHigh: segment.evidence.ciHigh,
    confidenceLevel: segment.evidence.confidenceLevel,
    decisionStatus: segment.evidence.decisionStatus,
    decisionStatusFa: decisionStatusFa(segment.evidence.decisionStatus)
  };
}

function summarizePolicy(policy) {
  return {
    spend: Math.round(policy.spend),
    totalCost: Math.round(policy.totalCost || policy.spend),
    revenue: Math.round(policy.revenue),
    contributionRevenue: Math.round(policy.contributionRevenue || policy.revenue),
    margin: Math.round(policy.profit ?? (policy.revenue - policy.spend)),
    profit: Math.round(policy.profit ?? (policy.revenue - policy.spend)),
    labelFa: policy.labelFa || "",
    sourceFa: policy.sourceFa || ""
  };
}

function projectedPolicy(row, users) {
  return {
    spend: row.costPerUser * users,
    totalCost: row.variableCostPerUser * users,
    revenue: row.revenuePerUser * users,
    contributionRevenue: row.contributionRevenuePerUser * users,
    profit: row.contributionRevenuePerUser * users - row.variableCostPerUser * users,
    labelFa: groupLabels[row.group] || row.group,
    sourceFa: row.isBaseline || row.baselinePolicy === row.group ? "baseline صریح" : "baseline پیش‌فرض"
  };
}

function buildReason(action, candidate, quality) {
  if (quality.issues.length) return "این پیشنهاد با احتیاط ارائه شده؛ قبل از اجرای کمپین، مشکل داده باید رفع شود.";
  if (candidate.decisionStatus === "test_more") return "اثر اقتصادی مثبت دیده می‌شود، اما بازه اطمینان هنوز برای اجرای کامل کافی نیست؛ این سگمنت باید با holdout کوچک‌تر تست شود.";
  if (candidate.decisionStatus === "no_action") return "اثر افزایشی یا سود مشارکتی هنوز برای خرج‌کردن بودجه کافی نیست.";
  if (action === "بدون پیشنهاد") return "احتمال خرید بدون تخفیف بالاست و مشوق پولی حاشیه سود را کم می‌کند.";
  if (action === "فقط پوش") return "پیام کم‌هزینه برای ساختن اثر افزایشی کافی است.";
  if (action === "تخفیف کوچک") {
    return `واکنش افزایشی ${roundOne(candidate.liftPoints)} واحدی، پیشنهاد متوسط را توجیه می‌کند.`;
  }
  if (action === "مشوق قوی") {
    return `اثر افزایشی ${roundOne(candidate.liftPoints)} واحدی و سود افزایشی مثبت، مشوق قوی‌تر را توجیه می‌کند.`;
  }
  return `اثر افزایشی ${roundOne(candidate.liftPoints)} واحدی این تصمیم را توجیه می‌کند.`;
}

function evidenceLevel(candidate, quality) {
  if (quality.issues.length) return "نیازمند اصلاح داده";
  if (candidate.group === "control") return "محافظه‌کار";
  if (candidate.decisionStatus === "execute" && candidate.ciLow > 0 && candidate.incrementalProfit > 0) return "قوی";
  if (candidate.decisionStatus === "test_more") return "نیازمند آزمایش";
  if (candidate.ciHigh > 0 && candidate.incrementalProfit > 0) return "متوسط";
  return "ضعیف";
}

function decisionStatusFa(status) {
  if (status === "execute") return "اجرا";
  if (status === "test_more") return "آزمایش بیشتر";
  return "عدم اقدام";
}

function selectBaselineRow(rowsByGroup) {
  const explicit = [...rowsByGroup.values()].find(row => row.isBaseline);
  if (explicit) return explicit;

  const baselinePolicy = [...rowsByGroup.values()].find(row => row.baselinePolicy && rowsByGroup.has(row.baselinePolicy));
  if (baselinePolicy) return rowsByGroup.get(baselinePolicy.baselinePolicy);

  return null;
}

function findLowestCostRow(rowsByGroup) {
  return [...rowsByGroup.values()].reduce((lowest, row) =>
    row.costPerUser < lowest.costPerUser ? row : lowest
  );
}

function findHighestCostRow(rowsByGroup) {
  return [...rowsByGroup.values()].reduce((highest, row) =>
    row.costPerUser > highest.costPerUser ? row : highest
  );
}

function normalizeGroup(group) {
  return String(group || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function clampRate(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function treatmentRank(key) {
  const index = orderedGroups.indexOf(key);
  return index === -1 ? orderedGroups.length : index;
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function weightedAverage(items, getValue, getWeight) {
  const totalWeight = items.reduce((sum, item) => sum + getWeight(item), 0);
  if (totalWeight <= 0) return 0;
  return items.reduce((sum, item) => sum + getValue(item) * getWeight(item), 0) / totalWeight;
}

function safeVariance(rate, users) {
  if (!Number.isFinite(rate) || !Number.isFinite(users) || users <= 0) return 0;
  return (rate * (1 - rate)) / users;
}

function percent(value, total) {
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function formatSignedMoney(value) {
  const sign = value >= 0 ? "+" : "-";
  const abs = Math.abs(Math.round(value / 1000000));
  return `${sign}${abs} میلیون تومان`;
}

module.exports = {
  analyzeCampaign
};

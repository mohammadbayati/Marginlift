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
  "تخفیف کوچک": "کاربران قابل‌متقاعدسازی را با هزینه کنترل‌شده هدف بگیر.",
  "مشوق قوی": "مشوق قوی را برای کاربران غیرفعال اما باارزش بالا نگه دار."
};

const orderedGroups = ["control", "push_only", "small_discount", "high_incentive"];
const actionOrder = ["بدون پیشنهاد", "فقط پوش", "تخفیف کوچک", "مشوق قوی"];
const revenueGuardrail = 90;
const minSegmentUsers = 100;
const minCampaignUsers = 1000;

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
  const current = aggregatePolicy(segmentResults, "current");
  const recommended = aggregatePolicy(segmentResults, "recommended");
  const observed = aggregateObserved(normalizedRows);
  const nextSavings = Math.max(0, current.spend - recommended.spend);
  const revenuePreserved = current.revenue > 0
    ? Math.round((recommended.revenue / current.revenue) * 100)
    : 100;
  const currentMargin = current.revenue - current.spend;
  const recommendedMargin = recommended.revenue - recommended.spend;
  const marginLift = currentMargin > 0
    ? Math.round(((recommendedMargin - currentMargin) / currentMargin) * 100)
    : 0;

  const actionResults = aggregateActions(segmentResults);
  const wasteItems = buildWasteItems(current.spend, recommended.spend, segmentResults);
  const guardrails = buildGuardrails({
    quality,
    segmentResults,
    current,
    recommended,
    revenuePreserved
  });

  const campaign = {
    name: options.name || "کمپین تحلیل‌شده",
    audience: segmentResults.reduce((sum, segment) => sum + segment.users, 0),
    totalSpend: Math.round(current.spend),
    reportedRevenue: Math.round(current.revenue),
    observedSpend: Math.round(observed.spend),
    observedRevenue: Math.round(observed.revenue),
    nonIncrementalSpend: Math.round(nextSavings),
    nextSavings: Math.round(nextSavings),
    revenuePreserved,
    marginLift,
    confidence: quality.confidence,
    createdAt: new Date().toISOString()
  };

  return {
    campaign,
    policy: {
      current: summarizePolicy(current),
      recommended: summarizePolicy(recommended),
      delta: {
        spend: Math.round(recommended.spend - current.spend),
        revenue: Math.round(recommended.revenue - current.revenue),
        margin: Math.round(recommendedMargin - currentMargin),
        savings: Math.round(nextSavings),
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
    estimatedRevenue: Number(row.estimatedRevenue || 0)
  };
}

function analyzeSegment(nameFa, rows, quality) {
  const rowsByGroup = new Map(rows.map(row => [row.group, withDerivedRowMetrics(row)]));
  const control = rowsByGroup.get("control") || findLowestCostRow(rowsByGroup);
  const current = rowsByGroup.get("high_incentive") || findHighestCostRow(rowsByGroup);
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
    current: projectedPolicy(current, users),
    recommended: projectedPolicy(recommended, users),
    currentGroupFa: groupLabels[current.group] || current.group,
    recommendedGroupFa: groupLabels[recommended.group] || recommended.group,
    evidence: {
      liftPoints: recommended.liftPoints,
      ciLow: recommended.ciLow,
      ciHigh: recommended.ciHigh,
      incrementalConversions: recommended.incrementalConversions,
      incrementalRevenue: recommended.incrementalRevenue,
      incrementalProfit: recommended.incrementalProfit,
      roi: recommended.roi,
      confidenceLevel: evidenceLevel(recommended, quality),
      decisionScore: recommended.decisionScore
    }
  };
}

function withDerivedRowMetrics(row) {
  const convertedUsers = row.users * row.conversionRate;
  return {
    ...row,
    revenuePerUser: row.users > 0 ? row.estimatedRevenue / row.users : 0,
    revenuePerConversion: convertedUsers > 0 ? row.estimatedRevenue / convertedUsers : 0
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
  const spend = row.costPerUser * segmentUsers;
  const projectedRevenue = row.revenuePerUser * segmentUsers;
  const projectedMargin = projectedRevenue - spend;
  const incrementalProfit = incrementalRevenue - spend;
  const roi = spend > 0 ? incrementalProfit / spend : (incrementalProfit > 0 ? Infinity : 0);
  const riskPenaltyFactor = row.costPerUser === 0 ? 0.35 : 1;
  const decisionScore = projectedMargin -
    spend * 0.05 +
    Math.min(0, ciLow / 100) * segmentUsers * row.revenuePerConversion * riskPenaltyFactor;

  return {
    ...row,
    liftPoints: roundOne(liftPoints),
    ciLow: roundOne(ciLow),
    ciHigh: roundOne(ciHigh),
    incrementalConversions: Math.round(incrementalConversions),
    incrementalRevenue: Math.round(incrementalRevenue),
    incrementalProfit: Math.round(incrementalProfit),
    projectedRevenue,
    projectedMargin,
    projectedSpend: spend,
    roi,
    decisionScore
  };
}

function chooseRecommendedCandidate(candidates) {
  const viable = candidates.filter(candidate => {
    if (candidate.group === "control") return true;
    if (candidate.costPerUser === 0) return candidate.liftPoints >= 1 && candidate.incrementalProfit > 0;
    return candidate.incrementalProfit > 0 && candidate.liftPoints >= 1 && candidate.ciHigh > 0;
  });

  return (viable.length ? viable : candidates)
    .slice()
    .sort((a, b) => b.decisionScore - a.decisionScore || a.projectedSpend - b.projectedSpend)[0];
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
    if (row.costPerUser < 0 || row.estimatedRevenue < 0) {
      issues.push(`ردیف ${index + 2}: هزینه و درآمد نمی‌توانند منفی باشند.`);
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
  });

  const totalUsers = rows.reduce((sum, row) => sum + row.users, 0);
  if (totalUsers < minCampaignUsers) {
    warnings.push("حجم کل کمپین برای تصمیم مالی قطعی کم است.");
  }

  const score = Math.max(0, 100 - issues.length * 30 - warnings.length * 10);
  return {
    score,
    labelFa: score >= 85 ? "قابل‌اعتماد" : score >= 65 ? "نیازمند احتیاط" : "ضعیف",
    confidence: score >= 85 ? 88 : score >= 65 ? 72 : 55,
    issues,
    warnings,
    checks: [
      { labelFa: "وجود گروه کنترل", passed: Object.values(segmentsByName).every(segmentRows => segmentRows.some(row => row.group === "control")) },
      { labelFa: "نرخ تبدیل معتبر", passed: rows.every(row => row.conversionRate >= 0 && row.conversionRate <= 1) },
      { labelFa: "حجم داده کافی", passed: totalUsers >= minCampaignUsers },
      { labelFa: "هزینه و درآمد غیرمنفی", passed: rows.every(row => row.costPerUser >= 0 && row.estimatedRevenue >= 0) }
    ]
  };
}

function buildGuardrails({ quality, segmentResults, current, recommended, revenuePreserved }) {
  const paidSegments = segmentResults.filter(segment => segment.recommended.spend > 0);
  const positivePaid = paidSegments.filter(segment => segment.evidence.incrementalProfit > 0);
  const currentMargin = current.revenue - current.spend;
  const recommendedMargin = recommended.revenue - recommended.spend;

  return [
    {
      labelFa: "کیفیت داده",
      valueFa: `${quality.score}٪`,
      status: quality.issues.length === 0 ? "pass" : "fail",
      noteFa: quality.issues.length === 0 ? "Schema و گروه کنترل قابل‌قبول‌اند." : quality.issues[0]
    },
    {
      labelFa: "درآمد محافظت‌شده",
      valueFa: `${revenuePreserved}٪`,
      status: revenuePreserved >= revenueGuardrail ? "pass" : "warn",
      noteFa: `حداقل قابل‌قبول برای پایلوت ${revenueGuardrail}٪ است.`
    },
    {
      labelFa: "سود افزایشی مشوق پولی",
      valueFa: `${positivePaid.length}/${paidSegments.length || 0}`,
      status: positivePaid.length === paidSegments.length ? "pass" : "warn",
      noteFa: "مشوق پولی فقط وقتی پیشنهاد می‌شود که سود افزایشی مثبت باشد."
    },
    {
      labelFa: "حاشیه سود",
      valueFa: recommendedMargin >= currentMargin ? "بهبود" : "افت",
      status: recommendedMargin >= currentMargin ? "pass" : "warn",
      noteFa: `تغییر حاشیه سود: ${formatSignedMoney(recommendedMargin - currentMargin)}.`
    }
  ];
}

function aggregatePolicy(segments, key) {
  return segments.reduce((totals, segment) => ({
    spend: totals.spend + segment[key].spend,
    revenue: totals.revenue + segment[key].revenue
  }), { spend: 0, revenue: 0 });
}

function aggregateObserved(rows) {
  return rows.reduce((totals, row) => ({
    spend: totals.spend + row.costPerUser * row.users,
    revenue: totals.revenue + row.estimatedRevenue
  }), { spend: 0, revenue: 0 });
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
    recommendedGroupFa: segment.recommendedGroupFa,
    currentSpend: Math.round(segment.current.spend),
    recommendedSpend: Math.round(segment.recommended.spend),
    projectedRevenue: Math.round(segment.recommended.revenue),
    incrementalProfit: segment.evidence.incrementalProfit,
    ciLow: segment.evidence.ciLow,
    ciHigh: segment.evidence.ciHigh,
    confidenceLevel: segment.evidence.confidenceLevel
  };
}

function summarizePolicy(policy) {
  return {
    spend: Math.round(policy.spend),
    revenue: Math.round(policy.revenue),
    margin: Math.round(policy.revenue - policy.spend)
  };
}

function projectedPolicy(row, users) {
  return {
    spend: row.costPerUser * users,
    revenue: row.revenuePerUser * users
  };
}

function buildReason(action, candidate, quality) {
  if (quality.issues.length) return "این پیشنهاد با احتیاط ارائه شده؛ قبل از اجرای کمپین، مشکل داده باید رفع شود.";
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
  if (candidate.ciLow > 0 && candidate.incrementalProfit > 0) return "قوی";
  if (candidate.ciHigh > 0 && candidate.incrementalProfit > 0) return "متوسط";
  return "ضعیف";
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

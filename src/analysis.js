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

const actionNotes = {
  "بدون پیشنهاد": "به کاربرانی که احتمالاً بدون تخفیف هم خرید می‌کنند، تخفیف نده.",
  "فقط پوش": "قبل از خرج‌کردن مشوق پولی، از کانال رایگان استفاده کن.",
  "تخفیف کوچک": "کاربران قابل‌متقاعدسازی را با هزینه کنترل‌شده هدف بگیر.",
  "مشوق قوی": "مشوق قوی را برای کاربران غیرفعال اما باارزش بالا نگه دار."
};

const actionOrder = ["بدون پیشنهاد", "فقط پوش", "تخفیف کوچک", "مشوق قوی"];

function analyzeCampaign(rows, options = {}) {
  if (!rows.length) {
    throw new Error("برای تحلیل، حداقل یک ردیف کمپین لازم است.");
  }

  const segmentsByName = groupBy(rows, row => row.segmentFa);
  const segmentResults = Object.entries(segmentsByName).map(([segmentFa, segmentRows]) =>
    analyzeSegment(segmentFa, segmentRows)
  );

  const treatmentResults = analyzeTreatments(rows);
  const current = aggregatePolicy(segmentResults, "current");
  const recommended = aggregatePolicy(segmentResults, "recommended");
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

  return {
    campaign: {
      name: options.name || "کمپین تحلیل‌شده",
      audience: segmentResults.reduce((sum, segment) => sum + segment.users, 0),
      totalSpend: Math.round(current.spend),
      reportedRevenue: Math.round(current.revenue),
      nonIncrementalSpend: Math.round(nextSavings),
      nextSavings: Math.round(nextSavings),
      revenuePreserved,
      marginLift,
      confidence: rows.some(row => row.group === "control") ? 84 : 62,
      createdAt: new Date().toISOString()
    },
    treatments: treatmentResults,
    segments: segmentResults.map(segment => ({
      nameFa: segment.nameFa,
      users: segment.users,
      actionFa: segment.actionFa,
      uplift: roundOne(segment.uplift),
      reasonFa: segment.reasonFa
    })),
    actions: actionResults,
    wasteItems,
    insight: buildInsight(segmentResults)
  };
}

function analyzeSegment(nameFa, rows) {
  const normalizedRows = rows.map(row => ({
    ...row,
    group: normalizeGroup(row.group),
    revenuePerUser: row.users > 0 ? row.estimatedRevenue / row.users : 0
  }));

  const rowsByGroup = new Map(normalizedRows.map(row => [row.group, row]));
  const control = rowsByGroup.get("control") || normalizedRows.reduce((lowest, row) =>
    row.costPerUser < lowest.costPerUser ? row : lowest
  );
  const current = rowsByGroup.get("high_incentive") ||
    normalizedRows.reduce((highest, row) => row.costPerUser > highest.costPerUser ? row : highest);
  const users = normalizedRows.reduce((sum, row) => sum + row.users, 0);
  const recommendedAction = normalizedRows.find(row => row.recommendedActionFa)?.recommendedActionFa ||
    chooseRecommendedAction(normalizedRows, control);
  const recommendedGroup = actionToGroup[recommendedAction] || chooseRecommendedGroup(normalizedRows, control);
  const recommended = rowsByGroup.get(recommendedGroup) || rowsByGroup.get("control") || normalizedRows[0];
  const uplift = recommended.incrementalLiftPoints ||
    ((recommended.conversionRate - control.conversionRate) * 100);

  return {
    nameFa,
    users,
    actionFa: recommendedAction || groupLabels[recommendedGroup] || "بدون پیشنهاد",
    uplift,
    reasonFa: buildReason(recommendedAction || groupLabels[recommendedGroup], uplift),
    current: {
      spend: current.costPerUser * users,
      revenue: current.revenuePerUser * users
    },
    recommended: {
      spend: recommended.costPerUser * users,
      revenue: recommended.revenuePerUser * users
    }
  };
}

function analyzeTreatments(rows) {
  const grouped = groupBy(rows, row => normalizeGroup(row.group));
  return Object.entries(grouped)
    .map(([group, groupRows]) => {
      const users = groupRows.reduce((sum, row) => sum + row.users, 0);
      const weightedConversion = users > 0
        ? groupRows.reduce((sum, row) => sum + row.conversionRate * row.users, 0) / users
        : 0;
      const avgCost = users > 0
        ? groupRows.reduce((sum, row) => sum + row.costPerUser * row.users, 0) / users
        : 0;
      return {
        key: group,
        labelFa: groupLabels[group] || group,
        conversion: roundOne(weightedConversion * 100),
        costPerUser: Math.round(avgCost)
      };
    })
    .sort((a, b) => treatmentRank(a.key) - treatmentRank(b.key));
}

function aggregatePolicy(segments, key) {
  return segments.reduce((totals, segment) => ({
    spend: totals.spend + segment[key].spend,
    revenue: totals.revenue + segment[key].revenue
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

function chooseRecommendedAction(rows, control) {
  const best = rows.reduce((winner, row) => {
    const score = row.estimatedRevenue - row.users * row.costPerUser;
    const winnerScore = winner.estimatedRevenue - winner.users * winner.costPerUser;
    const lift = (row.conversionRate - control.conversionRate) * 100;
    const winnerLift = (winner.conversionRate - control.conversionRate) * 100;
    if (score > winnerScore && lift >= 1) return row;
    if (Math.abs(score - winnerScore) < 1 && row.costPerUser < winner.costPerUser) return row;
    if (winnerLift < 1 && row.costPerUser === 0) return row;
    return winner;
  }, control);
  return groupLabels[normalizeGroup(best.group)] || "بدون پیشنهاد";
}

function chooseRecommendedGroup(rows, control) {
  return normalizeGroup(rows.reduce((winner, row) => {
    const score = row.estimatedRevenue - row.users * row.costPerUser;
    const winnerScore = winner.estimatedRevenue - winner.users * winner.costPerUser;
    const lift = (row.conversionRate - control.conversionRate) * 100;
    if (score > winnerScore && lift >= 1) return row;
    return winner;
  }, control).group);
}

function buildReason(action, uplift) {
  if (action === "بدون پیشنهاد") return "احتمال خرید بدون تخفیف بالاست و مشوق پولی حاشیه سود را کم می‌کند.";
  if (action === "فقط پوش") return "پیام کم‌هزینه برای ساختن اثر افزایشی کافی است.";
  if (action === "تخفیف کوچک") return "واکنش افزایشی، پیشنهاد متوسط را توجیه می‌کند.";
  if (action === "مشوق قوی") return "اثر افزایشی و ارزش سفارش بالاتر، مشوق قوی‌تر را توجیه می‌کند.";
  return `اثر افزایشی ${roundOne(uplift)} واحدی این تصمیم را توجیه می‌کند.`;
}

function normalizeGroup(group) {
  return String(group || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function treatmentRank(key) {
  return ["control", "push_only", "small_discount", "high_incentive"].indexOf(key);
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function percent(value, total) {
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

module.exports = {
  analyzeCampaign
};

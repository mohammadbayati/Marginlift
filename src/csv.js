function parseCSV(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some(value => value.trim() !== "")) rows.push(row);

  if (rows.length < 2) {
    throw new Error("CSV باید حداقل یک ردیف داده داشته باشد.");
  }

  const headers = rows[0].map(value => normalizeHeader(value));
  return rows.slice(1).map(values => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] || "").trim();
    });
    return record;
  });
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeGroup(group) {
  return String(group || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const normalized = String(value || "")
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/,/g, "")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCampaignRows(rows) {
  return rows.map((row, index) => ({
    campaignId: row.campaign_id || row.campaign || "",
    segmentFa: required(row.segment_fa || row.segment || row.segment_name, "segment_fa", index),
    group: required(row.campaign_group || row.group || row.treatment, "campaign_group", index),
    users: toNumber(required(row.users, "users", index)),
    conversions: toNumber(row.conversions || row.converted_users),
    conversionRate: normalizeRateFromRow(row, index),
    costPerUser: costPerUserFromRow(row),
    estimatedRevenue: toNumber(row.estimated_revenue_toman || row.revenue || row.revenue_toman || row.gmv_toman),
    grossMarginRate: normalizeRate(toNumber(row.gross_margin_rate || row.gross_margin || row.margin_rate, 1)),
    channelCostPerUser: perUserFromTotalOrPerUser(row.channel_cost, row.channel_cost_per_user_toman, row.users),
    fulfillmentSubsidyPerUser: perUserFromTotalOrPerUser(
      row.fulfillment_subsidy,
      row.fulfillment_subsidy_per_user_toman,
      row.users
    ),
    baselinePolicy: row.baseline_policy || row.current_policy || row.policy_baseline || "",
    isBaseline: normalizeBoolean(row.is_baseline || row.baseline_group || row.current_policy_flag),
    measurementWindowDays: toNumber(row.measurement_window_days),
    channel: row.channel || "",
    incrementalLiftPoints: toNumber(row.incremental_lift_points || row.uplift || row.lift),
    recommendedActionFa: row.recommended_action_fa || row.recommended_action || ""
  }));
}

function looksLikeCustomerRows(rows) {
  if (!rows.length) return false;
  const row = rows[0];
  return Boolean(row.customer_id || row.customerid || row.user_id || row.userid);
}

function normalizeCustomerRows(rows) {
  return rows.map((row, index) => ({
    customerId: required(row.customer_id || row.customerid || row.user_id || row.userid, "customer_id", index),
    segmentFa: row.segment_fa || row.segment || row.segment_name || "همه مشتریان",
    lastPurchaseAt: row.last_purchase_at || row.last_order_at || "",
    daysSinceLastPurchase: toNumber(row.days_since_last_purchase || row.recency_days, 0),
    orders90d: toNumber(row.orders_90d || row.orders || row.frequency, 0),
    revenue90d: toNumber(row.revenue_90d_toman || row.revenue_90d || row.past_revenue_toman || row.past_revenue, 0),
    grossMarginRate: normalizeRate(toNumber(row.gross_margin_rate || row.gross_margin || row.margin_rate, 0.35)),
    treatment: normalizeGroup(row.treatment || row.campaign_group || row.group || "control"),
    exposed: normalizeBoolean(row.exposed || row.was_exposed || row.treated),
    converted: normalizeBoolean(row.converted || row.purchased || row.returned || row.outcome),
    outcomeRevenue: toNumber(row.outcome_revenue_toman || row.outcome_revenue || row.revenue || 0),
    incentiveCost: toNumber(row.incentive_cost_toman || row.incentive_cost || row.offer_cost || 0),
    channelCost: toNumber(row.channel_cost_toman || row.channel_cost || 0),
    churned: normalizeBoolean(row.churned || row.is_churned),
    channel: row.channel || "",
    capacityRequired: toNumber(row.capacity_required || row.agent_minutes || 0),
    sourcePresence: {
      customerId: hasAnyField(row, ["customer_id", "customerid", "user_id", "userid"]),
      treatment: hasAnyField(row, ["treatment", "campaign_group", "group"]),
      exposure: hasAnyField(row, ["exposed", "was_exposed", "treated"]),
      outcome: hasAnyField(row, ["converted", "purchased", "returned", "outcome"]),
      revenue: hasAnyField(row, ["outcome_revenue_toman", "outcome_revenue", "revenue"]),
      grossMargin: hasAnyField(row, ["gross_margin_rate", "gross_margin", "margin_rate"]),
      incentiveCost: hasAnyField(row, ["incentive_cost_toman", "incentive_cost", "offer_cost"]),
      channelCost: hasAnyField(row, ["channel_cost_toman", "channel_cost"])
    }
  }));
}

function normalizeOutcomeRows(rows) {
  return rows.map((row, index) => ({
    customerId: required(row.customer_id || row.customerid || row.user_id || row.userid, "customer_id", index),
    assignedGroup: normalizeGroup(required(row.assigned_group || row.treatment || row.group, "assigned_group", index)),
    exposedAt: row.exposed_at || row.exposure_at || "",
    converted: normalizeBoolean(row.converted || row.purchased || row.returned || row.outcome),
    outcomeRevenue: toNumber(row.outcome_revenue_toman || row.outcome_revenue || row.revenue || 0),
    actualIncentiveCost: toNumber(row.actual_incentive_cost_toman || row.actual_incentive_cost || row.incentive_cost || 0),
    actualChannelCost: toNumber(row.actual_channel_cost_toman || row.actual_channel_cost || row.channel_cost || 0),
    grossMarginRate: normalizeRate(toNumber(row.gross_margin_rate || row.gross_margin || row.margin_rate, 0.35))
  }));
}

function normalizeRateFromRow(row, index) {
  const explicitRate = row.conversion_rate || row.conversion;
  if (explicitRate !== undefined && String(explicitRate).trim() !== "") {
    return normalizeRate(toNumber(explicitRate));
  }

  const users = toNumber(required(row.users, "users", index));
  const conversions = toNumber(required(row.conversions || row.converted_users, "conversions", index));
  return users > 0 ? conversions / users : 0;
}

function costPerUserFromRow(row) {
  return perUserFromTotalOrPerUser(
    row.incentive_cost || row.incentive_cost_toman,
    row.incentive_cost_per_user_toman || row.cost_per_user || row.cost_per_user_toman,
    row.users
  );
}

function perUserFromTotalOrPerUser(totalValue, perUserValue, usersValue) {
  const perUser = toNumber(perUserValue, NaN);
  if (Number.isFinite(perUser)) return perUser;

  const total = toNumber(totalValue, NaN);
  const users = toNumber(usersValue, 0);
  if (Number.isFinite(total) && users > 0) return total / users;
  return 0;
}

function normalizeBoolean(value) {
  return ["1", "true", "yes", "y", "بله"].includes(String(value || "").trim().toLowerCase());
}

function normalizeRate(value) {
  if (value > 1 && value <= 100) return value / 100;
  return value;
}

function required(value, field, index) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`ستون ${field} در ردیف ${index + 2} خالی است.`);
  }
  return value;
}

function hasAnyField(row, fields) {
  return fields.some(field => Object.prototype.hasOwnProperty.call(row, field));
}

module.exports = {
  looksLikeCustomerRows,
  normalizeCampaignRows,
  normalizeCustomerRows,
  normalizeOutcomeRows,
  parseCSV,
  toNumber
};

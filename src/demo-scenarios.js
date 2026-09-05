const DEMO_SCENARIOS = Object.freeze({
  generic_ecommerce: Object.freeze({ presetKey: "generic_ecommerce", cutoff: "2025-12-01", name: "سناریوی نمایشی فروشگاه اینترنتی", customerPrefix: "shop", cadenceDays: 34 }),
  super_app_packages: Object.freeze({ presetKey: "super_app_packages", cutoff: "2026-02-01", name: "سناریوی نمایشی خرید بسته اینترنت", customerPrefix: "package", cadenceDays: 30 }),
  subscription_services: Object.freeze({ presetKey: "subscription_services", cutoff: "2026-05-01", name: "سناریوی نمایشی تمدید اشتراک", customerPrefix: "subscription", cadenceDays: 31 })
});

function getDemoScenario(presetKey = "generic_ecommerce") {
  const scenario = DEMO_SCENARIOS[presetKey] || DEMO_SCENARIOS.generic_ecommerce;
  return { ...scenario, csvText: buildScenarioCsv(scenario) };
}

function buildScenarioCsv(scenario) {
  const rows = [];
  for (let customerIndex = 1; customerIndex <= 36; customerIndex += 1) {
    const purchaseCount = 2 + (customerIndex % 3);
    const lastPurchaseDaysAgo = [9, 38, 96, 188][customerIndex % 4];
    for (let purchaseIndex = 0; purchaseIndex < purchaseCount; purchaseIndex += 1) {
      const daysAgo = lastPurchaseDaysAgo + ((purchaseCount - purchaseIndex - 1) * scenario.cadenceDays);
      rows.push(buildRow(scenario, customerIndex, purchaseIndex + 1, daysAgo));
    }
  }
  return `${headersFor(scenario.presetKey).join(",")}\n${rows.map(row => row.join(",")).join("\n")}\n`;
}

function buildRow(scenario, customerIndex, purchaseIndex, daysAgo) {
  const customer = `hash_demo_${scenario.customerPrefix}_${String(customerIndex).padStart(3, "0")}`;
  const transaction = `demo_${scenario.customerPrefix}_${String(customerIndex).padStart(3, "0")}_${purchaseIndex}`;
  const occurredAt = isoDaysBefore(scenario.cutoff, daysAgo);
  const paidAmount = 280000 + (customerIndex % 6) * 110000;
  const discountAmount = purchaseIndex === 1 && customerIndex % 5 === 0 ? 30000 : 0;
  const netRevenue = paidAmount - discountAmount;
  const contributionMargin = Math.round(netRevenue * (0.2 + (customerIndex % 3) * 0.04));
  const blocked = customerIndex % 12 === 0;
  const consent = blocked ? "revoked" : "granted";
  const preferredChannel = ["push", "sms", "email"][customerIndex % 3];
  const contactCount = blocked ? 0 : customerIndex % 4;
  const lastContactAt = blocked ? "" : isoDaysBefore(scenario.cutoff, 4 + (customerIndex % 12));

  if (scenario.presetKey === "super_app_packages") {
    return [customer, transaction, occurredAt, "completed", `operator_${(customerIndex % 3) + 1}`, `package_${(customerIndex % 4) + 1}`, "monthly", 30, isoDaysAfter(occurredAt, 30), paidAmount, netRevenue, contributionMargin, discountAmount, 0, "", consent, preferredChannel, blocked, contactCount, lastContactAt];
  }
  if (scenario.presetKey === "subscription_services") {
    return [customer, transaction, occurredAt, "completed", customerIndex % 2 ? "app" : "web", `plan_${(customerIndex % 3) + 1}`, "monthly", 30, isoDaysAfter(occurredAt, 30), paidAmount, netRevenue, contributionMargin, discountAmount, 0, "", consent, preferredChannel, blocked, contactCount, lastContactAt];
  }
  return [customer, transaction, occurredAt, "completed", customerIndex % 2 ? "app" : "web", `sku_${(customerIndex % 5) + 1}`, ["beauty", "home", "grocery"][customerIndex % 3], paidAmount, netRevenue, contributionMargin, discountAmount, 0, "", consent, preferredChannel, blocked, contactCount, lastContactAt];
}

function headersFor(presetKey) {
  const commonTail = ["paid_amount", "net_revenue", "contribution_margin", "discount_amount", "cashback_amount", "campaign_id", "consent_status", "preferred_channel", "do_not_contact", "contact_count_30d", "last_contact_at"];
  if (presetKey === "super_app_packages") return ["customer_id_hash", "transaction_id", "purchased_at", "transaction_status", "operator", "package_id", "package_category", "validity_days", "expires_at", ...commonTail];
  if (presetKey === "subscription_services") return ["customer_id_hash", "subscription_payment_id", "paid_at", "payment_status", "sales_channel", "plan_id", "plan_type", "billing_period_days", "subscription_expires_at", ...commonTail];
  return ["customer_id_hash", "order_id", "purchased_at", "order_status", "channel", "product_id", "product_category", ...commonTail];
}

function isoDaysBefore(cutoff, days) {
  const date = new Date(`${cutoff}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function isoDaysAfter(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

module.exports = { DEMO_SCENARIOS, getDemoScenario };

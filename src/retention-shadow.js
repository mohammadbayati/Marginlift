const crypto = require("crypto");


function buildRetentionShadowRun(record, options = {}) {
  if (!record) throw new Error("تحلیل نگهداشت برای Shadow Mode پیدا نشد.");
  const rawQueue = record.decisionQueue || record.workspace?.queue || [];
  const capacity = boundedInteger(options.capacity, 1, 1000000, Math.max(1, rawQueue.length));
  const exclusions = new Set((options.excludedCustomerIds || []).map(value => String(value).trim()).filter(Boolean));
  const grouped = new Map();
  rawQueue.forEach(item => {
    const current = grouped.get(item.customerIdHash) || [];
    current.push(item);
    grouped.set(item.customerIdHash, current);
  });
  const duplicateCustomers = [...grouped.values()].filter(items => items.length > 1).length;
  const deduplicated = [...grouped.values()].map(items => [...items].sort(comparePriority)[0]);
  const eligible = deduplicated.filter(item => !exclusions.has(item.customerIdHash));
  const selected = eligible.slice(0, capacity);
  const overflow = eligible.slice(capacity);
  const actionMix = summarizeActions(selected);
  const createdAt = new Date().toISOString();
  const ready = selected.length > 0 && duplicateCustomers === 0;

  return {
    id: createVersion({ analysisId: record.id, createdAt, capacity, exclusions: [...exclusions].sort() }),
    analysisId: record.id,
    name: String(options.name || "اجرای سایه نگهداشت").trim().slice(0, 80),
    mode: "shadow",
    liveActionAllowed: false,
    status: ready ? "ready" : selected.length ? "needs_review" : "blocked",
    statusFa: ready ? "اجرای سایه آماده است" : selected.length ? "نیازمند بازبینی هم‌پوشانی" : "مخاطب واجد شرایط وجود ندارد",
    evidenceLevel: "observational_shadow",
    evidenceLabelFa: "شبیه‌سازی عملیاتی؛ بدون تماس با مشتری",
    source: {
      analysisId: record.id,
      datasetVersion: record.baseline?.modelCard?.datasetVersion || "",
      modelVersion: record.baseline?.modelCard?.modelVersion || record.baseline?.baselineVersion || "",
      policyVersion: record.workspace?.policyVersion || ""
    },
    settings: {
      capacity,
      exclusionCount: exclusions.size,
      assignmentUnit: "customer_id_hash"
    },
    summary: {
      rawDecisionRows: rawQueue.length,
      uniqueCustomers: grouped.size,
      duplicateCustomers,
      excludedCustomers: deduplicated.filter(item => exclusions.has(item.customerIdHash)).length,
      selectedCustomers: selected.length,
      overflowCustomers: overflow.length,
      noActionCustomers: selected.filter(item => item.recommendedAction === "no_action").length
    },
    actionMix,
    selectedPreview: selected.slice(0, 20),
    checks: [
      check("analysis_lineage", Boolean(record.id && record.workspace?.policyVersion), "ردیابی تحلیل و سیاست", "نسخه تحلیل و policy همراه run ثبت شده است."),
      check("customer_uniqueness", duplicateCustomers === 0, "یکتایی واحد تخصیص", duplicateCustomers ? `${duplicateCustomers} مشتری در چند واحد محصول یا کانال تکرار شده است.` : "هر مشتری فقط یک تصمیم دارد."),
      check("exclusions", true, "اعمال exclusion", `${exclusions.size} شناسه از اجرا کنار گذاشته شد.`),
      check("capacity", selected.length <= capacity, "ظرفیت اجرا", `${selected.length} مشتری در سقف ${capacity} انتخاب شد.`),
      check("no_live_action", true, "ممنوعیت اقدام زنده", "این run هیچ پیام، تخفیف یا تغییری در CRM ارسال نمی‌کند.")
    ],
    createdAt
  };
}

function buildRetentionExperimentBrief(organization, record, shadowRun, options = {}) {
  const baselineRate = boundedProbability(options.baselineRate, 0.2);
  const minimumDetectableEffect = boundedProbability(options.minimumDetectableEffect, 0.03);
  const outcomeWindowDays = boundedInteger(options.outcomeWindowDays, 7, 365, 30);
  const holdoutRate = boundedProbability(options.holdoutRate, 0.2);
  const perArm = estimateTwoArmSampleSize(baselineRate, minimumDetectableEffect);
  const available = shadowRun?.summary?.selectedCustomers || (record.decisionQueue || []).length;
  const totalRequired = perArm * 2;
  const feasible = available >= totalRequired;
  const title = `# طرح آزمایش نگهداشت MarginLift برای ${organization.name}`;
  return [
    title,
    "",
    "## فرضیه",
    "",
    "اگر سیاست اقدام MarginLift به‌جای سیاست فعلی روی مشتریان واجد شرایط اجرا شود، سود مشارکتی به‌ازای هر مشتری تخصیص‌یافته افزایش می‌یابد، بدون نقض گاردریل‌های درآمد و تجربه مشتری.",
    "",
    "## طراحی از پیش ثبت‌شده",
    "",
    "- واحد تخصیص: شناسه ناشناس مشتری",
    `- نرخ پایه فرض‌شده: ${formatPercent(baselineRate)}`,
    `- حداقل اثر قابل تشخیص: ${formatPercent(minimumDetectableEffect)}`,
    `- سهم پیشنهادی کنترل: ${formatPercent(holdoutRate)}`,
    `- پنجره outcome: ${outcomeWindowDays} روز پس از تخصیص`,
    "- تحلیل اصلی: Intention-To-Treat",
    "- معیار اصلی: سود مشارکتی افزایشی به‌ازای هر مشتری واجد شرایط",
    "- گاردریل‌ها: درآمد، نرخ خرید، هزینه مشوق، opt-out، شکایت و SRM",
    "",
    "## کفایت نمونه",
    "",
    `- حداقل تقریبی هر بازو: ${perArm} مشتری`,
    `- حداقل کل: ${totalRequired} مشتری`,
    `- مخاطب فعلی Shadow Mode: ${available} مشتری`,
    `- وضعیت: ${feasible ? "از نظر تعداد اولیه قابل بررسی است" : "برای فرض‌های فعلی نمونه کافی نیست"}`,
    "",
    "## قفل تصمیم",
    "",
    "مدل، policy، معیار اصلی، exclusions و stopping rule پس از شروع آزمایش تغییر نمی‌کنند. Scale فقط با سود مثبت، فاصله اطمینان قابل دفاع و گاردریل سالم مجاز است.",
    "",
    "## مرز ادعا",
    "",
    "این سند طرح آزمایش است، نه اثبات کاهش ریزش یا سود افزایشی. اعداد نمونه پس از دریافت baseline واقعی دوباره محاسبه می‌شوند.",
    ""
  ].join("\n");
}

function estimateTwoArmSampleSize(baselineRate, minimumDetectableEffect) {
  const treatmentRate = Math.min(0.999, baselineRate + minimumDetectableEffect);
  const pooled = (baselineRate + treatmentRate) / 2;
  const zAlpha = 1.959963984540054;
  const zBeta = 0.8416212335729143;
  const numerator = 2 * pooled * (1 - pooled) * Math.pow(zAlpha + zBeta, 2);
  return Math.max(50, Math.ceil(numerator / Math.pow(minimumDetectableEffect, 2)));
}

function comparePriority(left, right) {
  const statePriority = { dormant: 4, lapsed: 3, due: 2, long_term_lost: 1 };
  return (statePriority[right.state] || 0) - (statePriority[left.state] || 0)
    || Number(right.averageContributionMargin || 0) - Number(left.averageContributionMargin || 0)
    || String(left.unitKey || "").localeCompare(String(right.unitKey || ""));
}

function summarizeActions(items) {
  const counts = new Map();
  items.forEach(item => {
    const current = counts.get(item.recommendedAction) || { key: item.recommendedAction, labelFa: item.recommendedActionFa, count: 0 };
    current.count += 1;
    counts.set(item.recommendedAction, current);
  });
  return [...counts.values()].sort((left, right) => right.count - left.count);
}

function check(key, passed, labelFa, detailFa) {
  return { key, passed: Boolean(passed), labelFa, detailFa };
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function boundedProbability(value, fallback) {
  const parsed = Number(value);
  return parsed > 0 && parsed < 1 ? parsed : fallback;
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value * 100)}٪`;
}

function createVersion(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

module.exports = {
  buildRetentionExperimentBrief,
  buildRetentionShadowRun,
  estimateTwoArmSampleSize
};

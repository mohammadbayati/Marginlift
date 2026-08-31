const crypto = require("crypto");

const CONTRACT_ACTIONS = new Set(["save", "approve_crm", "approve_data", "approve_finance", "lock"]);

function buildDefaultMetricContract(organizationId, config = {}) {
  const channelFa = config.display?.channelFa || "کانال تنظیم‌شده";
  const purchaseObjectFa = config.display?.purchaseObjectFa || "خرید مجدد";
  const now = new Date().toISOString();
  const contract = {
    id: contractId(organizationId, 1),
    organizationId,
    version: 1,
    status: "draft",
    statusFa: "پیش‌نویس",
    useCaseKey: config.presetKey || "generic_ecommerce",
    channelChurnDefinitionFa: `ثبت‌نشدن ${purchaseObjectFa} موفق در ${channelFa} طی ۳۰ روز پس از تاریخ تصمیم`,
    eligibilityFa: "مشتری ناشناس با سابقه کافی، مجوز تماس معتبر و بدون outcome آینده در زمان تصمیم",
    assignmentUnit: "customer_id_hash",
    predictionWindowDays: 30,
    outcomeWindowDays: 30,
    followupWindowsDays: [90, 180],
    primaryMetric: "incremental_contribution_profit_per_assigned_customer",
    primaryMetricFa: "سود مشارکتی افزایشی ۳۰روزه به‌ازای مشتری تخصیص‌یافته",
    currencyUnit: "toman",
    finance: {
      contributionProfitFormulaFa: "درآمد خالص منهای هزینه متغیر، مشوق، کانال و بازپرداخت",
      grossMarginDefinitionFa: "نیازمند تأیید مالی",
      incentiveCostDefinitionFa: "هزینه واقعی مشوق استفاده‌شده",
      channelCostDefinitionFa: "هزینه واقعی ارسال یا تماس",
      refundPolicyFa: "بازپرداخت و لغو از سود دوره کسر می‌شود"
    },
    currentPolicy: {
      descriptionFa: "نیازمند ثبت سیاست فعلی CRM",
      ownerFa: "",
      actionsLogged: false,
      reproducible: false
    },
    guardrails: ["revenue", "incentive_cost", "opt_out", "complaint", "srm", "contamination"],
    owners: { crmFa: "", dataFa: "", financeFa: "", experimentFa: "" },
    approvals: { crm: null, data: null, finance: null },
    lockedAt: null,
    createdAt: now,
    updatedAt: now
  };
  return withDerived(contract);
}

function applyMetricContractChange(current, input = {}, actor = {}) {
  const action = CONTRACT_ACTIONS.has(input.action) ? input.action : "save";
  if (current.status === "locked" && action !== "lock") {
    throw new Error("قرارداد قفل شده است؛ برای تغییر باید نسخه جدید ساخته شود.");
  }

  let contract = mergeEditable(current, input);
  const now = new Date().toISOString();
  if (action.startsWith("approve_")) {
    const key = action.replace("approve_", "");
    contract.approvals[key] = {
      actorId: actor.actorId || null,
      actorRole: actor.actorRole || null,
      approvedAt: now
    };
  }
  if (action === "lock") {
    const readiness = metricContractReadiness(contract);
    if (!readiness.ready) throw new Error(`قرارداد هنوز قابل قفل نیست: ${readiness.missingFa.join("، ")}`);
    contract.status = "locked";
    contract.lockedAt = now;
  }
  contract.updatedAt = now;
  return withDerived(contract);
}

function createMetricContractVersion(current, actor = {}) {
  const version = Number(current.version || 1) + 1;
  const now = new Date().toISOString();
  return withDerived({
    ...current,
    id: contractId(current.organizationId, version),
    version,
    status: "draft",
    approvals: { crm: null, data: null, finance: null },
    lockedAt: null,
    createdBy: actor.actorId || null,
    createdAt: now,
    updatedAt: now
  });
}

function metricContractReadiness(contract) {
  const missingFa = [];
  if (!clean(contract.channelChurnDefinitionFa)) missingFa.push("تعریف Channel Churn");
  if (!clean(contract.eligibilityFa)) missingFa.push("جامعه واجد شرایط");
  if (!clean(contract.finance?.grossMarginDefinitionFa) || /نیازمند تأیید/.test(contract.finance.grossMarginDefinitionFa)) missingFa.push("تعریف حاشیه سود");
  if (!clean(contract.currentPolicy?.ownerFa)) missingFa.push("مالک سیاست فعلی CRM");
  if (!contract.currentPolicy?.actionsLogged) missingFa.push("ثبت اقدام‌های سیاست فعلی");
  if (!contract.currentPolicy?.reproducible) missingFa.push("قابلیت بازتولید سیاست فعلی");
  if (!clean(contract.owners?.crmFa)) missingFa.push("مالک CRM");
  if (!clean(contract.owners?.dataFa)) missingFa.push("مالک داده");
  if (!clean(contract.owners?.financeFa)) missingFa.push("مالک مالی");
  if (!clean(contract.owners?.experimentFa)) missingFa.push("مالک آزمایش");
  if (!contract.approvals?.crm) missingFa.push("تأیید CRM");
  if (!contract.approvals?.data) missingFa.push("تأیید داده");
  if (!contract.approvals?.finance) missingFa.push("تأیید مالی");
  return { ready: missingFa.length === 0, missingFa };
}

function mergeEditable(current, input) {
  const integer = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  return {
    ...current,
    channelChurnDefinitionFa: clean(input.channelChurnDefinitionFa) || current.channelChurnDefinitionFa,
    eligibilityFa: clean(input.eligibilityFa) || current.eligibilityFa,
    predictionWindowDays: integer(input.predictionWindowDays, current.predictionWindowDays),
    outcomeWindowDays: integer(input.outcomeWindowDays, current.outcomeWindowDays),
    currencyUnit: ["toman", "rial"].includes(input.currencyUnit) ? input.currencyUnit : current.currencyUnit,
    finance: { ...current.finance, ...pickText(input.finance, Object.keys(current.finance)) },
    currentPolicy: {
      ...current.currentPolicy,
      ...pickText(input.currentPolicy, ["descriptionFa", "ownerFa"]),
      actionsLogged: input.currentPolicy?.actionsLogged === undefined ? current.currentPolicy.actionsLogged : Boolean(input.currentPolicy.actionsLogged),
      reproducible: input.currentPolicy?.reproducible === undefined ? current.currentPolicy.reproducible : Boolean(input.currentPolicy.reproducible)
    },
    owners: { ...current.owners, ...pickText(input.owners, Object.keys(current.owners)) }
  };
}

function withDerived(contract) {
  const readiness = metricContractReadiness(contract);
  const statusFa = contract.status === "locked" ? "قفل‌شده" : readiness.ready ? "آماده قفل" : "نیازمند تکمیل";
  return { ...contract, statusFa, readiness };
}

function pickText(input, keys) {
  if (!input || typeof input !== "object") return {};
  return Object.fromEntries(keys.filter(key => input[key] !== undefined).map(key => [key, clean(input[key]).slice(0, 500)]));
}

function clean(value) {
  return String(value || "").trim();
}

function contractId(organizationId, version) {
  return `mct_${crypto.createHash("sha256").update(`${organizationId}:${version}`).digest("hex").slice(0, 20)}`;
}

module.exports = {
  applyMetricContractChange,
  buildDefaultMetricContract,
  createMetricContractVersion,
  metricContractReadiness
};

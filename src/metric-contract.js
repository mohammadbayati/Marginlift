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
    minimumSamplePerPolicy: null,
    samplePlanning: {
      method: "two_arm_mean_difference_normal_approximation",
      assumedContributionProfitStdDev: null,
      minimumDetectableContributionProfitPerCustomer: null,
      alpha: 0.05,
      power: 0.8,
      recommendedMinimumSamplePerPolicy: null
    },
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
    decisionRules: {
      requirePositiveLowerBoundForScale: true,
      stopWhenPointEstimateNegative: true,
      minIncrementalNetRevenuePerAssignedCustomer: null,
      maxIncrementalIncentiveCostPerAssignedCustomer: null,
      maxOptOutRateDelta: null,
      maxComplaintRateDelta: null,
      thresholdBasisFa: ""
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
  if (Number(contract.outcomeWindowDays) !== 30) missingFa.push("پنجره Outcome دقیقاً ۳۰ روزه");
  if (!clean(contract.finance?.grossMarginDefinitionFa) || /نیازمند تأیید/.test(contract.finance.grossMarginDefinitionFa)) missingFa.push("تعریف حاشیه سود");
  if (!clean(contract.currentPolicy?.ownerFa)) missingFa.push("مالک سیاست فعلی CRM");
  if (!contract.currentPolicy?.actionsLogged) missingFa.push("ثبت اقدام‌های سیاست فعلی");
  if (!contract.currentPolicy?.reproducible) missingFa.push("قابلیت بازتولید سیاست فعلی");
  if (!clean(contract.owners?.crmFa)) missingFa.push("مالک CRM");
  if (!clean(contract.owners?.dataFa)) missingFa.push("مالک داده");
  if (!clean(contract.owners?.financeFa)) missingFa.push("مالک مالی");
  if (!clean(contract.owners?.experimentFa)) missingFa.push("مالک آزمایش");
  if (!Number.isInteger(Number(contract.minimumSamplePerPolicy)) || Number(contract.minimumSamplePerPolicy) < 2) missingFa.push("حداقل نمونه هر سیاست");
  if (!isPositiveNumber(contract.samplePlanning?.assumedContributionProfitStdDev)) missingFa.push("انحراف معیار سود مشارکتی برای محاسبه نمونه");
  if (!isPositiveNumber(contract.samplePlanning?.minimumDetectableContributionProfitPerCustomer)) missingFa.push("حداقل اثر مالی قابل تشخیص");
  if (Number.isInteger(Number(contract.samplePlanning?.recommendedMinimumSamplePerPolicy)) && Number(contract.minimumSamplePerPolicy) < Number(contract.samplePlanning.recommendedMinimumSamplePerPolicy)) {
    missingFa.push(`حداقل نمونه باید دست‌کم ${contract.samplePlanning.recommendedMinimumSamplePerPolicy} مشتری در هر سیاست باشد`);
  }
  if (!isFiniteNumber(contract.decisionRules?.minIncrementalNetRevenuePerAssignedCustomer)) missingFa.push("کف درآمد افزایشی");
  if (!isNonNegativeNumber(contract.decisionRules?.maxIncrementalIncentiveCostPerAssignedCustomer)) missingFa.push("سقف افزایش هزینه مشوق");
  if (!isRate(contract.decisionRules?.maxOptOutRateDelta)) missingFa.push("سقف افزایش opt-out");
  if (!isRate(contract.decisionRules?.maxComplaintRateDelta)) missingFa.push("سقف افزایش شکایت");
  if (clean(contract.decisionRules?.thresholdBasisFa).length < 20) missingFa.push("مبنای تصویب thresholdها");
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
    minimumSamplePerPolicy: nullableInteger(input.minimumSamplePerPolicy, current.minimumSamplePerPolicy),
    samplePlanning: {
      ...current.samplePlanning,
      assumedContributionProfitStdDev: nullablePositive(input.samplePlanning?.assumedContributionProfitStdDev, current.samplePlanning?.assumedContributionProfitStdDev),
      minimumDetectableContributionProfitPerCustomer: nullablePositive(input.samplePlanning?.minimumDetectableContributionProfitPerCustomer, current.samplePlanning?.minimumDetectableContributionProfitPerCustomer)
    },
    currencyUnit: ["toman", "rial"].includes(input.currencyUnit) ? input.currencyUnit : current.currencyUnit,
    finance: { ...current.finance, ...pickText(input.finance, Object.keys(current.finance)) },
    currentPolicy: {
      ...current.currentPolicy,
      ...pickText(input.currentPolicy, ["descriptionFa", "ownerFa"]),
      actionsLogged: input.currentPolicy?.actionsLogged === undefined ? current.currentPolicy.actionsLogged : Boolean(input.currentPolicy.actionsLogged),
      reproducible: input.currentPolicy?.reproducible === undefined ? current.currentPolicy.reproducible : Boolean(input.currentPolicy.reproducible)
    },
    decisionRules: {
      ...current.decisionRules,
      requirePositiveLowerBoundForScale: input.decisionRules?.requirePositiveLowerBoundForScale === undefined
        ? current.decisionRules?.requirePositiveLowerBoundForScale !== false
        : Boolean(input.decisionRules.requirePositiveLowerBoundForScale),
      stopWhenPointEstimateNegative: input.decisionRules?.stopWhenPointEstimateNegative === undefined
        ? current.decisionRules?.stopWhenPointEstimateNegative !== false
        : Boolean(input.decisionRules.stopWhenPointEstimateNegative),
      minIncrementalNetRevenuePerAssignedCustomer: nullableFinite(input.decisionRules?.minIncrementalNetRevenuePerAssignedCustomer, current.decisionRules?.minIncrementalNetRevenuePerAssignedCustomer),
      maxIncrementalIncentiveCostPerAssignedCustomer: nullableNonNegative(input.decisionRules?.maxIncrementalIncentiveCostPerAssignedCustomer, current.decisionRules?.maxIncrementalIncentiveCostPerAssignedCustomer),
      maxOptOutRateDelta: nullableRate(input.decisionRules?.maxOptOutRateDelta, current.decisionRules?.maxOptOutRateDelta),
      maxComplaintRateDelta: nullableRate(input.decisionRules?.maxComplaintRateDelta, current.decisionRules?.maxComplaintRateDelta),
      thresholdBasisFa: input.decisionRules?.thresholdBasisFa === undefined
        ? current.decisionRules?.thresholdBasisFa || ""
        : clean(input.decisionRules.thresholdBasisFa).slice(0, 1000)
    },
    owners: { ...current.owners, ...pickText(input.owners, Object.keys(current.owners)) }
  };
}

function withDerived(contract) {
  const recommendedMinimumSamplePerPolicy = estimateMinimumSamplePerPolicy(
    contract.samplePlanning?.assumedContributionProfitStdDev,
    contract.samplePlanning?.minimumDetectableContributionProfitPerCustomer
  );
  contract = {
    ...contract,
    samplePlanning: {
      ...contract.samplePlanning,
      recommendedMinimumSamplePerPolicy
    }
  };
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

function nullableInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback ?? null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 2 ? number : fallback ?? null;
}

function nullableFinite(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback ?? null;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback ?? null;
}

function nullableRate(value, fallback) {
  const number = nullableFinite(value, fallback);
  return number !== null && number >= 0 && number <= 1 ? number : fallback ?? null;
}

function nullableNonNegative(value, fallback) {
  const number = nullableFinite(value, fallback);
  return number !== null && number >= 0 ? number : fallback ?? null;
}

function nullablePositive(value, fallback) {
  const number = nullableFinite(value, fallback);
  return number !== null && number > 0 ? number : fallback ?? null;
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function isRate(value) {
  return isFiniteNumber(value) && Number(value) >= 0 && Number(value) <= 1;
}

function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && Number(value) >= 0;
}

function isPositiveNumber(value) {
  return isFiniteNumber(value) && Number(value) > 0;
}

function estimateMinimumSamplePerPolicy(standardDeviationInput, minimumDetectableEffectInput) {
  const standardDeviation = Number(standardDeviationInput);
  const minimumDetectableEffect = Number(minimumDetectableEffectInput);
  if (!(standardDeviation > 0) || !(minimumDetectableEffect > 0)) return null;
  const zAlpha = 1.959963984540054;
  const zBeta = 0.8416212335729143;
  return Math.max(2, Math.ceil((2 * standardDeviation ** 2 * (zAlpha + zBeta) ** 2) / minimumDetectableEffect ** 2));
}

function contractId(organizationId, version) {
  return `mct_${crypto.createHash("sha256").update(`${organizationId}:${version}`).digest("hex").slice(0, 20)}`;
}

module.exports = {
  applyMetricContractChange,
  buildDefaultMetricContract,
  createMetricContractVersion,
  estimateMinimumSamplePerPolicy,
  metricContractReadiness
};

function buildChurnValueCase(input) {
  const eligibleCustomersPerMonth = positiveNumber(input.eligibleCustomersPerMonth, "eligibleCustomersPerMonth");
  const observedAtRiskRate = rate(input.observedAtRiskRate, "observedAtRiskRate");
  const contributionMarginPerRetainedCustomer = positiveNumber(
    input.contributionMarginPerRetainedCustomer,
    "contributionMarginPerRetainedCustomer"
  );
  const monthlyIncentiveSpend = nonNegativeNumber(input.monthlyIncentiveSpend, "monthlyIncentiveSpend");
  const pilotFee = positiveNumber(input.pilotFee, "pilotFee");
  const scenarios = ["conservative", "base", "upside"].map(key => scenario(key, input.scenarios?.[key], {
    eligibleCustomersPerMonth,
    observedAtRiskRate,
    contributionMarginPerRetainedCustomer,
    monthlyIncentiveSpend,
    pilotFee
  }));

  const conservative = scenarios.find(item => item.key === "conservative");
  const base = scenarios.find(item => item.key === "base");
  const decision = conservative.valueCostRatio90d >= 1 && base.valueCostRatio90d >= 3
    ? "qualified"
    : base.valueCostRatio90d >= 3
      ? "validate_with_paid_diagnostic"
      : "not_economic_yet";

  return {
    decision,
    decisionFa: decisionLabel(decision),
    currency: input.currency || "تومان",
    horizonDays: 90,
    assumptions: {
      eligibleCustomersPerMonth,
      observedAtRiskRate,
      contributionMarginPerRetainedCustomer,
      monthlyIncentiveSpend,
      pilotFee,
      sourceWindowFa: input.sourceWindowFa || "منبع و بازه داده مشخص نشده است",
      caveatFa: "این forecast اثبات causal نیست؛ نرخ نجات و صرفه‌جویی باید با holdout جایگزین شوند."
    },
    scenarios
  };
}

function scenario(key, input, base) {
  if (!input) throw new Error(`سناریوی ${key} لازم است.`);
  const incrementalSaveRate = rate(input.incrementalSaveRate, `${key}.incrementalSaveRate`);
  const avoidableIncentiveRate = rate(input.avoidableIncentiveRate, `${key}.avoidableIncentiveRate`);
  const policyCoverageRate = rate(input.policyCoverageRate, `${key}.policyCoverageRate`);
  const atRiskCustomers = base.eligibleCustomersPerMonth * base.observedAtRiskRate * policyCoverageRate;
  const retainedCustomers = atRiskCustomers * incrementalSaveRate;
  const retainedContribution = retainedCustomers * base.contributionMarginPerRetainedCustomer;
  const incentiveSavings = base.monthlyIncentiveSpend * avoidableIncentiveRate;
  const monthlyValue = retainedContribution + incentiveSavings;
  const value90d = monthlyValue * 3;
  return {
    key,
    labelFa: { conservative: "محافظه‌کارانه", base: "پایه", upside: "خوش‌بینانه" }[key],
    assumptions: { incrementalSaveRate, avoidableIncentiveRate, policyCoverageRate },
    atRiskCustomers: Math.round(atRiskCustomers),
    retainedCustomers: roundOne(retainedCustomers),
    retainedContribution: Math.round(retainedContribution),
    incentiveSavings: Math.round(incentiveSavings),
    monthlyValue: Math.round(monthlyValue),
    value90d: Math.round(value90d),
    valueCostRatio90d: roundOne(value90d / base.pilotFee),
    paybackMonths: monthlyValue > 0 ? roundOne(base.pilotFee / monthlyValue) : null
  };
}

function rate(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${name} باید بین صفر و یک باشد.`);
  return number;
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} باید عدد مثبت باشد.`);
  return number;
}

function nonNegativeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} باید صفر یا بیشتر باشد.`);
  return number;
}

function decisionLabel(decision) {
  if (decision === "qualified") return "از نظر اقتصادی واجد شرایط پایلوت";
  if (decision === "validate_with_paid_diagnostic") return "ابتدا Diagnostic پولی و محدود اجرا شود";
  return "در حال حاضر توجیه اقتصادی کافی نیست";
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

module.exports = { buildChurnValueCase };

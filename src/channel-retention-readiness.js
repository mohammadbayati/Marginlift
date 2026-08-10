const DEFAULT_CHANNEL_RETENTION_CONTRACT = Object.freeze({
  minimumHistoryDays: 365,
  minimumCustomers: 1000,
  minimumRepeatCustomers: 500,
  successfulStatuses: ["completed", "success", "successful", "paid"]
});

const REQUIRED_TRANSACTION_HEADERS = Object.freeze([
  "customer_id_hash",
  "transaction_id",
  "purchased_at",
  "transaction_status",
  "operator",
  "package_id",
  "paid_amount",
  "discount_amount",
  "cashback_amount"
]);

const REQUIRED_INTERVENTION_HEADERS = Object.freeze([
  "campaign_id",
  "customer_id_hash",
  "assigned_group",
  "assigned_at",
  "exposed_at",
  "action_type",
  "incentive_amount"
]);

const DIRECT_PII_HEADERS = new Set([
  "name",
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "mobile",
  "msisdn",
  "national_id",
  "card_number",
  "ip",
  "ip_address",
  "device_id"
]);

function auditChannelRetentionData(transactionRows, interventionRows = [], options = {}) {
  const contract = { ...DEFAULT_CHANNEL_RETENTION_CONTRACT, ...options };
  const transactionHeaders = collectHeaders(transactionRows);
  const missingTransactionHeaders = REQUIRED_TRANSACTION_HEADERS.filter(header => !transactionHeaders.has(header));
  const piiHeaders = [...transactionHeaders].filter(header => DIRECT_PII_HEADERS.has(header));
  const exposedPiiRows = transactionRows.filter(row => looksLikeDirectIdentifier(row.customer_id_hash));
  const invalidTransactionRows = transactionRows.filter(row => !validTransactionRow(row));
  const successfulRows = transactionRows.filter(row => isSuccessfulPurchase(row, contract));
  const duplicateTransactionIds = countDuplicateValues(successfulRows, "transaction_id");
  const invalidFinancialRows = transactionRows.filter(row => invalidFinancialRow(row));
  const coverageDays = calculateCoverageDays(successfulRows, "purchased_at");
  const customerPurchaseCounts = countBy(successfulRows, "customer_id_hash");
  const uniqueCustomers = customerPurchaseCounts.size;
  const repeatCustomers = [...customerPurchaseCounts.values()].filter(count => count >= 2).length;
  const hasPackageTiming = transactionHeaders.has("validity_days") || transactionHeaders.has("expires_at");
  const hasEconomics = transactionHeaders.has("contribution_margin") || transactionHeaders.has("net_revenue");
  const invalidValidityRows = successfulRows.filter(row => invalidValidity(row));

  const interventionAudit = auditInterventions(interventionRows);

  const checks = [
    makeCheck("transaction_schema", missingTransactionHeaders.length === 0, true, 15, "قرارداد تراکنش",
      missingTransactionHeaders.length
        ? `ستون‌های لازم موجود نیست: ${missingTransactionHeaders.join(", ")}`
        : "ستون‌های پایه خرید بسته موجود است."),
    makeCheck("privacy_headers", piiHeaders.length === 0, true, 10, "حریم خصوصی ستون‌ها",
      piiHeaders.length
        ? `ستون‌های شناسایی مستقیم حذف شوند: ${piiHeaders.join(", ")}`
        : "ستون PII مستقیم پیدا نشد."),
    makeCheck("privacy_values", exposedPiiRows.length === 0, true, 10, "ناشناس‌بودن شناسه",
      exposedPiiRows.length
        ? `${exposedPiiRows.length} شناسه شبیه موبایل یا ایمیل است؛ پیش از انتقال hash شود.`
        : "شناسه آشکار موبایل یا ایمیل در نمونه پیدا نشد."),
    makeCheck("valid_transactions", invalidTransactionRows.length === 0, true, 10, "اعتبار ردیف‌ها",
      invalidTransactionRows.length
        ? `${invalidTransactionRows.length} ردیف کلید، تاریخ یا وضعیت معتبر ندارد.`
        : "ردیف‌های تراکنش از نظر کلید و تاریخ معتبرند."),
    makeCheck("financial_values", invalidFinancialRows.length === 0, true, 10, "اعتبار مالی",
      invalidFinancialRows.length
        ? `${invalidFinancialRows.length} ردیف مبلغ منفی یا نامعتبر دارد.`
        : "مقادیر مالی پایه نامنفی و قابل خواندن‌اند."),
    makeCheck("history", coverageDays >= contract.minimumHistoryDays, false, 10, "پوشش تاریخی",
      `${coverageDays} روز خرید موفق موجود است؛ حداقل فنی اولیه ${contract.minimumHistoryDays} روز است.`),
    makeCheck("sample", uniqueCustomers >= contract.minimumCustomers, false, 10, "حجم مشتری",
      `${uniqueCustomers} مشتری یکتا موجود است؛ حداقل فنی اولیه ${contract.minimumCustomers} است.`),
    makeCheck("repeat_signal", repeatCustomers >= contract.minimumRepeatCustomers, false, 10, "سیگنال خرید مجدد",
      `${repeatCustomers} مشتری حداقل دو خرید موفق دارد؛ حداقل فنی اولیه ${contract.minimumRepeatCustomers} است.`),
    makeCheck("package_timing", hasPackageTiming && invalidValidityRows.length === 0, false, 5, "زمان‌بندی بسته",
      !hasPackageTiming
        ? "برای موعد تمدید دقیق‌تر، validity_days یا expires_at اضافه شود."
        : invalidValidityRows.length
          ? `${invalidValidityRows.length} ردیف اعتبار یا انقضای نامعتبر دارد.`
          : "اعتبار یا انقضای بسته قابل استفاده است."),
    makeCheck("economics", hasEconomics, false, 5, "اقتصاد تصمیم",
      hasEconomics
        ? "net_revenue یا contribution_margin برای Value Case موجود است."
        : "برای تصمیم سودمحور، net_revenue یا contribution_margin لازم است."),
    makeCheck("intervention", interventionAudit.readyForPilotDesign, false, 5, "قرارداد مداخله",
      interventionAudit.detailFa)
  ];

  const blockingFailure = checks.some(item => item.blocking && !item.passed);
  const survivalFailure = checks.some(item => ["history", "sample", "repeat_signal"].includes(item.key) && !item.passed);
  const status = blockingFailure
    ? "needs_data_fix"
    : survivalFailure
      ? "diagnostic_only"
      : "ready";

  const warnings = [];
  if (duplicateTransactionIds) warnings.push(`${duplicateTransactionIds} transaction_id تکراری پیدا شد؛ raw حفظ و clean deduplicate شود.`);
  if (!hasPackageTiming) warnings.push("مدل می‌تواند از cadence استفاده کند، اما نبود اعتبار بسته دقت موعد تمدید را محدود می‌کند.");
  if (!interventionRows.length) warnings.push("فایل مداخله ارائه نشده است؛ اثر causal یا Saveability قابل برآورد نیست.");
  warnings.push(`عدم خرید در ${contract.channelLabelFa || "کانال تنظیم‌شده"}، مدرک خرید از کانال رقیب نیست.`);

  return {
    status,
    statusFa: statusLabel(status),
    decision: status === "ready" ? "proceed" : status === "diagnostic_only" ? "diagnostic_only" : "fix_data",
    score: Math.round(checks.reduce((total, item) => total + (item.passed ? item.weight : 0), 0)),
    contract: {
      useCase: contract.useCase || "channel_repurchase_retention",
      unitOfAnalysis: contract.unitOfAnalysis || "customer_channel_product_type",
      minimumHistoryDays: contract.minimumHistoryDays,
      horizonsDays: contract.horizonsDays || [30, 90, 180],
      labelSource: "derived_time_to_next_purchase",
      competitorPurchaseObservable: false
    },
    summary: {
      transactionRows: transactionRows.length,
      successfulPurchases: successfulRows.length,
      uniqueCustomers,
      repeatCustomers,
      coverageDays,
      duplicateTransactionIds,
      invalidTransactionRows: invalidTransactionRows.length,
      invalidFinancialRows: invalidFinancialRows.length,
      interventionRows: interventionRows.length
    },
    readiness: {
      historicalBaseline: !blockingFailure && successfulRows.length > 0,
      survivalModel: status === "ready",
      profitDecisioning: status === "ready" && hasEconomics,
      pilotDesign: interventionAudit.readyForPilotDesign,
      causalClaim: false,
      causalClaimReasonFa: "ادعای causal فقط پس از اجرای holdout سالم و بسته‌شدن outcome مجاز است."
    },
    interventionAudit,
    checks,
    warnings,
    cleaningPlan: buildCleaningPlan({
      invalidTransactionRows,
      invalidFinancialRows,
      invalidValidityRows,
      duplicateTransactionIds,
      exposedPiiRows
    }),
    nextActionFa: nextAction(status, checks)
  };
}

function auditInterventions(rows) {
  if (!rows.length) {
    return {
      supplied: false,
      readyForPilotDesign: false,
      missingHeaders: [...REQUIRED_INTERVENTION_HEADERS],
      groups: [],
      invalidRows: 0,
      assignmentAfterExposure: 0,
      detailFa: "فایل مداخله هنوز ارائه نشده است."
    };
  }

  const headers = collectHeaders(rows);
  const missingHeaders = REQUIRED_INTERVENTION_HEADERS.filter(header => !headers.has(header));
  const invalidRows = rows.filter(row => !row.campaign_id
    || !row.customer_id_hash
    || !row.assigned_group
    || !validDate(row.assigned_at)
    || !validDate(row.exposed_at)
    || !row.action_type
    || invalidNonNegativeNumber(row.incentive_amount));
  const assignmentAfterExposure = rows.filter(row => validDate(row.assigned_at)
    && validDate(row.exposed_at)
    && new Date(row.assigned_at).getTime() > new Date(row.exposed_at).getTime()).length;
  const groups = [...new Set(rows.map(row => normalizeGroup(row.assigned_group)).filter(Boolean))];
  const hasControl = groups.some(group => ["control", "holdout"].includes(group));
  const hasTreatment = groups.some(group => !["control", "holdout"].includes(group));
  const readyForPilotDesign = missingHeaders.length === 0
    && invalidRows.length === 0
    && assignmentAfterExposure === 0
    && hasControl
    && hasTreatment;

  let detailFa = "فایل مداخله برای طراحی پایلوت قابل استفاده است.";
  if (missingHeaders.length) detailFa = `ستون‌های مداخله موجود نیست: ${missingHeaders.join(", ")}`;
  else if (invalidRows.length) detailFa = `${invalidRows.length} ردیف مداخله کلید یا تاریخ معتبر ندارد.`;
  else if (assignmentAfterExposure) detailFa = `${assignmentAfterExposure} assignment بعد از exposure ثبت شده است.`;
  else if (!hasControl || !hasTreatment) detailFa = "هر دو گروه control و treatment لازم‌اند.";

  return {
    supplied: true,
    readyForPilotDesign,
    missingHeaders,
    groups,
    invalidRows: invalidRows.length,
    assignmentAfterExposure,
    detailFa
  };
}

function collectHeaders(rows) {
  return new Set(rows.flatMap(row => Object.keys(row)));
}

function validTransactionRow(row) {
  return Boolean(
    row.customer_id_hash
    && row.transaction_id
    && row.transaction_status
    && row.operator
    && row.package_id
    && validDate(row.purchased_at)
    && hasValue(row.paid_amount)
    && hasValue(row.discount_amount)
    && hasValue(row.cashback_amount)
  );
}

function isSuccessfulPurchase(row, contract) {
  return validTransactionRow(row) && contract.successfulStatuses.includes(normalizeGroup(row.transaction_status));
}

function looksLikeDirectIdentifier(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return true;
  return /^(?:\+?98|0)?9\d{9}$/.test(normalized.replace(/[\s()-]/g, ""));
}

function invalidFinancialRow(row) {
  const invalidCost = ["paid_amount", "discount_amount", "cashback_amount"]
    .some(field => invalidNonNegativeNumber(row[field]));
  const invalidEconomics = ["net_revenue", "contribution_margin"]
    .some(field => Object.prototype.hasOwnProperty.call(row, field) && invalidOptionalNumber(row[field]));
  return invalidCost || invalidEconomics;
}

function invalidValidity(row) {
  if (Object.prototype.hasOwnProperty.call(row, "validity_days") && String(row.validity_days).trim() !== "") {
    const validity = parseNumber(row.validity_days);
    if (!Number.isFinite(validity) || validity <= 0) return true;
  }
  if (Object.prototype.hasOwnProperty.call(row, "expires_at") && String(row.expires_at).trim() !== "") {
    return !validDate(row.expires_at);
  }
  return false;
}

function invalidNonNegativeNumber(value) {
  if (!hasValue(value)) return true;
  const number = parseNumber(value);
  return !Number.isFinite(number) || number < 0;
}

function invalidOptionalNumber(value) {
  if (!hasValue(value)) return false;
  return !Number.isFinite(parseNumber(value));
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function parseNumber(value) {
  const normalized = String(value || "")
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/,/g, "")
    .trim();
  return Number(normalized);
}

function validDate(value) {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

function normalizeGroup(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function countBy(rows, field) {
  const counts = new Map();
  rows.forEach(row => {
    const value = String(row[field] || "").trim();
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}

function countDuplicateValues(rows, field) {
  const counts = countBy(rows, field);
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function calculateCoverageDays(rows, field) {
  if (rows.length < 2) return 0;
  const timestamps = rows.map(row => new Date(row[field]).getTime()).filter(Number.isFinite);
  if (timestamps.length < 2) return 0;
  return Math.floor((Math.max(...timestamps) - Math.min(...timestamps)) / 86400000);
}

function makeCheck(key, passed, blocking, weight, labelFa, detailFa) {
  return { key, passed, blocking, weight, labelFa, detailFa };
}

function buildCleaningPlan({
  invalidTransactionRows,
  invalidFinancialRows,
  invalidValidityRows,
  duplicateTransactionIds,
  exposedPiiRows
}) {
  const issues = [];
  if (exposedPiiRows.length) issues.push(cleaningIssue("critical", "reject_direct_identifier", exposedPiiRows.length, "شناسه مستقیم رد و در مبدأ hash شود."));
  if (invalidTransactionRows.length) issues.push(cleaningIssue("critical", "quarantine_invalid_transaction", invalidTransactionRows.length, "ردیف فاقد کلید یا تاریخ معتبر قرنطینه شود."));
  if (invalidFinancialRows.length) issues.push(cleaningIssue("high", "quarantine_invalid_financial", invalidFinancialRows.length, "مقدار مالی حدس زده نشود و با منبع مالی تطبیق داده شود."));
  if (invalidValidityRows.length) issues.push(cleaningIssue("high", "review_package_timing", invalidValidityRows.length, "اعتبار یا انقضای بسته با catalog محصول تطبیق داده شود."));
  if (duplicateTransactionIds) issues.push(cleaningIssue("high", "deduplicate_transaction_id", duplicateTransactionIds, "raw حفظ و نسخه clean با transaction_id یکتا ساخته شود."));
  return {
    policy: "raw_immutable_clean_versioned_no_silent_imputation",
    issues,
    verificationFa: "پس از cleaning، row count، quarantine count و checksum نسخه raw و clean ثبت و ممیزی دوباره اجرا شود."
  };
}

function cleaningIssue(severity, action, affectedRows, rationaleFa) {
  return { severity, action, affectedRows, rationaleFa };
}

function statusLabel(status) {
  if (status === "ready") return "آماده Diagnostic و Survival baseline";
  if (status === "diagnostic_only") return "فقط تحلیل تشخیصی";
  return "نیازمند اصلاح داده";
}

function nextAction(status, checks) {
  if (status === "ready") return "dataset point-in-time و survival baseline را بسازید؛ causal claim هنوز مجاز نیست.";
  const firstFailure = checks.find(item => !item.passed);
  return firstFailure?.detailFa || "قرارداد داده را تکمیل کنید.";
}

module.exports = {
  DEFAULT_CHANNEL_RETENTION_CONTRACT,
  REQUIRED_INTERVENTION_HEADERS,
  REQUIRED_TRANSACTION_HEADERS,
  auditChannelRetentionData
};

const DEFAULT_CONTRACT = Object.freeze({
  observationWindowDays: 90,
  predictionWindowDays: 30,
  minimumCustomers: 200,
  purchaseEventTypes: ["purchase_completed", "order_completed", "transaction_completed"]
});

const PII_HEADERS = new Set([
  "name",
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "mobile",
  "address",
  "national_id",
  "card_number",
  "device_id"
]);

function auditChurnEventRows(rows, options = {}) {
  const contract = { ...DEFAULT_CONTRACT, ...options };
  const headers = new Set(rows.flatMap(row => Object.keys(row)));
  const missingHeaders = ["customer_id", "event_type", "occurred_at"].filter(header => !headers.has(header));
  const piiHeaders = [...headers].filter(header => PII_HEADERS.has(header));
  const invalidRows = rows.filter(row => !row.customer_id || !row.event_type || !validDate(row.occurred_at));
  const validRows = rows.filter(row => row.customer_id && row.event_type && validDate(row.occurred_at));
  const uniqueCustomers = new Set(validRows.map(row => String(row.customer_id).trim())).size;
  const purchaseRows = validRows.filter(row => contract.purchaseEventTypes.includes(normalizeEventType(row.event_type)));
  const coverageDays = calculateCoverageDays(validRows);
  const duplicateRows = countDuplicates(validRows);
  const duplicateOrderIds = countDuplicateOrderIds(purchaseRows);
  const hasFinancialValue = headers.has("event_value_toman") || headers.has("revenue_toman");
  const hasMargin = headers.has("gross_margin_rate") || headers.has("gross_margin_toman");
  const hasDiscountCost = headers.has("discount_amount_toman") || headers.has("incentive_cost_toman");
  const invalidFinancialRows = validRows.filter(row => invalidFinancialValue(row));
  const suppliedLabel = headers.has("churned") || headers.has("is_churned") || headers.has("churn_label");

  const checks = [
    check("schema", missingHeaders.length === 0, true, "ستون‌های پایه", missingHeaders.length
      ? `ستون‌های لازم موجود نیست: ${missingHeaders.join(", ")}`
      : "customer_id، event_type و occurred_at موجود است."),
    check("privacy", piiHeaders.length === 0, true, "حریم خصوصی", piiHeaders.length
      ? `ستون‌های شناسایی مستقیم حذف شوند: ${piiHeaders.join(", ")}`
      : "ستون شناسایی مستقیم مشتری پیدا نشد."),
    check("valid_rows", invalidRows.length === 0, true, "اعتبار ردیف‌ها", invalidRows.length
      ? `${invalidRows.length} ردیف شناسه، نوع رویداد یا تاریخ معتبر ندارد.`
      : "همه ردیف‌ها شناسه، رویداد و تاریخ معتبر دارند."),
    check("history", coverageDays >= contract.observationWindowDays + contract.predictionWindowDays, false, "پوشش زمانی",
      `${coverageDays} روز داده موجود است؛ حداقل ${contract.observationWindowDays + contract.predictionWindowDays} روز لازم است.`),
    check("sample", uniqueCustomers >= contract.minimumCustomers, false, "حجم نمونه",
      `${uniqueCustomers} مشتری یکتا موجود است؛ حداقل اولیه ${contract.minimumCustomers} مشتری است.`),
    check("purchase_signal", purchaseRows.length >= contract.minimumCustomers, false, "سیگنال خرید",
      `${purchaseRows.length} رویداد خرید موفق با واژگان قراردادی پیدا شد.`),
    check("economics", hasFinancialValue && hasMargin && hasDiscountCost && invalidFinancialRows.length === 0, false, "اقتصاد تصمیم",
      hasFinancialValue && hasMargin && hasDiscountCost && invalidFinancialRows.length === 0
        ? "ارزش تراکنش، حاشیه سود و هزینه تخفیف قابل محاسبه است."
        : invalidFinancialRows.length
          ? `${invalidFinancialRows.length} ردیف مقدار مالی منفی یا حاشیه سود خارج از بازه دارد.`
          : "برای تصمیم سودمحور، ارزش تراکنش، حاشیه سود و هزینه تخفیف را کامل کنید.")
  ];

  const blockingFailures = checks.filter(item => item.blocking && !item.passed);
  const modelingFailures = checks.filter(item => ["history", "sample", "purchase_signal"].includes(item.key) && !item.passed);
  const status = blockingFailures.length
    ? "needs_data_fix"
    : modelingFailures.length
      ? "diagnostic_only"
      : "ready";

  const score = Math.round(checks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0));
  const warnings = [];
  if (duplicateRows) warnings.push(`${duplicateRows} رویداد تکراری احتمالی پیدا شد.`);
  if (duplicateOrderIds) warnings.push(`${duplicateOrderIds} order_id خرید بیش از یک‌بار ثبت شده است.`);
  if (suppliedLabel) warnings.push("برچسب churn ارسالی feature محسوب نمی‌شود؛ MarginLift برچسب را از پنجره زمانی می‌سازد.");
  if (status === "ready" && !(hasFinancialValue && hasMargin && hasDiscountCost)) {
    warnings.push("داده برای مدل ریسک آماده است، اما برای تصمیم سودمحور MarginLift کافی نیست.");
  }

  return {
    status,
    statusFa: statusLabel(status),
    score,
    contract: {
      vertical: "transactional_b2c",
      observationWindowDays: contract.observationWindowDays,
      predictionWindowDays: contract.predictionWindowDays,
      churnDefinitionFa: `عدم خرید موفق در ${contract.predictionWindowDays} روز بعد از تاریخ امتیازدهی`,
      labelSource: "derived_point_in_time"
    },
    summary: {
      rows: rows.length,
      validRows: validRows.length,
      uniqueCustomers,
      purchaseEvents: purchaseRows.length,
      coverageDays,
      duplicateRows,
      duplicateOrderIds,
      invalidFinancialRows: invalidFinancialRows.length
    },
    readiness: {
      riskModel: status === "ready",
      profitDecisioning: status === "ready" && hasFinancialValue && hasMargin && hasDiscountCost && invalidFinancialRows.length === 0,
      upliftModel: false,
      upliftReasonFa: "برای Uplift، فایل assignment، exposure، treatment cost و outcome با گروه کنترل لازم است."
    },
    checks,
    warnings,
    cleaningPlan: buildCleaningPlan({ invalidRows, duplicateRows, duplicateOrderIds, invalidFinancialRows, suppliedLabel }),
    nextActionFa: nextAction(status, checks)
  };
}

function check(key, passed, blocking, labelFa, detailFa) {
  const weights = { schema: 20, privacy: 15, valid_rows: 15, history: 15, sample: 15, purchase_signal: 10, economics: 10 };
  return { key, passed, blocking, weight: weights[key], labelFa, detailFa };
}

function validDate(value) {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

function normalizeEventType(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function calculateCoverageDays(rows) {
  if (rows.length < 2) return 0;
  const timestamps = rows.map(row => new Date(row.occurred_at).getTime());
  return Math.floor((Math.max(...timestamps) - Math.min(...timestamps)) / 86400000);
}

function countDuplicates(rows) {
  const seen = new Set();
  let duplicates = 0;
  rows.forEach(row => {
    const key = [row.customer_id, normalizeEventType(row.event_type), row.occurred_at, row.order_id || ""].join("|");
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  });
  return duplicates;
}

function countDuplicateOrderIds(rows) {
  const seen = new Set();
  let duplicates = 0;
  rows.forEach(row => {
    const orderId = String(row.order_id || "").trim();
    if (!orderId) return;
    if (seen.has(orderId)) duplicates += 1;
    seen.add(orderId);
  });
  return duplicates;
}

function invalidFinancialValue(row) {
  const value = firstNumber(row.event_value_toman, row.revenue_toman);
  const discount = firstNumber(row.discount_amount_toman, row.incentive_cost_toman);
  const marginRate = firstNumber(row.gross_margin_rate);
  if (value !== null && value < 0) return true;
  if (discount !== null && discount < 0) return true;
  if (marginRate !== null && (marginRate < 0 || marginRate > 1)) return true;
  return false;
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || String(value).trim() === "") continue;
    const normalized = String(value)
      .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/,/g, "")
      .trim();
    const number = Number(normalized);
    return Number.isFinite(number) ? number : Number.NaN;
  }
  return null;
}

function buildCleaningPlan({ invalidRows, duplicateRows, duplicateOrderIds, invalidFinancialRows, suppliedLabel }) {
  const issues = [];
  if (invalidRows.length) issues.push(cleaningIssue("critical", "quarantine", invalidRows.length, "ردیف‌های فاقد کلید یا تاریخ معتبر قرنطینه شوند؛ مقدار حدسی جایگزین نشود."));
  if (duplicateRows) issues.push(cleaningIssue("high", "deduplicate_exact", duplicateRows, "نسخه raw حفظ و تکرار دقیق با کلید رویداد حذف شود."));
  if (duplicateOrderIds) issues.push(cleaningIssue("high", "review_order_duplicates", duplicateOrderIds, "order_id تکراری با منبع تراکنش تطبیق داده شود؛ merge خودکار انجام نشود."));
  if (invalidFinancialRows.length) issues.push(cleaningIssue("high", "quarantine_financial", invalidFinancialRows.length, "مقادیر مالی منفی یا margin نامعتبر قرنطینه و با مالی تطبیق داده شوند."));
  if (suppliedLabel) issues.push(cleaningIssue("medium", "derive_label", 0, "برچسب ارسالی نگه‌داری می‌شود اما در training استفاده نمی‌شود؛ label از پنجره زمانی ساخته می‌شود."));
  return {
    policy: "raw_immutable_clean_versioned_no_silent_imputation",
    issues,
    verificationFa: "پس از پاک‌سازی، ممیزی دوباره اجرا و اختلاف تعداد ردیف raw و clean ثبت شود."
  };
}

function cleaningIssue(severity, action, affectedRows, rationaleFa) {
  return { severity, action, affectedRows, rationaleFa };
}

function statusLabel(status) {
  if (status === "ready") return "آماده ساخت مدل پایه Churn";
  if (status === "diagnostic_only") return "فقط تحلیل تشخیصی";
  return "نیازمند اصلاح داده";
}

function nextAction(status, checks) {
  if (status === "ready") return "Feature snapshot نقطه‌درزمان و برچسب ۳۰روزه را بسازید.";
  const firstFailure = checks.find(item => !item.passed);
  return firstFailure?.detailFa || "قرارداد داده را تکمیل کنید.";
}

module.exports = { DEFAULT_CONTRACT, auditChurnEventRows };

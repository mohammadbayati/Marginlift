const crypto = require("crypto");

const { auditChannelRetentionData } = require("./channel-retention-readiness");
const { buildChannelRetentionDataset } = require("./channel-retention-dataset");
const { applyContactPolicy, buildContactSafetyWorkspace } = require("./contact-policy");
const { buildSurvivalBaseline } = require("./survival-baseline");

const PRESETS = Object.freeze({
  generic_ecommerce: Object.freeze({
    presetKey: "generic_ecommerce",
    version: 1,
    display: {
      nameFa: "فروشگاه اینترنتی",
      industryFa: "تجارت الکترونیک",
      channelFa: "فروشگاه",
      purchaseObjectFa: "سفارش",
      currencyFa: "تومان"
    },
    mapping: {
      customerId: "customer_id_hash",
      transactionId: "order_id",
      occurredAt: "purchased_at",
      status: "order_status",
      channel: "channel",
      productId: "product_id",
      productType: "product_category",
      validityDays: "",
      expiresAt: "",
      paidAmount: "paid_amount",
      netRevenue: "net_revenue",
      contributionMargin: "contribution_margin",
      discountAmount: "discount_amount",
      cashbackAmount: "cashback_amount",
      campaignId: "campaign_id",
      consentStatus: "consent_status",
      preferredChannel: "preferred_channel",
      doNotContact: "do_not_contact",
      contactCount30d: "contact_count_30d",
      lastContactAt: "last_contact_at"
    },
    defaults: {
      status: "completed",
      channel: "primary_store",
      productId: "all_products",
      productType: "general",
      discountAmount: 0,
      cashbackAmount: 0
    },
    lifecycle: {
      dueWindowStartDays: -7,
      lapsedAfterDays: 30,
      dormantAfterDays: 90,
      lostAfterDays: 180,
      minHistoricalPurchases: 2,
      horizonsDays: [30, 90, 180]
    },
    readiness: {
      minimumHistoryDays: 180,
      minimumCustomers: 500,
      minimumRepeatCustomers: 200
    }
  }),
  super_app_packages: Object.freeze({
    presetKey: "super_app_packages",
    version: 1,
    display: {
      nameFa: "سوپراپ و خدمات تکرارشونده",
      industryFa: "سوپراپلیکیشن",
      channelFa: "اپلیکیشن",
      purchaseObjectFa: "بسته اینترنت",
      currencyFa: "تومان"
    },
    mapping: {
      customerId: "customer_id_hash",
      transactionId: "transaction_id",
      occurredAt: "purchased_at",
      status: "transaction_status",
      channel: "operator",
      productId: "package_id",
      productType: "package_category",
      validityDays: "validity_days",
      expiresAt: "expires_at",
      paidAmount: "paid_amount",
      netRevenue: "net_revenue",
      contributionMargin: "contribution_margin",
      discountAmount: "discount_amount",
      cashbackAmount: "cashback_amount",
      campaignId: "campaign_id",
      consentStatus: "consent_status",
      preferredChannel: "preferred_channel",
      doNotContact: "do_not_contact",
      contactCount30d: "contact_count_30d",
      lastContactAt: "last_contact_at"
    },
    defaults: {
      status: "completed",
      channel: "primary_app",
      productId: "service",
      productType: "general",
      discountAmount: 0,
      cashbackAmount: 0
    },
    lifecycle: {
      dueWindowStartDays: -7,
      lapsedAfterDays: 30,
      dormantAfterDays: 90,
      lostAfterDays: 180,
      minHistoricalPurchases: 2,
      horizonsDays: [30, 90, 180]
    },
    readiness: {
      minimumHistoryDays: 365,
      minimumCustomers: 1000,
      minimumRepeatCustomers: 500
    }
  }),
  subscription_services: Object.freeze({
    presetKey: "subscription_services",
    version: 1,
    display: {
      nameFa: "سرویس اشتراکی",
      industryFa: "اشتراک و عضویت",
      channelFa: "سرویس",
      purchaseObjectFa: "تمدید اشتراک",
      currencyFa: "تومان"
    },
    mapping: {
      customerId: "customer_id_hash",
      transactionId: "subscription_payment_id",
      occurredAt: "paid_at",
      status: "payment_status",
      channel: "sales_channel",
      productId: "plan_id",
      productType: "plan_type",
      validityDays: "billing_period_days",
      expiresAt: "subscription_expires_at",
      paidAmount: "paid_amount",
      netRevenue: "net_revenue",
      contributionMargin: "contribution_margin",
      discountAmount: "discount_amount",
      cashbackAmount: "cashback_amount",
      campaignId: "campaign_id",
      consentStatus: "consent_status",
      preferredChannel: "preferred_channel",
      doNotContact: "do_not_contact",
      contactCount30d: "contact_count_30d",
      lastContactAt: "last_contact_at"
    },
    defaults: {
      status: "completed",
      channel: "subscription_service",
      productId: "subscription",
      productType: "standard",
      discountAmount: 0,
      cashbackAmount: 0
    },
    lifecycle: {
      dueWindowStartDays: -7,
      lapsedAfterDays: 14,
      dormantAfterDays: 45,
      lostAfterDays: 90,
      minHistoricalPurchases: 2,
      horizonsDays: [14, 30, 90]
    },
    readiness: {
      minimumHistoryDays: 180,
      minimumCustomers: 500,
      minimumRepeatCustomers: 200
    }
  })
});

const DISPLAY_FIELDS = ["nameFa", "industryFa", "channelFa", "purchaseObjectFa", "currencyFa"];
const MAPPING_FIELDS = Object.keys(PRESETS.generic_ecommerce.mapping);
const DEFAULT_FIELDS = Object.keys(PRESETS.generic_ecommerce.defaults);
const REQUIRED_MAPPING_FIELDS = new Set(["customerId", "transactionId", "occurredAt", "paidAmount"]);
const DIRECT_PII_HEADERS = new Set([
  "name", "full_name", "first_name", "last_name", "email", "phone", "mobile", "msisdn",
  "national_id", "card_number", "ip", "ip_address", "device_id"
]);
const MAPPING_SCHEMA = Object.freeze([
  mappingField("customerId", "شناسه ناشناس مشتری", true, ["customer_id_hash", "customer_id", "user_id_hash", "member_id_hash", "شناسه_مشتری"]),
  mappingField("transactionId", "شناسه تراکنش", true, ["transaction_id", "order_id", "payment_id", "subscription_payment_id", "شناسه_تراکنش"]),
  mappingField("occurredAt", "زمان خرید", true, ["purchased_at", "paid_at", "order_at", "transaction_at", "created_at", "تاریخ_خرید"]),
  mappingField("paidAmount", "مبلغ پرداختی", true, ["paid_amount", "amount", "order_amount", "payment_amount", "مبلغ_پرداختی"]),
  mappingField("status", "وضعیت تراکنش", false, ["transaction_status", "order_status", "payment_status", "status", "وضعیت"]),
  mappingField("channel", "کانال یا اپراتور", false, ["operator", "channel", "sales_channel", "source", "کانال"]),
  mappingField("productId", "شناسه محصول یا پلن", false, ["package_id", "product_id", "plan_id", "sku", "شناسه_محصول"]),
  mappingField("productType", "نوع محصول", false, ["package_category", "product_category", "plan_type", "category", "نوع_محصول"]),
  mappingField("validityDays", "مدت اعتبار", false, ["validity_days", "billing_period_days", "duration_days", "مدت_اعتبار"]),
  mappingField("expiresAt", "زمان انقضا", false, ["expires_at", "subscription_expires_at", "expiry_at", "تاریخ_انقضا"]),
  mappingField("netRevenue", "درآمد خالص", false, ["net_revenue", "net_revenue_toman", "درآمد_خالص"]),
  mappingField("contributionMargin", "سود مشارکتی", false, ["contribution_margin", "contribution_profit", "margin_amount", "سود_مشارکتی"]),
  mappingField("discountAmount", "مبلغ تخفیف", false, ["discount_amount", "discount", "مبلغ_تخفیف"]),
  mappingField("cashbackAmount", "مبلغ بازگشت وجه", false, ["cashback_amount", "cashback", "مبلغ_کش_بک"]),
  mappingField("campaignId", "شناسه کمپین", false, ["campaign_id", "promotion_id", "شناسه_کمپین"]),
  mappingField("consentStatus", "وضعیت رضایت تماس", false, ["consent_status", "marketing_consent", "رضایت_تماس"]),
  mappingField("preferredChannel", "کانال ترجیحی", false, ["preferred_channel", "contact_channel", "کانال_ترجیحی"]),
  mappingField("doNotContact", "عدم تماس", false, ["do_not_contact", "opt_out", "عدم_تماس"]),
  mappingField("contactCount30d", "تعداد تماس ۳۰ روزه", false, ["contact_count_30d", "contacts_last_30d", "تعداد_تماس_۳۰_روزه"]),
  mappingField("lastContactAt", "زمان آخرین تماس", false, ["last_contact_at", "last_marketing_contact_at", "آخرین_تماس"])
]);

function listRetentionPresets() {
  return Object.values(PRESETS).map(preset => ({
    key: preset.presetKey,
    nameFa: preset.display.nameFa,
    industryFa: preset.display.industryFa,
    purchaseObjectFa: preset.display.purchaseObjectFa,
    channelFa: preset.display.channelFa,
    lifecycle: preset.lifecycle
  }));
}

function getRetentionPreset(key = "generic_ecommerce") {
  const preset = PRESETS[key] || PRESETS.generic_ecommerce;
  return JSON.parse(JSON.stringify(preset));
}

function previewRetentionRows(rows, configInput, mappingInput = {}, options = {}) {
  const base = normalizeRetentionConfig(configInput, configInput?.presetKey);
  const columns = Object.keys(rows[0] || {});
  const columnIndex = new Map(columns.map(column => [normalizeColumnName(column), column]));
  const effectiveMapping = {};
  const fields = MAPPING_SCHEMA.map(field => {
    const explicit = mappingInput[field.key];
    const configured = base.mapping[field.key];
    const candidates = [explicit, configured, ...field.aliases].filter(Boolean);
    const matched = candidates.map(candidate => columnIndex.get(normalizeColumnName(candidate))).find(Boolean) || "";
    effectiveMapping[field.key] = matched;
    return {
      key: field.key,
      labelFa: field.labelFa,
      required: field.required,
      column: matched,
      status: matched ? (explicit && normalizeColumnName(explicit) === normalizeColumnName(matched) ? "selected" : "detected") : "missing",
      statusFa: matched ? "تشخیص داده شد" : field.required ? "انتخاب ستون الزامی است" : "اختیاری"
    };
  });
  const missingRequired = fields.filter(field => field.required && !field.column).map(field => field.key);
  const privacy = inspectRawPrivacy(rows, columns, effectiveMapping.customerId);
  const config = normalizeRetentionConfig({ ...base, mapping: effectiveMapping }, base.presetKey);
  let analysis = null;
  if (!missingRequired.length && !privacy.blocked) {
    analysis = analyzeRetentionRows(rows, config, { cutoff: options.cutoff });
  }

  return {
    rowCount: rows.length,
    columns,
    fields,
    mapping: effectiveMapping,
    missingRequired,
    privacy,
    readyForImport: missingRequired.length === 0 && !privacy.blocked,
    readiness: analysis?.readiness || null,
    cutoffAt: analysis?.cutoffAt || null,
    nextActionFa: privacy.blocked
      ? "ستون‌های شناسایی مستقیم را حذف و فایل را دوباره انتخاب کنید."
      : missingRequired.length
        ? "ستون‌های الزامی بدون نگاشت را مشخص کنید."
        : analysis?.readiness?.nextActionFa || "فایل برای تحلیل آماده است."
  };
}

function normalizeRetentionConfig(input = {}, fallbackKey = "generic_ecommerce") {
  const presetKey = PRESETS[input.presetKey] ? input.presetKey : fallbackKey;
  const base = getRetentionPreset(presetKey);
  const display = mergeTextFields(base.display, input.display, DISPLAY_FIELDS, 60);
  const mapping = mergeMapping(base.mapping, input.mapping);
  const defaults = mergeDefaults(base.defaults, input.defaults);
  const lifecycle = normalizeLifecycle({ ...base.lifecycle, ...(input.lifecycle || {}) });
  const readiness = normalizeReadiness({ ...base.readiness, ...(input.readiness || {}) });

  return {
    presetKey,
    version: Number(input.version || base.version || 1),
    display,
    mapping,
    defaults,
    lifecycle,
    readiness,
    evidencePolicy: {
      causalClaimRequiresHoldout: true,
      riskAloneAllowsIncentive: false,
      competitorPurchaseObservable: false
    }
  };
}

function mapRetentionRows(rows, configInput) {
  const config = normalizeRetentionConfig(configInput, configInput?.presetKey);
  return rows.map(row => ({
    customer_id_hash: mappedValue(row, config, "customerId"),
    transaction_id: mappedValue(row, config, "transactionId"),
    purchased_at: mappedValue(row, config, "occurredAt"),
    transaction_status: mappedValue(row, config, "status"),
    operator: mappedValue(row, config, "channel"),
    package_id: mappedValue(row, config, "productId"),
    package_category: mappedValue(row, config, "productType"),
    validity_days: mappedValue(row, config, "validityDays"),
    expires_at: mappedValue(row, config, "expiresAt"),
    paid_amount: mappedValue(row, config, "paidAmount"),
    net_revenue: mappedValue(row, config, "netRevenue"),
    contribution_margin: mappedValue(row, config, "contributionMargin"),
    discount_amount: mappedValue(row, config, "discountAmount"),
    cashback_amount: mappedValue(row, config, "cashbackAmount"),
    campaign_id: mappedValue(row, config, "campaignId"),
    consent_status: mappedValue(row, config, "consentStatus"),
    preferred_channel: mappedValue(row, config, "preferredChannel"),
    do_not_contact: mappedValue(row, config, "doNotContact"),
    contact_count_30d: mappedValue(row, config, "contactCount30d"),
    last_contact_at: mappedValue(row, config, "lastContactAt")
  }));
}

function analyzeRetentionRows(rows, configInput, options = {}) {
  const config = normalizeRetentionConfig(configInput, configInput?.presetKey);
  const canonicalRows = mapRetentionRows(rows, config);
  const readinessOptions = {
    ...config.readiness,
    horizonsDays: config.lifecycle.horizonsDays,
    useCase: `${config.presetKey}_retention`,
    unitOfAnalysis: "customer_channel_product_type",
    channelLabelFa: config.display.channelFa
  };
  const readiness = auditChannelRetentionData(canonicalRows, [], readinessOptions);
  const cutoff = resolveCutoff(canonicalRows, options.cutoff);
  let dataset = null;
  let baseline = null;

  if (readiness.status !== "needs_data_fix" && cutoff) {
    dataset = buildChannelRetentionDataset(canonicalRows, {
      cutoff,
      contract: readinessOptions,
      lifecycle: config.lifecycle,
      useCase: `${config.presetKey}_retention`,
      unitOfAnalysis: "customer_channel_product_type",
      channelLabelFa: config.display.channelFa
    });
    if (dataset.episodes.length) {
      baseline = buildSurvivalBaseline(dataset, { horizons: config.lifecycle.horizonsDays });
    }
  }

  const decisionQueue = applyContactPolicy(buildRetentionDecisionQueue(config, dataset), canonicalRows);
  const contactSafety = buildContactSafetyWorkspace(decisionQueue);
  return {
    config,
    cutoffAt: cutoff ? new Date(cutoff).toISOString() : null,
    readiness,
    dataset,
    baseline,
    decisionQueue,
    contactSafety,
    workspace: buildRetentionWorkspace(config, readiness, dataset, baseline, decisionQueue, contactSafety)
  };
}

function buildRetentionWorkspace(configInput, readiness = null, dataset = null, baseline = null, fullDecisionQueue = null, contactSafetyInput = null) {
  const config = normalizeRetentionConfig(configInput, configInput?.presetKey);
  const policyVersion = retentionPolicyVersion(config);
  if (!readiness) {
    return {
      status: "awaiting_data",
      statusFa: "در انتظار داده",
      evidenceLevel: "no_evidence",
      headlineFa: `چرخه خرید ${config.display.purchaseObjectFa} را اندازه‌گیری کنید`,
      nextActionFa: "فایل تراکنش را وارد کنید تا آمادگی داده و خط مبنا ساخته شود.",
      policyVersion,
      metrics: emptyMetrics(),
      states: lifecycleStates(config, []),
      queue: [],
      contactSafety: buildContactSafetyWorkspace([])
    };
  }

  const snapshots = dataset?.snapshots || [];
  const decisionQueue = fullDecisionQueue || buildRetentionDecisionQueue(config, dataset);
  const contactSafety = contactSafetyInput || buildContactSafetyWorkspace(decisionQueue);
  const queue = decisionQueue.slice(0, 50);
  const status = readiness.status === "ready" ? "baseline_ready" : readiness.status;
  const median = baseline?.overall?.medianTimeToRepurchaseDays ?? null;

  return {
    status,
    statusFa: status === "baseline_ready" ? "خط مبنا آماده است" : readiness.statusFa,
    evidenceLevel: "observational_baseline",
    evidenceLabelFa: "برآورد تاریخی؛ هنوز اثر مداخله تأیید نشده است",
    policyVersion,
    headlineFa: median === null
      ? "برای تخمین پایدار چرخه خرید، داده بیشتری لازم است"
      : `میانه زمان خرید مجدد ${median} روز است`,
    nextActionFa: readiness.status === "ready"
      ? "سیاست اقدام را در Shadow Mode ارزیابی و سپس با holdout آزمایش کنید."
      : readiness.nextActionFa,
    metrics: {
      units: dataset?.summary?.units || 0,
      eligibleUnits: dataset?.summary?.eligibleSnapshots || 0,
      medianRepurchaseDays: median,
      queueSize: queue.length,
      contactAllowed: contactSafety.summary.actionAllowed,
      contactBlocked: contactSafety.summary.blocked,
      repeatCustomers: readiness.summary.repeatCustomers,
      coverageDays: readiness.summary.coverageDays
    },
    states: lifecycleStates(config, snapshots),
    queue,
    contactSafety
  };
}

function buildRetentionDecisionQueue(configInput, dataset) {
  const config = normalizeRetentionConfig(configInput, configInput?.presetKey);
  const policyVersion = retentionPolicyVersion(config);
  return (dataset?.snapshots || [])
    .filter(item => item.eligible && item.state !== "active")
    .sort((left, right) => right.daysFromDue - left.daysFromDue)
    .map(item => toQueueItem(item, config, policyVersion));
}

function toQueueItem(snapshot, config, policyVersion) {
  const action = actionForState(snapshot.state);
  return {
    customerIdHash: snapshot.customerIdHash,
    channel: snapshot.operator,
    productType: snapshot.packageType,
    state: snapshot.state,
    stateFa: stateLabel(snapshot.state),
    daysFromDue: snapshot.daysFromDue,
    purchaseCount: snapshot.purchaseCount,
    averageContributionMargin: snapshot.averageContributionMargin,
    recommendedAction: action.key,
    recommendedActionFa: action.labelFa,
    riskBand: action.riskBand,
    riskLabelFa: action.riskLabelFa,
    incentivePolicy: action.incentivePolicy,
    incentivePolicyFa: action.incentivePolicyFa,
    decisionReasonFa: action.reasonFa,
    incentiveAllowed: false,
    policyVersion,
    evidenceLabelFa: `برآورد تاریخی در ${config.display.channelFa}`
  };
}

function retentionPolicyVersion(config) {
  const payload = {
    presetKey: config.presetKey,
    lifecycle: config.lifecycle,
    evidencePolicy: config.evidencePolicy,
    actionPolicy: "retention_rule_policy_v1"
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function actionForState(state) {
  if (state === "due") return {
    key: "reminder_test",
    labelFa: "یادآوری بدون تخفیف",
    riskBand: "medium",
    riskLabelFa: "ریسک متوسط",
    incentivePolicy: "no_discount",
    incentivePolicyFa: "تخفیف ندهید",
    reasonFa: "موعد خرید نزدیک است؛ ابتدا یک یادآوری کم‌هزینه را بیازمایید."
  };
  if (state === "lapsed") return {
    key: "channel_nudge_test",
    labelFa: "پیام بازگشت بدون تخفیف",
    riskBand: "high",
    riskLabelFa: "ریسک بالا",
    incentivePolicy: "no_discount",
    incentivePolicyFa: "فعلاً تخفیف ندهید",
    reasonFa: "چرخه معمول گذشته است؛ پیام بازگشت بدون تخفیف نقطه شروع است."
  };
  if (state === "dormant") return {
    key: "offer_eligibility_review",
    labelFa: "آزمایش مشوق هدفمند",
    riskBand: "high",
    riskLabelFa: "ریسک بالا",
    incentivePolicy: "experiment_only",
    incentivePolicyFa: "فقط در پایلوت A/B",
    reasonFa: "این مشتری می‌تواند وارد آزمایش مشوق شود؛ تخفیف خارج از گروه کنترل مجاز نیست."
  };
  return {
    key: "no_action",
    labelFa: "فعلاً بدون اقدام",
    riskBand: "very_high",
    riskLabelFa: "ریسک بسیار بالا",
    incentivePolicy: "no_action",
    incentivePolicyFa: "بودجه تخصیص ندهید",
    reasonFa: "فاصله زیاد از چرخه خرید، هزینه‌کرد بدون شواهد را توجیه نمی‌کند."
  };
}

function lifecycleStates(config, snapshots) {
  const keys = ["active", "due", "lapsed", "dormant", "long_term_lost"];
  const total = snapshots.length || 1;
  return keys.map(key => {
    const count = snapshots.filter(item => item.state === key).length;
    return { key, labelFa: stateLabel(key), count, share: count / total };
  });
}

function stateLabel(state) {
  return ({
    active: "فعال",
    due: "نزدیک موعد",
    lapsed: "عبور از چرخه",
    dormant: "غیرفعال",
    long_term_lost: "ازدست‌رفته بلندمدت"
  })[state] || state;
}

function resolveCutoff(rows, supplied) {
  if (supplied && Number.isFinite(new Date(supplied).getTime())) return new Date(supplied).toISOString();
  const timestamps = rows
    .map(row => new Date(row.purchased_at).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps) + 86400000).toISOString();
}

function mappedValue(row, config, key) {
  const column = config.mapping[key];
  if (column && row[column] !== undefined && row[column] !== "") return row[column];
  if (config.defaults[key] !== undefined) return config.defaults[key];
  return "";
}

function mergeTextFields(base, input = {}, fields, maxLength) {
  const result = { ...base };
  fields.forEach(field => {
    const value = String(input?.[field] ?? "").trim();
    if (value) result[field] = value.slice(0, maxLength);
  });
  return result;
}

function mergeMapping(base, input = {}) {
  const result = { ...base };
  MAPPING_FIELDS.forEach(field => {
    if (input?.[field] === undefined) return;
    const value = String(input[field] || "").trim();
    if (value && !validColumnName(value)) throw new Error(`نام ستون ${field} معتبر نیست.`);
    result[field] = value;
  });
  return result;
}

function mappingField(key, labelFa, required, aliases) {
  return Object.freeze({ key, labelFa, required, aliases: Object.freeze(aliases) });
}

function normalizeColumnName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[\u200c\u200d]/g, "");
}

function validColumnName(value) {
  const normalized = String(value || "").trim();
  return normalized.length <= 100
    && !/[\u0000-\u001f\u007f]/.test(normalized)
    && !["__proto__", "prototype", "constructor"].includes(normalized.toLowerCase());
}

function inspectRawPrivacy(rows, columns, customerColumn) {
  const piiHeaders = columns.filter(column => DIRECT_PII_HEADERS.has(normalizeColumnName(column)));
  const exposedIdentifiers = customerColumn
    ? rows.filter(row => looksLikeDirectIdentifier(row[customerColumn])).length
    : 0;
  return {
    blocked: piiHeaders.length > 0 || exposedIdentifiers > 0,
    piiHeaders,
    exposedIdentifiers,
    statusFa: piiHeaders.length || exposedIdentifiers
      ? "داده شناسایی مستقیم پیدا شد"
      : "شناسه مستقیم پیدا نشد"
  };
}

function looksLikeDirectIdentifier(value) {
  const text = String(value || "").trim();
  return /@/.test(text) || /^(?:\+?98|0)?9\d{9}$/.test(text.replace(/[\s\-]/g, ""));
}

function mergeDefaults(base, input = {}) {
  const result = { ...base };
  DEFAULT_FIELDS.forEach(field => {
    if (input?.[field] !== undefined) result[field] = input[field];
  });
  return result;
}

function normalizeLifecycle(input) {
  const lifecycle = {
    dueWindowStartDays: boundedInteger(input.dueWindowStartDays, -60, 0, -7),
    lapsedAfterDays: boundedInteger(input.lapsedAfterDays, 1, 365, 30),
    dormantAfterDays: boundedInteger(input.dormantAfterDays, 2, 730, 90),
    lostAfterDays: boundedInteger(input.lostAfterDays, 3, 1460, 180),
    minHistoricalPurchases: boundedInteger(input.minHistoricalPurchases, 1, 20, 2),
    horizonsDays: normalizeHorizons(input.horizonsDays)
  };
  if (!(lifecycle.lapsedAfterDays < lifecycle.dormantAfterDays && lifecycle.dormantAfterDays < lifecycle.lostAfterDays)) {
    throw new Error("افق‌های ریزش باید به‌ترتیب صعودی باشند.");
  }
  return lifecycle;
}

function normalizeReadiness(input) {
  return {
    minimumHistoryDays: boundedInteger(input.minimumHistoryDays, 30, 1460, 180),
    minimumCustomers: boundedInteger(input.minimumCustomers, 10, 10000000, 500),
    minimumRepeatCustomers: boundedInteger(input.minimumRepeatCustomers, 5, 10000000, 200)
  };
}

function normalizeHorizons(values) {
  const normalized = Array.isArray(values) ? values : [30, 90, 180];
  const horizons = [...new Set(normalized.map(Number))]
    .filter(value => Number.isInteger(value) && value > 0 && value <= 1460)
    .sort((a, b) => a - b);
  return horizons.length ? horizons : [30, 90, 180];
}

function boundedInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function emptyMetrics() {
  return { units: 0, eligibleUnits: 0, medianRepurchaseDays: null, queueSize: 0, repeatCustomers: 0, coverageDays: 0 };
}

module.exports = {
  analyzeRetentionRows,
  buildRetentionWorkspace,
  getRetentionPreset,
  listRetentionPresets,
  mapRetentionRows,
  normalizeRetentionConfig,
  previewRetentionRows
};

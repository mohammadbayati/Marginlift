const crypto = require("crypto");

const { auditChannelRetentionData } = require("./channel-retention-readiness");
const { normalizeCurrencyAmount, normalizePersianText, parseIranianDate, parseIranianNumber } = require("./iran-data");

const SUCCESSFUL_STATUSES = new Set(["completed", "success", "successful", "paid"]);
const DAY_MS = 86400000;

function buildChannelRetentionDataset(rows, options = {}) {
  const cutoff = requireCutoff(options.cutoff);
  const audit = auditChannelRetentionData(rows, [], options.contract || {});
  if (audit.status === "needs_data_fix") {
    throw new Error(`داده پیش از ساخت dataset باید اصلاح شود: ${audit.nextActionFa}`);
  }

  const currencyUnit = options.currencyUnit || options.contract?.currencyUnit || "toman";
  const classified = classifyRows(rows, cutoff, { currencyUnit });
  const grouped = groupPurchases(classified.cleanRows);
  const episodes = [];
  const snapshots = [];

  for (const [unitKey, purchases] of grouped.entries()) {
    const ordered = purchases.sort((left, right) => left.purchasedAt - right.purchasedAt);
    episodes.push(...buildEpisodes(unitKey, ordered, cutoff));
    const snapshot = buildSnapshot(unitKey, ordered, cutoff, options.lifecycle || {});
    if (snapshot) snapshots.push(snapshot);
  }

  const datasetPayload = {
    cutoffAt: cutoff.toISOString(),
    cleanTransactionIds: classified.cleanRows.map(row => row.transactionId),
    episodeKeys: episodes.map(item => item.episodeKey)
  };

  return {
    datasetVersion: createVersion(datasetPayload),
    evidenceLevel: "observational_dataset",
    useCase: options.useCase || "channel_repurchase_retention",
    currencyContract: {
      sourceUnit: currencyUnit,
      canonicalUnit: "toman",
      conversionRate: currencyUnit === "rial" ? 0.1 : 1,
      policy: "explicit_versioned_no_implicit_conversion"
    },
    cutoffAt: cutoff.toISOString(),
    unitOfAnalysis: options.unitOfAnalysis || "customer_channel_product_type",
    reconciliation: {
      rawRows: rows.length,
      cleanRows: classified.cleanRows.length,
      invalidRows: classified.invalidRows.length,
      duplicateRows: classified.duplicateRows.length,
      unsuccessfulRows: classified.unsuccessfulRows.length,
      afterCutoffRows: classified.afterCutoffRows.length,
      reconciled: rows.length === classified.cleanRows.length
        + classified.invalidRows.length
        + classified.duplicateRows.length
        + classified.unsuccessfulRows.length
        + classified.afterCutoffRows.length
    },
    excluded: {
      invalid: classified.invalidRows,
      duplicates: classified.duplicateRows,
      unsuccessful: classified.unsuccessfulRows,
      afterCutoff: classified.afterCutoffRows
    },
    summary: {
      units: grouped.size,
      episodes: episodes.length,
      observedEvents: episodes.filter(item => item.eventObserved).length,
      censoredEpisodes: episodes.filter(item => !item.eventObserved).length,
      snapshots: snapshots.length,
      eligibleSnapshots: snapshots.filter(item => item.eligible).length
    },
    episodes,
    snapshots,
    caveatsFa: [
      "این dataset تاریخی است و اثر causal مداخله را اثبات نمی‌کند.",
      `عدم ثبت خرید در ${options.channelLabelFa || "کانال تنظیم‌شده"}، مدرک خرید از کانال رقیب نیست.`,
      "آستانه‌های eligibility و وضعیت پس از دریافت داده واقعی نسخه‌بندی می‌شوند."
    ]
  };
}

function classifyRows(rows, cutoff, options = {}) {
  const cleanRows = [];
  const invalidRows = [];
  const duplicateRows = [];
  const unsuccessfulRows = [];
  const afterCutoffRows = [];
  const transactionIds = new Set();

  rows.forEach((row, rowIndex) => {
    const normalized = normalizeTransaction(row, rowIndex, options);
    if (!normalized.valid) {
      invalidRows.push(excludedRow(rowIndex, normalized.transactionId, normalized.invalidReason));
      return;
    }
    if (!SUCCESSFUL_STATUSES.has(normalized.transactionStatus)) {
      unsuccessfulRows.push(excludedRow(rowIndex, normalized.transactionId, "transaction_not_successful"));
      return;
    }
    if (normalized.purchasedAt > cutoff) {
      afterCutoffRows.push(excludedRow(rowIndex, normalized.transactionId, "after_cutoff"));
      return;
    }
    if (transactionIds.has(normalized.transactionId)) {
      duplicateRows.push(excludedRow(rowIndex, normalized.transactionId, "duplicate_transaction_id"));
      return;
    }
    transactionIds.add(normalized.transactionId);
    cleanRows.push(normalized);
  });

  return { cleanRows, invalidRows, duplicateRows, unsuccessfulRows, afterCutoffRows };
}

function normalizeTransaction(row, rowIndex, options = {}) {
  const purchasedAt = parseDate(row.purchased_at);
  const currencyUnit = options.currencyUnit || "toman";
  const paidAmount = parseMoney(row.paid_amount, currencyUnit);
  const discountAmount = parseMoney(row.discount_amount, currencyUnit);
  const cashbackAmount = parseMoney(row.cashback_amount, currencyUnit);
  const validityDays = optionalPositiveNumber(row.validity_days);
  const expiresAt = parseDate(row.expires_at);
  const customerIdHash = String(row.customer_id_hash || "").trim();
  const transactionId = String(row.transaction_id || "").trim();
  const operator = normalizeToken(row.operator);
  const packageId = normalizeToken(row.package_id);
  const packageType = normalizeToken(row.package_category || row.package_id);
  const transactionStatus = normalizeToken(row.transaction_status);

  let invalidReason = "";
  if (!customerIdHash) invalidReason = "missing_customer_id_hash";
  else if (!transactionId) invalidReason = "missing_transaction_id";
  else if (!purchasedAt) invalidReason = "invalid_purchased_at";
  else if (!transactionStatus) invalidReason = "missing_transaction_status";
  else if (!operator) invalidReason = "missing_operator";
  else if (!packageId) invalidReason = "missing_package_id";
  else if (![paidAmount, discountAmount, cashbackAmount].every(value => Number.isFinite(value) && value >= 0)) {
    invalidReason = "invalid_required_financial_value";
  } else if (row.validity_days && !validityDays) invalidReason = "invalid_validity_days";
  else if (row.expires_at && !expiresAt) invalidReason = "invalid_expires_at";

  return {
    valid: !invalidReason,
    invalidReason,
    sourceRow: rowIndex + 2,
    customerIdHash,
    transactionId,
    purchasedAt,
    transactionStatus,
    operator,
    packageId,
    packageType,
    validityDays,
    expiresAt,
    paidAmount,
    netRevenue: optionalMoney(row.net_revenue, currencyUnit),
    contributionMargin: optionalMoney(row.contribution_margin, currencyUnit),
    discountAmount,
    cashbackAmount,
    campaignId: String(row.campaign_id || "").trim()
  };
}

function groupPurchases(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const unitKey = [row.customerIdHash, row.operator, row.packageType].join("|");
    if (!groups.has(unitKey)) groups.set(unitKey, []);
    groups.get(unitKey).push(row);
  });
  return groups;
}

function buildEpisodes(unitKey, purchases, cutoff) {
  return purchases.map((purchase, index) => {
    const nextPurchase = purchases[index + 1];
    const endAt = nextPurchase ? nextPurchase.purchasedAt : cutoff;
    const durationDays = Math.max(0, differenceDays(endAt, purchase.purchasedAt));
    const history = purchases.slice(0, index + 1);
    const historyGaps = purchaseGaps(history);
    const dueAt = calculateDueAt(purchase, history);
    return {
      episodeKey: createVersion({ unitKey, transactionId: purchase.transactionId, cutoff: cutoff.toISOString() }),
      unitKey,
      customerIdHash: purchase.customerIdHash,
      operator: purchase.operator,
      packageType: purchase.packageType,
      originTransactionId: purchase.transactionId,
      startedAt: purchase.purchasedAt.toISOString(),
      dueAt: dueAt.toISOString(),
      endedAt: endAt.toISOString(),
      durationDays,
      daysFromDueToEnd: differenceDays(endAt, dueAt),
      eventObserved: Boolean(nextPurchase),
      censoringReason: nextPurchase ? null : "administrative_cutoff",
      features: {
        purchaseCountToDate: history.length,
        previousGapDays: historyGaps.length ? historyGaps[historyGaps.length - 1] : null,
        averageGapDaysToDate: historyGaps.length ? round(mean(historyGaps)) : null,
        gapStdDevDaysToDate: historyGaps.length ? round(stddev(historyGaps)) : null,
        expectedCycleDays: expectedCycleDays(history),
        originValidityDays: purchase.validityDays,
        originPaidAmount: purchase.paidAmount,
        originContributionMargin: purchase.contributionMargin ?? purchase.netRevenue,
        originDiscountAmount: purchase.discountAmount,
        originCashbackAmount: purchase.cashbackAmount,
        discountUsed: purchase.discountAmount + purchase.cashbackAmount > 0 ? 1 : 0
      }
    };
  });
}

function buildSnapshot(unitKey, purchases, cutoff, lifecycle = {}) {
  if (!purchases.length) return null;
  const gaps = [];
  for (let index = 1; index < purchases.length; index += 1) {
    gaps.push(differenceDays(purchases[index].purchasedAt, purchases[index - 1].purchasedAt));
  }
  const latest = purchases[purchases.length - 1];
  const dueAt = calculateDueAt(latest, purchases);
  const daysFromDue = differenceDays(cutoff, dueAt);
  const reactivated = hasHistoricalReactivation(purchases);
  const contributionValues = purchases
    .map(row => row.contributionMargin ?? row.netRevenue)
    .filter(Number.isFinite);

  return {
    snapshotKey: createVersion({ unitKey, cutoff: cutoff.toISOString() }),
    unitKey,
    customerIdHash: latest.customerIdHash,
    operator: latest.operator,
    packageType: latest.packageType,
    indexDate: cutoff.toISOString(),
    purchaseCount: purchases.length,
    recencyDays: differenceDays(cutoff, latest.purchasedAt),
    averageGapDays: round(mean(gaps)),
    gapStdDevDays: round(stddev(gaps)),
    expectedCycleDays: expectedCycleDays(purchases),
    latestValidityDays: latest.validityDays,
    dueAt: dueAt.toISOString(),
    daysFromDue,
    state: classifyState(daysFromDue, lifecycle),
    previouslyReactivated: reactivated,
    averagePaidAmount: round(mean(purchases.map(row => row.paidAmount))),
    averageContributionMargin: contributionValues.length ? round(mean(contributionValues)) : null,
    discountPurchaseShare: round(purchases.filter(row => row.discountAmount + row.cashbackAmount > 0).length / purchases.length, 4),
    eligible: purchases.length >= Number(lifecycle.minHistoricalPurchases || 2),
    ineligibilityReason: purchases.length >= Number(lifecycle.minHistoricalPurchases || 2)
      ? null
      : "insufficient_historical_purchases"
  };
}

function calculateDueAt(purchase, purchaseHistory) {
  if (purchase.expiresAt && purchase.expiresAt > purchase.purchasedAt) return purchase.expiresAt;
  const cycleDays = purchase.validityDays || expectedCycleDays(purchaseHistory);
  return new Date(purchase.purchasedAt.getTime() + cycleDays * DAY_MS);
}

function expectedCycleDays(purchases) {
  const gaps = purchaseGaps(purchases);
  const positiveGaps = gaps.filter(value => value > 0);
  if (positiveGaps.length) return Math.max(1, Math.round(median(positiveGaps)));
  const latest = purchases[purchases.length - 1];
  return latest?.validityDays || 30;
}

function purchaseGaps(purchases) {
  const gaps = [];
  for (let index = 1; index < purchases.length; index += 1) {
    gaps.push(differenceDays(purchases[index].purchasedAt, purchases[index - 1].purchasedAt));
  }
  return gaps;
}

function classifyState(daysFromDue, lifecycle = {}) {
  const dueWindowStartDays = Number(lifecycle.dueWindowStartDays ?? -7);
  const lapsedAfterDays = Number(lifecycle.lapsedAfterDays ?? 30);
  const dormantAfterDays = Number(lifecycle.dormantAfterDays ?? 90);
  const lostAfterDays = Number(lifecycle.lostAfterDays ?? 180);
  if (daysFromDue < dueWindowStartDays) return "active";
  if (daysFromDue < lapsedAfterDays) return "due";
  if (daysFromDue < dormantAfterDays) return "lapsed";
  if (daysFromDue < lostAfterDays) return "dormant";
  return "long_term_lost";
}

function hasHistoricalReactivation(purchases) {
  for (let index = 1; index < purchases.length; index += 1) {
    const previous = purchases[index - 1];
    const priorHistory = purchases.slice(0, index);
    const expectedDays = previous.validityDays || expectedCycleDays(priorHistory);
    const actualGapDays = differenceDays(purchases[index].purchasedAt, previous.purchasedAt);
    if (actualGapDays - expectedDays >= 30) return true;
  }
  return false;
}

function requireCutoff(value) {
  const cutoff = parseDate(value);
  if (!cutoff) throw new Error("cutoff معتبر و صریح برای ساخت dataset لازم است.");
  return cutoff;
}

function parseDate(value) {
  return parseIranianDate(value);
}

function parseNumber(value) {
  return parseIranianNumber(value);
}

function optionalNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = parseIranianNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalPositiveNumber(value) {
  const parsed = optionalNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseMoney(value, sourceUnit) {
  const result = normalizeCurrencyAmount(value, sourceUnit, "toman");
  return result.value === null ? Number.NaN : result.value;
}

function optionalMoney(value, sourceUnit) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return normalizeCurrencyAmount(value, sourceUnit, "toman").value;
}

function normalizeToken(value) {
  return normalizePersianText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function differenceDays(later, earlier) {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function stddev(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = mean(values.map(value => (value - average) ** 2));
  return Math.sqrt(variance);
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function excludedRow(rowIndex, transactionId, reason) {
  return { sourceRow: rowIndex + 2, transactionId, reason };
}

function createVersion(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

module.exports = { buildChannelRetentionDataset, classifyState };

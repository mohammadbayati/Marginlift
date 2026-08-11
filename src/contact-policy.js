const DEFAULT_CONTACT_POLICY = Object.freeze({
  maxContacts30d: 3,
  allowedChannels: Object.freeze(["push", "sms", "email", "whatsapp", "in_app"])
});

const CONSENT_GRANTED = new Set(["granted", "active", "consented", "opted_in", "yes", "true", "1"]);
const CONSENT_DENIED = new Set(["denied", "revoked", "withdrawn", "opted_out", "no", "false", "0"]);
const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off"]);

function buildContactProfiles(rows = []) {
  const profiles = new Map();
  [...rows]
    .sort((left, right) => timestamp(left.purchased_at) - timestamp(right.purchased_at))
    .forEach(row => {
      const customerIdHash = clean(row.customer_id_hash);
      if (!customerIdHash) return;
      profiles.set(customerIdHash, {
        customerIdHash,
        consentStatus: clean(row.consent_status),
        preferredChannel: normalizeToken(row.preferred_channel),
        doNotContact: clean(row.do_not_contact),
        contactCount30d: clean(row.contact_count_30d),
        lastContactAt: clean(row.last_contact_at)
      });
    });
  return profiles;
}

function evaluateContactPermission(profile = {}, policyInput = {}) {
  const policy = normalizePolicy(policyInput);
  const consent = normalizeToken(profile.consentStatus);
  const preferredChannel = normalizeToken(profile.preferredChannel);
  const doNotContact = parseBoolean(profile.doNotContact);
  const contactCount30d = parseNonNegativeInteger(profile.contactCount30d);
  const reasons = [];

  if (!consent) reasons.push(reason("consent_missing", "وضعیت رضایت ثبت نشده است."));
  else if (!CONSENT_GRANTED.has(consent)) {
    reasons.push(reason(CONSENT_DENIED.has(consent) ? "consent_denied" : "consent_invalid", "رضایت معتبر برای تماس وجود ندارد."));
  }

  if (doNotContact === null) reasons.push(reason("opt_out_missing", "وضعیت عدم تماس ثبت نشده است."));
  else if (doNotContact) reasons.push(reason("do_not_contact", "مشتری درخواست عدم تماس داده است."));

  if (!preferredChannel) reasons.push(reason("channel_missing", "کانال ترجیحی مشتری ثبت نشده است."));
  else if (!policy.allowedChannels.includes(preferredChannel)) reasons.push(reason("channel_invalid", "کانال ترجیحی در فهرست کانال‌های مجاز نیست."));

  if (contactCount30d === null) reasons.push(reason("contact_count_missing", "تعداد تماس ۳۰ روز گذشته ثبت نشده است."));
  else if (contactCount30d >= policy.maxContacts30d) reasons.push(reason("frequency_cap_reached", `سقف ${policy.maxContacts30d} تماس در ۳۰ روز پر شده است.`));

  const allowed = reasons.length === 0;
  return {
    allowed,
    status: allowed ? "allowed" : "blocked",
    statusFa: allowed ? "مجاز برای اقدام کنترل‌شده" : "غیرمجاز برای تماس",
    preferredChannel: preferredChannel || null,
    contactCount30d,
    maxContacts30d: policy.maxContacts30d,
    lastContactAt: validDate(profile.lastContactAt),
    reasons,
    contract: {
      consentRecorded: Boolean(consent && (CONSENT_GRANTED.has(consent) || CONSENT_DENIED.has(consent))),
      optOutRecorded: doNotContact !== null,
      channelRecorded: Boolean(preferredChannel && policy.allowedChannels.includes(preferredChannel)),
      contactCountRecorded: contactCount30d !== null
    }
  };
}

function applyContactPolicy(queue = [], rows = [], policyInput = {}) {
  const profiles = buildContactProfiles(rows);
  return queue.map(item => {
    const permission = evaluateContactPermission(profiles.get(item.customerIdHash), policyInput);
    const policyAllowsAction = item.recommendedAction !== "no_action";
    return {
      ...item,
      actionAllowed: permission.allowed && policyAllowsAction,
      actionPermissionFa: permission.allowed && policyAllowsAction ? "مجاز" : "مسدود",
      contactSafety: permission,
      decisionReasonFa: permission.allowed
        ? item.decisionReasonFa
        : `${item.decisionReasonFa} تماس مسدود است: ${permission.reasons.map(item => item.labelFa).join("، ")}`
    };
  });
}

function buildContactSafetyWorkspace(queue = [], policyInput = {}) {
  const policy = normalizePolicy(policyInput);
  const permissions = queue.map(item => item.contactSafety || evaluateContactPermission({}, policy));
  const contractCoverage = {
    consent: countContract(permissions, "consentRecorded"),
    optOut: countContract(permissions, "optOutRecorded"),
    channel: countContract(permissions, "channelRecorded"),
    contactCount: countContract(permissions, "contactCountRecorded")
  };
  const contractReady = queue.length > 0 && Object.values(contractCoverage).every(count => count === queue.length);
  const reasonCounts = countReasons(permissions);
  const allowed = queue.filter(item => item.actionAllowed).length;

  return {
    version: "contact_policy_v1",
    enforcement: "server_side_fail_closed",
    liveActivationEnabled: false,
    contractReady,
    status: !queue.length ? "awaiting_data" : contractReady ? "enforced" : "needs_data",
    statusFa: !queue.length ? "در انتظار داده" : contractReady ? "کنترل تماس فعال است" : "قرارداد تماس ناقص است",
    policy,
    summary: {
      decisionRows: queue.length,
      actionAllowed: allowed,
      blocked: queue.length - allowed,
      blockedByOptOut: reasonCounts.do_not_contact || 0,
      blockedByFrequencyCap: reasonCounts.frequency_cap_reached || 0,
      blockedByMissingData: permissions.filter(item => item.reasons.some(reason => reason.code.endsWith("_missing"))).length
    },
    checks: [
      check("consent", "رضایت معتبر", contractCoverage.consent === queue.length && queue.length > 0, contractCoverage.consent, queue.length),
      check("opt_out", "حق انصراف و عدم تماس", contractCoverage.optOut === queue.length && queue.length > 0, contractCoverage.optOut, queue.length),
      check("preferred_channel", "کانال ترجیحی مجاز", contractCoverage.channel === queue.length && queue.length > 0, contractCoverage.channel, queue.length),
      check("frequency_cap", `سقف ${policy.maxContacts30d} تماس در ۳۰ روز`, contractCoverage.contactCount === queue.length && queue.length > 0, contractCoverage.contactCount, queue.length)
    ],
    nextActionFa: !queue.length
      ? "ابتدا داده نگهداشت را وارد کنید."
      : contractReady
        ? `${allowed} مشتری از دروازه ایمنی عبور کرده‌اند؛ اجرای زنده همچنان تا ثبت آزمایش و تأیید انسانی بسته است.`
        : "ستون‌های رضایت، عدم تماس، کانال ترجیحی و تعداد تماس ۳۰ روزه را تکمیل و داده را دوباره تحلیل کنید."
  };
}

function normalizePolicy(input = {}) {
  const maxContacts30d = Number.isInteger(Number(input.maxContacts30d)) && Number(input.maxContacts30d) > 0
    ? Number(input.maxContacts30d)
    : DEFAULT_CONTACT_POLICY.maxContacts30d;
  const allowedChannels = Array.isArray(input.allowedChannels) && input.allowedChannels.length
    ? [...new Set(input.allowedChannels.map(normalizeToken).filter(Boolean))]
    : [...DEFAULT_CONTACT_POLICY.allowedChannels];
  return { maxContacts30d, allowedChannels };
}

function countContract(permissions, key) {
  return permissions.filter(item => item.contract[key]).length;
}

function countReasons(permissions) {
  return permissions.flatMap(item => item.reasons).reduce((counts, item) => {
    counts[item.code] = (counts[item.code] || 0) + 1;
    return counts;
  }, {});
}

function check(key, labelFa, passed, covered, total) {
  return {
    key,
    labelFa,
    status: passed ? "pass" : "blocked",
    covered,
    total,
    detailFa: passed ? `برای هر ${total} ردیف تصمیم ثبت و در سمت سرور enforce می‌شود.` : `فقط ${covered} از ${total} ردیف قرارداد کامل دارد.`
  };
}

function reason(code, labelFa) {
  return { code, labelFa };
}

function parseBoolean(value) {
  const token = normalizeToken(value);
  if (!token) return null;
  if (TRUE_VALUES.has(token)) return true;
  if (FALSE_VALUES.has(token)) return false;
  return null;
}

function parseNonNegativeInteger(value) {
  if (value === undefined || value === null || clean(value) === "") return null;
  const parsed = Number(normalizeDigits(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function timestamp(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDigits(value) {
  return String(value)
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function normalizeToken(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function clean(value) {
  return String(value ?? "").trim();
}

module.exports = {
  DEFAULT_CONTACT_POLICY,
  applyContactPolicy,
  buildContactProfiles,
  buildContactSafetyWorkspace,
  evaluateContactPermission,
  normalizePolicy
};

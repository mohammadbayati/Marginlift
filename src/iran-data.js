const TEHRAN_OFFSET = "+03:30";

function normalizeIranianDigits(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[٬,\s]/g, "")
    .replace(/٫/g, ".")
    .trim();
}

function normalizePersianText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200d]+/g, "‌")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIranianColumn(value) {
  return normalizePersianText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function parseIranianNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") return Number.NaN;
  const parsed = Number(normalizeIranianDigits(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeCurrencyAmount(value, sourceUnit = "toman", targetUnit = "toman") {
  const amount = parseIranianNumber(value);
  if (!Number.isFinite(amount)) return { value: null, sourceUnit, targetUnit, conversionRate: null, exact: false };
  if (![sourceUnit, targetUnit].every(unit => ["rial", "toman"].includes(unit))) {
    throw new Error("واحد پول باید rial یا toman باشد.");
  }
  const conversionRate = sourceUnit === targetUnit ? 1 : sourceUnit === "rial" ? 0.1 : 10;
  const normalized = amount * conversionRate;
  return {
    value: normalized,
    sourceUnit,
    targetUnit,
    conversionRate,
    exact: Number.isSafeInteger(normalized)
  };
}

function parseIranianDate(value, options = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\//g, "-");
  const parts = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (parts) {
    let year = Number(parts[1]);
    let month = Number(parts[2]);
    let day = Number(parts[3]);
    const calendar = options.calendar || (year >= 1200 && year <= 1600 ? "jalali" : "gregorian");
    if (calendar === "jalali") ({ gy: year, gm: month, gd: day } = toGregorian(year, month, day));
    if (!validGregorianDate(year, month, day)) return null;
    const hour = parts[4] || "00";
    const minute = parts[5] || "00";
    const second = parts[6] || "00";
    const date = new Date(`${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${options.timezoneOffset || TEHRAN_OFFSET}`);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toGregorian(jy, jm, jd) {
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd) || jm < 1 || jm > 12 || jd < 1 || jd > (jm <= 6 ? 31 : jm <= 11 ? 30 : 30)) {
    throw new Error("تاریخ جلالی معتبر نیست.");
  }
  return d2g(j2d(jy, jm, jd));
}

function jalCal(jy) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;
  if (jy < jp || jy >= breaks[breaks.length - 1]) throw new Error("سال جلالی خارج از بازه پشتیبانی است.");
  for (let index = 1; index < breaks.length; index += 1) {
    const current = breaks[index];
    jump = current - jp;
    if (jy < current) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = current;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function j2d(jy, jm, jd) {
  const result = jalCal(jy);
  return g2d(result.gy, 3, result.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function g2d(gy, gm, gd) {
  let value = div((gy + div(gm - 8, 6) + 100100) * 1461, 4);
  value += div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  value -= div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) - 752;
  return value;
}

function d2g(jdn) {
  let value = 4 * jdn + 139361631;
  value += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const intermediate = div(mod(value, 1461), 4) * 5 + 308;
  const gd = div(mod(intermediate, 153), 5) + 1;
  const gm = mod(div(intermediate, 153), 12) + 1;
  const gy = div(value, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function validGregorianDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function div(a, b) { return Math.trunc(a / b); }
function mod(a, b) { return a - Math.trunc(a / b) * b; }
function pad(value, size = 2) { return String(value).padStart(size, "0"); }

module.exports = {
  TEHRAN_OFFSET,
  normalizeCurrencyAmount,
  normalizeIranianColumn,
  normalizeIranianDigits,
  normalizePersianText,
  parseIranianDate,
  parseIranianNumber,
  toGregorian
};

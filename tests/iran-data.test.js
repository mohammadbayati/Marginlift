const assert = require("assert");

const {
  normalizeCurrencyAmount,
  normalizeIranianColumn,
  normalizePersianText,
  parseIranianDate,
  parseIranianNumber,
  toGregorian
} = require("../src/iran-data");

assert.strictEqual(parseIranianNumber("۱٬۲۳۴٫۵"), 1234.5);
assert.strictEqual(normalizePersianText("  كسب و كار ي  "), "کسب و کار ی");
assert.strictEqual(normalizeIranianColumn("شناسه‌ مشتری"), "شناسه‌_مشتری");
assert.deepStrictEqual(toGregorian(1404, 1, 1), { gy: 2025, gm: 3, gd: 21 });
assert.strictEqual(parseIranianDate("۱۴۰۴/۰۱/۰۱").toISOString(), "2025-03-20T20:30:00.000Z");
assert.strictEqual(parseIranianDate("2025-03-21T00:00:00Z").toISOString(), "2025-03-21T00:00:00.000Z");
assert.strictEqual(normalizeCurrencyAmount("۱۰۰٬۰۰۰", "rial", "toman").value, 10000);
assert.strictEqual(normalizeCurrencyAmount("۱۰٬۰۰۰", "toman", "rial").value, 100000);
assert.throws(() => normalizeCurrencyAmount("100", "usd", "toman"), /rial یا toman/);

console.log("iran-data.test.js passed");

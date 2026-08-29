const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("sales.html", "utf8");
assert(html.includes("Know which CRM actions create incremental value."));
assert(html.includes("Assess pilot readiness"));
assert(html.includes("Paid diagnostic"));
assert(html.includes("Buyer Evidence Package"));
assert(html.includes("SYNTHETIC EXAMPLE"));
assert(html.includes("/pilot-data-request.html"));
assert(html.includes("canonical"));
assert(html.includes("og:title"));
assert(!html.includes("DigiPay"));
assert(!html.includes("MilliGold"));
assert(!/guaranteed\s+(uplift|profit|ROI)/i.test(html));
assert(!html.includes("572"));
assert(fs.existsSync("sales-v5.css"));
console.log("Website commercialization tests passed.");

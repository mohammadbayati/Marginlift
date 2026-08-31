import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../src/entries/route-config.ts", import.meta.url), "utf8");
for (const route of ["/app/today", "/app/data", "/app/decisions", "/app/pilot", "/app/evidence", "/app/settings", "/app/report"]) {
  assert.ok(config.includes(`\"${route}\"`), `missing route ${route}`);
}
const css = await Promise.all([
  readFile(new URL("../src/shared/styles/global.css", import.meta.url), "utf8"),
  readFile(new URL("../src/public/styles/public.css", import.meta.url), "utf8"),
]);
assert.ok(!/linear-gradient|radial-gradient|backdrop-filter/i.test(css.join("\n")), "forbidden decorative effect");
console.log("route-manifest.test.mjs passed");

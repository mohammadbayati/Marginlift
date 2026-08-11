const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { inspectTypography, installTypographyAsset, renderTypographyCss, validateWoff2 } = require("../src/typography");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "marginlift-font-test-"));
const licensePath = path.join(root, "license.txt");
fs.writeFileSync(licensePath, "Test-only license fixture confirming web embedding for the bundled open font.", "utf8");

try {
  const fallback = inspectTypography(path.join(root, "missing"));
  assert.strictEqual(fallback.ready, false);
  assert.match(renderTypographyCss(fallback), /Vazirmatn-Variable\.woff2/);

  const sourceFont = path.join(__dirname, "..", "fonts", "Vazirmatn-Variable.woff2");
  assert.strictEqual(validateWoff2(fs.readFileSync(sourceFont)), true);
  const installed = installTypographyAsset({
    sourceFont,
    sourceLicense: licensePath,
    destinationDir: path.join(root, "private-fonts"),
    licenseHolder: "MarginLift test fixture",
    licenseReference: "TEST-ONLY",
    confirmWebEmbedding: true
  });
  assert.strictEqual(installed.status.ready, true);
  assert.strictEqual(installed.status.activeFamily, "IRANSansX");
  assert.match(renderTypographyCss(installed.status), /IRANSansX-Variable\.woff2/);

  const metadataPath = path.join(root, "private-fonts", "IRANSansX-license.json");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  metadata.fontSha256 = "tampered";
  fs.writeFileSync(metadataPath, JSON.stringify(metadata), "utf8");
  assert.strictEqual(inspectTypography(path.join(root, "private-fonts")).reason, "license_metadata_invalid");
  assert.throws(() => validateWoff2(Buffer.from("not-a-font")), /WOFF2/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("typography.test.js passed");

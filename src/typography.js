const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FONT_FILENAME = "IRANSansX-Variable.woff2";
const LICENSE_FILENAME = "IRANSansX-LICENSE.txt";
const METADATA_FILENAME = "IRANSansX-license.json";

function inspectTypography(fontDir) {
  const paths = typographyPaths(fontDir);
  const result = {
    activeFamily: "Vazirmatn",
    ready: false,
    licensed: false,
    webEmbeddingConfirmed: false,
    fontSha256: null,
    reason: "licensed_font_missing"
  };

  if (!fs.existsSync(paths.font)) return result;
  let fontBuffer;
  try {
    fontBuffer = fs.readFileSync(paths.font);
    validateWoff2(fontBuffer);
  } catch (error) {
    return { ...result, reason: "invalid_woff2" };
  }
  const fontSha256 = sha256(fontBuffer);
  if (!fs.existsSync(paths.license) || fs.statSync(paths.license).size < 40) {
    return { ...result, fontSha256, reason: "license_text_missing" };
  }

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(paths.metadata, "utf8"));
  } catch (error) {
    return { ...result, fontSha256, reason: "license_metadata_missing" };
  }
  const licenseSha256 = sha256(fs.readFileSync(paths.license));
  const metadataValid = metadata.fontSha256 === fontSha256
    && metadata.licenseSha256 === licenseSha256
    && metadata.webEmbeddingConfirmed === true
    && Boolean(String(metadata.licenseHolder || "").trim())
    && Boolean(String(metadata.licenseReference || "").trim());
  if (!metadataValid) return { ...result, fontSha256, reason: "license_metadata_invalid" };

  return {
    activeFamily: "IRANSansX",
    ready: true,
    licensed: true,
    webEmbeddingConfirmed: true,
    fontSha256,
    reason: "licensed_font_ready"
  };
}

function renderTypographyCss(status) {
  const licensed = status?.ready === true;
  const primaryUrl = licensed ? "/fonts/IRANSansX-Variable.woff2" : "/fonts/Vazirmatn-Variable.woff2";
  const activeFamily = licensed ? "IRANSansX" : "Vazirmatn";
  return `/* marginlift-font:${activeFamily.toLowerCase()} */
@font-face {
  font-family: "MarginLift Persian";
  src: url("${primaryUrl}") format("woff2");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: "MarginLift Numerals";
  src: url("/fonts/Vazirmatn-Variable.woff2") format("woff2");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
:root {
  --font-primary: "MarginLift Persian", Tahoma, sans-serif;
  --font-numerals: "MarginLift Numerals", "MarginLift Persian", Tahoma, sans-serif;
}
`;
}

function installTypographyAsset(options) {
  if (!options?.confirmWebEmbedding) throw new Error("مجوز Web Embedding باید صریحاً تأیید شود.");
  const licenseHolder = String(options.licenseHolder || "").trim();
  const licenseReference = String(options.licenseReference || "").trim();
  if (!licenseHolder) throw new Error("نام دارنده مجوز الزامی است.");
  if (!licenseReference) throw new Error("شناسه خرید یا مرجع مجوز الزامی است.");

  const sourceFont = path.resolve(options.sourceFont);
  const sourceLicense = path.resolve(options.sourceLicense);
  const destinationDir = path.resolve(options.destinationDir);
  const fontBuffer = fs.readFileSync(sourceFont);
  validateWoff2(fontBuffer);
  const licenseBuffer = fs.readFileSync(sourceLicense);
  if (licenseBuffer.length < 40) throw new Error("متن مجوز معتبر یا کامل نیست.");

  fs.mkdirSync(destinationDir, { recursive: true });
  const paths = typographyPaths(destinationDir);
  fs.copyFileSync(sourceFont, paths.font);
  fs.copyFileSync(sourceLicense, paths.license);
  const metadata = {
    family: "IRANSansX",
    originalFilename: path.basename(sourceFont),
    licenseHolder,
    licenseReference,
    webEmbeddingConfirmed: true,
    fontSha256: sha256(fontBuffer),
    licenseSha256: sha256(licenseBuffer),
    installedAt: new Date().toISOString()
  };
  fs.writeFileSync(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return { destinationDir, metadata, status: inspectTypography(destinationDir) };
}

function validateWoff2(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 48) throw new Error("فایل WOFF2 معتبر نیست.");
  if (buffer.subarray(0, 4).toString("ascii") !== "wOF2") throw new Error("امضای فایل WOFF2 معتبر نیست.");
  const declaredLength = buffer.readUInt32BE(8);
  if (declaredLength !== buffer.length) throw new Error("طول ثبت‌شده WOFF2 با فایل مطابقت ندارد.");
  const numTables = buffer.readUInt16BE(12);
  if (numTables < 1) throw new Error("جدول فونت WOFF2 پیدا نشد.");
  return true;
}

function typographyPaths(fontDir) {
  const root = path.resolve(fontDir);
  return {
    font: path.join(root, FONT_FILENAME),
    license: path.join(root, LICENSE_FILENAME),
    metadata: path.join(root, METADATA_FILENAME)
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
  FONT_FILENAME,
  LICENSE_FILENAME,
  METADATA_FILENAME,
  inspectTypography,
  installTypographyAsset,
  renderTypographyCss,
  typographyPaths,
  validateWoff2
};

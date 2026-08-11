const path = require("path");

const { installTypographyAsset } = require("../src/typography");

function option(name) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : "";
}

function main() {
  const sourceFont = process.argv.slice(2).find(value => !value.startsWith("--"));
  const sourceLicense = option("license");
  if (!sourceFont || !sourceLicense) {
    throw new Error("مسیر WOFF2 و گزینه --license=<path> الزامی است.");
  }
  const result = installTypographyAsset({
    sourceFont,
    sourceLicense,
    destinationDir: path.join(__dirname, "..", "private", "fonts"),
    licenseHolder: option("license-holder"),
    licenseReference: option("license-reference"),
    confirmWebEmbedding: process.argv.includes("--confirm-web-embedding")
  });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    destinationDir: result.destinationDir,
    licenseHolder: result.metadata.licenseHolder,
    licenseReference: result.metadata.licenseReference
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(`نصب IRANSansX انجام نشد: ${error.message}`);
  process.exitCode = 1;
}

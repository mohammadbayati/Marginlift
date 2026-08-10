const fs = require("fs");
const path = require("path");

const { buildChannelRetentionDataset } = require("../src/channel-retention-dataset");
const { parseCSV } = require("../src/csv");

function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find(value => !value.startsWith("--") && value !== valueAfter(args, "--cutoff") && value !== valueAfter(args, "--output"));
  const cutoff = valueAfter(args, "--cutoff");
  const outputArg = valueAfter(args, "--output");
  if (!fileArg) throw new Error("مسیر CSV تراکنش را وارد کنید.");
  if (!cutoff) throw new Error("پارامتر --cutoff اجباری است؛ مانند 2026-02-01T00:00:00Z.");

  const filePath = path.resolve(process.cwd(), fileArg);
  const rows = parseCSV(fs.readFileSync(filePath, "utf8"));
  const dataset = buildChannelRetentionDataset(rows, { cutoff });
  const output = `${JSON.stringify(dataset, null, 2)}\n`;

  if (outputArg) {
    const outputPath = path.resolve(process.cwd(), outputArg);
    fs.writeFileSync(outputPath, output, "utf8");
    process.stdout.write(`Dataset ساخته شد: ${outputPath}\n`);
    process.stdout.write(`نسخه: ${dataset.datasetVersion} | snapshot: ${dataset.summary.snapshots} | episode: ${dataset.summary.episodes}\n`);
    return;
  }

  process.stdout.write(output);
}

function valueAfter(args, key) {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : undefined;
}

try {
  main();
} catch (error) {
  console.error(`ساخت dataset انجام نشد: ${error.message}`);
  process.exitCode = 1;
}


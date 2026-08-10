const fs = require("fs");
const path = require("path");

const { buildSurvivalBaseline } = require("../src/survival-baseline");

function main() {
  const args = process.argv.slice(2);
  const outputArg = valueAfter(args, "--output");
  const groupSizeArg = valueAfter(args, "--min-group-size");
  const datasetArg = args.find(value => !value.startsWith("--") && value !== outputArg && value !== groupSizeArg);
  if (!datasetArg) throw new Error("مسیر dataset JSON را وارد کنید.");

  const datasetPath = path.resolve(process.cwd(), datasetArg);
  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  const minimumGroupEpisodes = groupSizeArg === undefined ? 30 : Number(groupSizeArg);
  if (!Number.isFinite(minimumGroupEpisodes) || minimumGroupEpisodes < 1) {
    throw new Error("--min-group-size باید عدد مثبت باشد.");
  }
  const baseline = buildSurvivalBaseline(dataset, { minimumGroupEpisodes });
  const output = `${JSON.stringify(baseline, null, 2)}\n`;

  if (outputArg) {
    const outputPath = path.resolve(process.cwd(), outputArg);
    fs.writeFileSync(outputPath, output, "utf8");
    process.stdout.write(`Survival baseline ساخته شد: ${outputPath}\n`);
    process.stdout.write(`نسخه: ${baseline.baselineVersion} | episode: ${baseline.diagnostics.episodeCount}\n`);
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
  console.error(`ساخت baseline انجام نشد: ${error.message}`);
  process.exitCode = 1;
}


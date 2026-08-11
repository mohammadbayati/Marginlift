const fs = require("fs");
const path = require("path");

const { parseCSV } = require("../src/csv");
const { evaluateUsabilitySessions, renderUsabilityEvaluation } = require("../src/usability-evaluation");

function main() {
  const fileArg = process.argv.slice(2).find(value => !value.startsWith("--")) || "docs/usability-test-scorecard.csv";
  const jsonOutput = process.argv.includes("--json");
  const filePath = path.resolve(process.cwd(), fileArg);
  const rows = parseCSV(fs.readFileSync(filePath, "utf8"));
  const result = evaluateUsabilitySessions(rows);
  process.stdout.write(jsonOutput ? `${JSON.stringify(result, null, 2)}\n` : renderUsabilityEvaluation(result));
  if (result.status !== "pass") process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(`ارزیابی تست کاربری انجام نشد: ${error.message}`);
  process.exitCode = 1;
}

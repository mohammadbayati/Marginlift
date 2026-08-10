const fs = require("fs");
const path = require("path");

const { auditChannelRetentionData } = require("../src/channel-retention-readiness");
const { parseCSV } = require("../src/csv");

function main() {
  const args = process.argv.slice(2);
  const transactionArg = args.find(value => !value.startsWith("--") && value !== valueAfter(args, "--interventions"));
  const interventionArg = valueAfter(args, "--interventions");
  const jsonOutput = args.includes("--json");

  if (!transactionArg) {
    throw new Error("مسیر CSV تراکنش بسته را وارد کنید.");
  }

  const transactionPath = path.resolve(process.cwd(), transactionArg);
  const transactionRows = readRows(transactionPath);
  const interventionRows = interventionArg
    ? readRows(path.resolve(process.cwd(), interventionArg))
    : [];
  const audit = auditChannelRetentionData(transactionRows, interventionRows);

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  } else {
    process.stdout.write(renderMarkdown(path.basename(transactionPath), interventionArg, audit));
  }

  if (audit.status === "needs_data_fix") process.exitCode = 2;
}

function valueAfter(args, key) {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : undefined;
}

function readRows(filePath) {
  return parseCSV(fs.readFileSync(filePath, "utf8"));
}

function renderMarkdown(transactionFile, interventionFile, audit) {
  const checkRows = audit.checks
    .map(item => `| ${item.labelFa} | ${item.passed ? "پاس" : "نیازمند بررسی"} | ${item.detailFa} |`)
    .join("\n");
  const warnings = audit.warnings.map(item => `- ${item}`).join("\n");
  return `# ممیزی Channel Retention\n\n- فایل تراکنش: ${transactionFile}\n- فایل مداخله: ${interventionFile || "ارائه نشده"}\n- وضعیت: ${audit.statusFa}\n- تصمیم: ${audit.decision}\n- امتیاز: ${audit.score}٪\n- مشتری یکتا: ${audit.summary.uniqueCustomers}\n- مشتری تکرارشونده: ${audit.summary.repeatCustomers}\n- پوشش تاریخی: ${audit.summary.coverageDays} روز\n\n| کنترل | نتیجه | توضیح |\n| --- | --- | --- |\n${checkRows}\n\n## هشدارها\n\n${warnings}\n\n## قدم بعدی\n\n${audit.nextActionFa}\n`;
}

try {
  main();
} catch (error) {
  console.error(`ممیزی انجام نشد: ${error.message}`);
  process.exitCode = 1;
}


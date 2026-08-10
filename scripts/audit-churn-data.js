const fs = require("fs");
const path = require("path");

const { auditChurnEventRows } = require("../src/churn-readiness");
const { parseCSV } = require("../src/csv");

function main() {
  const fileArg = process.argv.slice(2).find(value => !value.startsWith("--"));
  const jsonOutput = process.argv.includes("--json");
  if (!fileArg) throw new Error("مسیر فایل CSV را وارد کنید.");

  const filePath = path.resolve(process.cwd(), fileArg);
  const rows = parseCSV(fs.readFileSync(filePath, "utf8"));
  const audit = auditChurnEventRows(rows);

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  } else {
    process.stdout.write(renderMarkdown(path.basename(filePath), audit));
  }

  if (audit.status === "needs_data_fix") process.exitCode = 2;
}

function renderMarkdown(filename, audit) {
  const checkRows = audit.checks
    .map(item => `| ${item.labelFa} | ${item.passed ? "پاس" : "نیازمند بررسی"} | ${item.detailFa} |`)
    .join("\n");
  const warnings = audit.warnings.length ? audit.warnings.map(item => `- ${item}`).join("\n") : "- هشدار اضافه‌ای ثبت نشد.";
  return `# ممیزی آمادگی Churn\n\n- فایل: ${filename}\n- وضعیت: ${audit.statusFa}\n- امتیاز: ${audit.score}٪\n- مشتری یکتا: ${audit.summary.uniqueCustomers}\n- پوشش تاریخی: ${audit.summary.coverageDays} روز\n\n| کنترل | نتیجه | توضیح |\n| --- | --- | --- |\n${checkRows}\n\n## هشدارها\n\n${warnings}\n\n## قدم بعدی\n\n${audit.nextActionFa}\n`;
}

try {
  main();
} catch (error) {
  console.error(`ممیزی انجام نشد: ${error.message}`);
  process.exitCode = 1;
}

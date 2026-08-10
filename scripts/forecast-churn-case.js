const fs = require("fs");
const path = require("path");

const { buildChurnValueCase } = require("../src/churn-value-case");

try {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("مسیر فایل JSON سناریو را وارد کنید.");
  const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
  const forecast = buildChurnValueCase(input);
  process.stdout.write(`${JSON.stringify(forecast, null, 2)}\n`);
} catch (error) {
  console.error(`Forecast ساخته نشد: ${error.message}`);
  process.exitCode = 1;
}

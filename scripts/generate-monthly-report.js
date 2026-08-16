// Monthly savings & revenue-share report generator.
//
// Aggregates each org's shadow_logs + orchestration_logs for a calendar month
// and stores one report per org in db.monthlyReports. Meant to run on the 1st
// of every month (see ops/systemd/marginlift-report.timer), defaulting to the
// previous month. Usage:
//   node scripts/generate-monthly-report.js [--year=2026] [--month=7] [--org=<id>]

const { closeStorage, initializeStorage, readDb, transact } = require("../src/storage");
const { generateMonthlyReport } = require("../src/billing-report");
const { revenueShareRate } = require("../src/config");

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const item = process.argv.find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : fallback;
}

function previousMonth() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

async function main() {
  const fallback = previousMonth();
  const year = Number(getArg("year")) || fallback.year;
  const month = Number(getArg("month")) || fallback.month;
  const orgFilter = getArg("org");

  await initializeStorage();
  const db = await readDb();

  const orgIds = orgFilter
    ? [orgFilter]
    : [...new Set([
        ...(db.shadowLogs || []).map(l => l.organizationId),
        ...(db.orchestrationLogs || []).map(l => l.organizationId),
      ])];

  const reports = orgIds.map(orgId => {
    const shadow = (db.shadowLogs || []).filter(l => l.organizationId === orgId);
    const orchestration = (db.orchestrationLogs || []).filter(l => l.organizationId === orgId);
    const report = generateMonthlyReport(shadow, orchestration, { year, month, revenueShareRate });
    report.organizationId = orgId;
    return report;
  });

  await transact(state => {
    if (!state.monthlyReports) state.monthlyReports = [];
    for (const report of reports) {
      state.monthlyReports = state.monthlyReports.filter(
        r => !(r.organizationId === report.organizationId && r.period === report.period)
      );
      state.monthlyReports.push(report);
    }
  });

  console.log(JSON.stringify({ period: `${year}-${String(month).padStart(2, "0")}`, generated: reports.length, reports }, null, 2));
  await closeStorage();
}

main().catch(async err => {
  console.error("monthly report failed:", err.message);
  try { await closeStorage(); } catch (_) { /* already closing */ }
  process.exit(1);
});

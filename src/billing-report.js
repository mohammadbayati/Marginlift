// Automated monthly savings & revenue-share statement.
//
// Aggregates a calendar month of shadow_logs (advisory) and orchestration_logs
// (realized) into a C-level financial statement. The billable "saved budget"
// is the spend actually blocked by live orchestration DROP commands — shadow
// findings are advisory only and are reported separately, never billed. The
// revenue share MarginLift is owed is a fixed percentage of that realized
// saved budget.

const { generateBudgetWasteReport } = require("./shadow-evaluator");

const DEFAULT_REVENUE_SHARE_RATE = 0.2; // 20% of realized saved budget

function inMonth(iso, year, month) {
  if (year == null || month == null) return true;
  const d = new Date(iso);
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
}

// Pure aggregation. options: { year, month, revenueShareRate }.
// Omitting year/month aggregates across all time.
function generateMonthlyReport(shadowLogs, orchestrationLogs, options = {}) {
  const { year = null, month = null, revenueShareRate = DEFAULT_REVENUE_SHARE_RATE } = options;

  const shadow = (shadowLogs || []).filter(l => inMonth(l.timestamp, year, month));
  const orchestration = (orchestrationLogs || []).filter(l => inMonth(l.timestamp, year, month));

  let savedBudget = 0;
  let netIncrementalProfit = 0;
  let blockedSends = 0;
  let allowedSends = 0;
  let haltedRuns = 0;
  for (const logEntry of orchestration) {
    savedBudget += Number(logEntry.savedBudget || 0);
    netIncrementalProfit += Number(logEntry.netIncrementalProfit || 0);
    blockedSends += Number(logEntry.dropCount || 0);
    allowedSends += Number(logEntry.sendCount || 0);
    if (logEntry.halted) haltedRuns += 1;
  }

  const advisory = generateBudgetWasteReport(shadow);
  const revenueShareAmount = Math.round(savedBudget * revenueShareRate);

  return {
    period: (year != null && month != null) ? `${year}-${String(month).padStart(2, "0")}` : "all",
    generatedAt: new Date().toISOString(),
    orchestration: {
      runs: orchestration.length,
      blockedSends,
      allowedSends,
      haltedRuns,
      savedBudget: Math.round(savedBudget),
      netIncrementalProfit: Math.round(netIncrementalProfit),
    },
    shadowAdvisory: {
      evaluations: advisory.totalEvaluations,
      potentialWasteBudget: advisory.totalWasteBudget,
    },
    billing: {
      currency: "IRR_toman",
      basis: "realized_saved_budget",
      revenueShareRate,
      savedBudget: Math.round(savedBudget),
      revenueShareAmount,
    },
  };
}

module.exports = { generateMonthlyReport, DEFAULT_REVENUE_SHARE_RATE };

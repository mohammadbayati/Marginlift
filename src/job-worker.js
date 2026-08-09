const { createId } = require("./auth");
const { appendAudit, verifyAuditLog } = require("./audit-log");
const { verifyDecisionLedger } = require("./decision-ledger");
const { claimJob, finishJob, readDb, transact } = require("./storage");
const { log } = require("./observability");

function startJobWorker() {
  if (process.env.MARGINLIFT_JOB_WORKER !== "true") return { stop() {} };
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const job = await claimJob();
      if (job) await runJob(job);
    } catch (error) {
      log("error", "job_worker_error", { message: error.message });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, 2000);
  timer.unref();
  tick();
  return { stop() { stopped = true; clearInterval(timer); } };
}

async function runJob(job) {
  try {
    if (job.type !== "evidence_integrity_check") throw new Error(`Unsupported job type: ${job.type}`);
    const db = await readDb();
    const decision = verifyDecisionLedger(db.decisionLedger || [], job.organizationId);
    const audit = verifyAuditLog(db.auditLog || [], job.organizationId);
    await transact(state => {
      appendAudit(state, {
        id: createId("aud"),
        organizationId: job.organizationId,
        action: "evidence_integrity_checked",
        targetType: "workspace",
        metadata: { decisionLedgerValid: decision.valid, auditLogValid: audit.valid },
        createdAt: new Date().toISOString()
      });
    });
    await finishJob(job.id);
  } catch (error) {
    await finishJob(job.id, error.message);
    log("error", "job_failed", { jobId: job.id, type: job.type, message: error.message });
  }
}

module.exports = { startJobWorker };

const { createMetricContract, getContractHash, METRIC_CONTRACT_STATUSES, validateMetricContract } = require("./metric-contract");

function registerMetricContract(db, input) {
  db.metricContracts = Array.isArray(db.metricContracts) ? db.metricContracts : [];
  const contract = createMetricContract(input);
  const key = `${contract.contract_id || ""}:${contract.version || ""}`;
  if (!contract.contract_id || !contract.version) throw error("MC_REGISTRY_ID_VERSION_REQUIRED");
  const existing = db.metricContracts.find(item => `${item.contract_id}:${item.version}` === key);
  if (existing && getContractHash(existing) !== getContractHash(contract)) throw error("MC_REGISTRY_HASH_CONFLICT");
  if (!existing) db.metricContracts.push({ ...contract, contract_hash: getContractHash(contract) });
  return existing || db.metricContracts[db.metricContracts.length - 1];
}

function resolveMetricContract(db, id, version) {
  const item = (db.metricContracts || []).find(contract => contract.contract_id === id && Number(contract.version) === Number(version));
  if (!item) return { found: false, valid: false, reason_code: "INT_LINEAGE_UNRESOLVED" };
  const valid = item.contract_hash === getContractHash(item) && item.status !== METRIC_CONTRACT_STATUSES.INVALIDATED;
  return { found: true, valid, reason_code: valid ? null : "INT_CONTRACT_LINEAGE_MISMATCH", contract: item, validation: validateMetricContract(item, { target_status: item.status }) };
}

function createMetricContractRegistry(db = {}) { db.metricContracts = Array.isArray(db.metricContracts) ? db.metricContracts : []; return db; }
function resolveFrozenMetricContract(db, id) {
  const items = (db.metricContracts || []).filter(item => item.contract_id === id && item.status === METRIC_CONTRACT_STATUSES.FROZEN).sort((a, b) => b.version - a.version);
  return items.length ? { found: true, valid: true, contract: items[0] } : { found: false, valid: false, reason_code: "INT_CONTRACT_UNRESOLVED" };
}
function verifyMetricContractReference(db, reference = {}) {
  const resolved = resolveMetricContract(db, reference.contract_id, reference.version);
  if (!resolved.found) return { valid: false, blocking_reasons: ["INT_CONTRACT_UNRESOLVED"] };
  const reasons = [];
  if (reference.contract_hash !== resolved.contract.contract_hash) reasons.push("INT_CONTRACT_HASH_MISMATCH");
  return { valid: reasons.length === 0 && resolved.valid, blocking_reasons: reasons, contract: resolved.contract };
}
function validateExperimentContext({ registry, metricContract, pilot = {}, experiment = {} } = {}) {
  const reasons = [];
  const reference = verifyMetricContractReference(registry || {}, { contract_id: metricContract?.contract_id, version: metricContract?.version, contract_hash: metricContract?.contract_hash });
  if (!reference.valid) reasons.push(...reference.blocking_reasons);
  if (pilot.metricContractId !== metricContract?.contract_id || experiment.metric_contract_id !== metricContract?.contract_id) reasons.push("INT_EXPERIMENT_LINEAGE_MISMATCH");
  if (Number(pilot.metricContractVersion) !== Number(metricContract?.version) || Number(experiment.metric_contract_version) !== Number(metricContract?.version)) reasons.push("INT_EXPERIMENT_LINEAGE_MISMATCH");
  if (pilot.metricContractHash !== metricContract?.contract_hash || experiment.metric_contract_hash !== metricContract?.contract_hash) reasons.push("INT_CONTRACT_HASH_MISMATCH");
  if (pilot.dataSnapshotId !== metricContract?.data_snapshot_id || experiment.data_snapshot_id !== metricContract?.data_snapshot_id) reasons.push("INT_DATA_SNAPSHOT_MISMATCH");
  if (experiment.id !== pilot.experimentId) reasons.push("INT_EXPERIMENT_LINEAGE_MISMATCH");
  if (experiment.buyer_id && experiment.buyer_id !== metricContract.buyer_id) reasons.push("INT_BUYER_CONTEXT_MISMATCH");
  if (experiment.use_case && experiment.use_case !== metricContract.use_case) reasons.push("INT_USE_CASE_CONTEXT_MISMATCH");
  if (experiment.assignment_unit && experiment.assignment_unit !== metricContract.assignment_unit) reasons.push("INT_ASSIGNMENT_CONTEXT_MISMATCH");
  return { valid: reasons.length === 0, blocking_reasons: [...new Set(reasons)] };
}

function error(code) { const e = new Error(code); e.code = code; return e; }
module.exports = { createMetricContractRegistry, registerMetricContract, resolveMetricContract, resolveFrozenMetricContract, verifyMetricContractReference, validateExperimentContext };

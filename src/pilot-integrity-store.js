const crypto = require("crypto");

const ENGINE_VERSION = "pilot_integrity_v2_5";

function persistIntegrityAssessment(db, assessment, context = {}) {
  db.pilotIntegrityAssessments = Array.isArray(db.pilotIntegrityAssessments) ? db.pilotIntegrityAssessments : [];
  const prior = db.pilotIntegrityAssessments.filter(item => item.pilot_id === assessment.pilot_id).sort((a, b) => b.assessment_version - a.assessment_version)[0];
  const record = {
    ...assessment,
    assessment_version: Number(assessment.assessment_version || (prior ? prior.assessment_version + 1 : 1)),
    engine_version: ENGINE_VERSION,
    analysis_cutoff: context.analysisCutoff || assessment.analysis_cutoff || null,
    financial_provenance_reference: context.financialProvenanceReference || assessment.financial_provenance_reference || null
  };
  record.assessment_hash = hashAssessment(record);
  db.pilotIntegrityAssessments.push(Object.freeze({ ...record, checks: Object.freeze([...(record.checks || [])]) }));
  return record;
}

function getIntegrityAssessment(db, id) {
  const item = (db.pilotIntegrityAssessments || []).find(row => row.assessment_id === id);
  return item ? { ...item, hash_valid: verifyAssessmentHash(item) } : null;
}

function listIntegrityAssessments(db, pilotId, experimentId) {
  return (db.pilotIntegrityAssessments || []).filter(row => (pilotId ? row.pilot_id === pilotId : true) && (experimentId ? row.experiment_id === experimentId : true)).sort((a, b) => b.assessment_version - a.assessment_version);
}

function getLatestIntegrityAssessment(db, pilotId, experimentId) {
  return listIntegrityAssessments(db, pilotId, experimentId)[0] || null;
}

function verifyAssessmentHash(assessment) {
  return Boolean(assessment?.assessment_hash && assessment.assessment_hash === hashAssessment(assessment));
}

function hashAssessment(assessment) {
  const copy = { ...assessment };
  delete copy.assessment_hash;
  return `sha256:${crypto.createHash("sha256").update(canonical(copy), "utf8").digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

module.exports = { ENGINE_VERSION, getIntegrityAssessment, getLatestIntegrityAssessment, hashAssessment, listIntegrityAssessments, persistIntegrityAssessment, verifyAssessmentHash };

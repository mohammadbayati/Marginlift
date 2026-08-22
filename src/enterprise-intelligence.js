function buildEnterpriseIntelligence(db, context = {}) {
  const organizationId = requireOrganizationId(context);
  const generatedAt = context.generatedAt || new Date().toISOString();
  const records = buildPilotRecords(db, organizationId);
  const sourceRefs = sourceRefsFrom(records);
  const portfolio = calculatePortfolioHealth(records);
  const financialBenchmarks = calculateFinancialBenchmarks(records);
  const decisionPatterns = extractDecisionPatterns(records);
  const scaleCandidates = identifyScaleCandidates(records);
  const interventionRequired = identifyInterventionRequired(records, generatedAt);
  const evidenceConfidence = evidenceConfidenceFrom(records);
  return {
    persisted: false,
    generatedAt,
    organizationId,
    portfolio,
    financialBenchmarks,
    decisionPatterns,
    executiveIntelligence: {
      portfolioHealth: portfolio.portfolioHealth,
      scaleCandidates,
      interventionRequired,
      evidenceConfidence,
      recommendedExecutiveActions: recommendedActions(portfolio, financialBenchmarks, interventionRequired, scaleCandidates)
    },
    sourceRefs
  };
}

function calculatePortfolioHealth(records = []) {
  const pilotsTotal = records.length;
  const workflows = records.filter(record => record.workflow);
  const blockers = records.flatMap(record => unresolvedBlockers(record.workflow));
  const verifiedFinancialProofCount = records.filter(record => isVerifiedLedger(record.ledger)).length;
  const readinessScores = workflows.map(record => readinessScore(record.workflow));
  const averageReadinessScore = readinessScores.length
    ? round(readinessScores.reduce((sum, score) => sum + score, 0) / readinessScores.length, 2)
    : 0;
  const pilotsByStatus = {};
  for (const record of records) {
    const status = record.workflow?.lifecycleStatus || record.contract?.lifecycleStatus || record.ledger?.lifecycleStatus || "untracked";
    pilotsByStatus[status] = (pilotsByStatus[status] || 0) + 1;
  }
  const decisionReadyCount = records.filter(record =>
    record.workflow?.lifecycleStatus === "decision_ready" ||
    record.workflow?.lifecycleStatus === "closed" ||
    readinessScore(record.workflow) >= 4
  ).length;
  const closedCount = records.filter(record => record.workflow?.lifecycleStatus === "closed").length;
  return {
    pilotsTotal,
    pilotsByStatus,
    decisionReadyCount,
    closedCount,
    activeBlockersCount: blockers.length,
    averageReadinessScore,
    verifiedFinancialProofCount,
    portfolioHealth: portfolioHealth(pilotsTotal, averageReadinessScore, blockers.length, verifiedFinancialProofCount)
  };
}

function calculateFinancialBenchmarks(records = []) {
  const ledgers = records.map(record => record.ledger).filter(Boolean);
  const verified = ledgers.filter(isVerifiedLedger);
  const totalForecastValue = sum(ledgers.map(ledger => ledger.forecast?.predictedImpact));
  const totalRealizedValue = sum(verified.map(ledger => ledger.realizedImpact?.measuredImpact));
  const totalNetValue = sum(verified.map(ledger => ledger.roi?.netValue));
  const roiValues = verified.map(ledger => finiteOrNull(ledger.roi?.roiPercentage)).filter(value => value !== null);
  const averageRoiPercentage = roiValues.length
    ? round(roiValues.reduce((total, value) => total + value, 0) / roiValues.length, 2)
    : null;
  return {
    totalForecastValue,
    totalRealizedValue,
    totalNetValue,
    averageRoiPercentage,
    verifiedImpactRate: ledgers.length ? round(verified.length / ledgers.length, 4) : 0,
    topPerformingPilots: topPerformingPilots(records),
    underperformingPilots: underperformingPilots(records)
  };
}

function extractDecisionPatterns(records = []) {
  return {
    commonBlockers: topCounts(records.flatMap(record => unresolvedBlockers(record.workflow).map(blocker => blocker.description))),
    commonGuardrails: topCounts(records.flatMap(record => guardrailLabels(record.contract))),
    strongestKpis: strongestKpis(records),
    lifecycleBottlenecks: topCounts(records.map(record => record.workflow?.lifecycleStatus || "untracked")),
    evidenceGaps: evidenceGaps(records)
  };
}

function identifyScaleCandidates(records = []) {
  return records
    .filter(record => hasApprovedContract(record.contract))
    .filter(record => isVerifiedLedger(record.ledger))
    .filter(record => readinessScore(record.workflow) >= 3)
    .filter(record => !unresolvedBlockers(record.workflow).some(blocker => blocker.severity === "critical"))
    .map(record => ({
      pilotId: record.id,
      pilotContractId: record.contract?.id || null,
      businessImpactLedgerId: record.ledger?.id || null,
      pilotWorkflowId: record.workflow?.id || null,
      readinessScore: readinessScore(record.workflow),
      netValue: finiteOrNull(record.ledger?.roi?.netValue),
      roiPercentage: finiteOrNull(record.ledger?.roi?.roiPercentage),
      signal: "scale_candidate",
      recommendation: "Review verified financial proof and operating evidence for executive scale decision."
    }));
}

function identifyInterventionRequired(records = [], generatedAt = new Date().toISOString()) {
  return records
    .map(record => {
      const reasons = [];
      const blockers = unresolvedBlockers(record.workflow);
      if (blockers.some(blocker => blocker.severity === "critical" || blocker.severity === "high")) {
        reasons.push("high_or_critical_blocker");
      }
      if (isStaleWorkflow(record.workflow, generatedAt)) {
        reasons.push("stale_lifecycle");
      }
      if (["outcome_pending", "decision_ready", "closed"].includes(record.workflow?.lifecycleStatus) && !isVerifiedLedger(record.ledger)) {
        reasons.push("missing_financial_verification_near_decision");
      }
      if (record.workflow && readinessScore(record.workflow) <= 1) {
        reasons.push("low_executive_readiness");
      }
      return {
        pilotId: record.id,
        pilotContractId: record.contract?.id || null,
        businessImpactLedgerId: record.ledger?.id || null,
        pilotWorkflowId: record.workflow?.id || null,
        lifecycleStatus: record.workflow?.lifecycleStatus || null,
        readinessScore: readinessScore(record.workflow),
        blockersCount: blockers.length,
        reasons,
        recommendation: "Resolve evidence and operating blockers before presenting this pilot as enterprise-ready."
      };
    })
    .filter(item => item.reasons.length > 0);
}

function buildPilotRecords(db, organizationId) {
  const contracts = byId(filterOrg(db?.pilotContracts, organizationId));
  const ledgers = byId(filterOrg(db?.businessImpactLedgers, organizationId));
  const workflows = filterOrg(db?.pilotWorkflows, organizationId);
  const records = [];
  const usedContracts = new Set();
  const usedLedgers = new Set();

  for (const workflow of workflows) {
    const contract = workflow.pilotContractId ? contracts.get(workflow.pilotContractId) : null;
    const ledger = workflow.businessImpactLedgerId ? ledgers.get(workflow.businessImpactLedgerId) : null;
    if (contract) usedContracts.add(contract.id);
    if (ledger) usedLedgers.add(ledger.id);
    records.push({
      id: workflow.id,
      contract,
      ledger,
      workflow
    });
  }

  for (const contract of contracts.values()) {
    if (usedContracts.has(contract.id)) continue;
    const ledger = [...ledgers.values()].find(item => item.pilotContractId === contract.id && !usedLedgers.has(item.id)) || null;
    if (ledger) usedLedgers.add(ledger.id);
    records.push({
      id: contract.id,
      contract,
      ledger,
      workflow: null
    });
  }

  for (const ledger of ledgers.values()) {
    if (usedLedgers.has(ledger.id)) continue;
    records.push({
      id: ledger.id,
      contract: null,
      ledger,
      workflow: null
    });
  }

  return records.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function sourceRefsFrom(records) {
  return {
    pilotContractIds: unique(records.map(record => record.contract?.id)),
    businessImpactLedgerIds: unique(records.map(record => record.ledger?.id)),
    pilotWorkflowIds: unique(records.map(record => record.workflow?.id))
  };
}

function filterOrg(items, organizationId) {
  return Array.isArray(items) ? items.filter(item => item && item.organizationId === organizationId) : [];
}

function byId(items) {
  return new Map(items.filter(item => item.id).map(item => [item.id, item]));
}

function hasApprovedContract(contract) {
  return Boolean(contract && ["approved", "locked", "experiment_running", "outcome_review", "closed"].includes(contract.lifecycleStatus));
}

function isVerifiedLedger(ledger) {
  return Boolean(ledger?.financeValidation?.status === "verified");
}

function readinessScore(workflow) {
  if (!workflow?.executiveReadiness) return 0;
  return ["decisionContractReady", "dataReady", "experimentReady", "financialProofReady"]
    .filter(key => workflow.executiveReadiness[key] === true).length;
}

function unresolvedBlockers(workflow) {
  if (!workflow || !Array.isArray(workflow.blockers)) return [];
  return workflow.blockers.filter(blocker => blocker && blocker.status !== "resolved" && blocker.status !== "closed");
}

function isStaleWorkflow(workflow, generatedAt) {
  if (!workflow || workflow.lifecycleStatus === "closed") return false;
  const activeStage = Array.isArray(workflow.stages)
    ? workflow.stages.find(stage => stage.key === workflow.lifecycleStatus || stage.status === "active")
    : null;
  if (activeStage?.dueDate && new Date(activeStage.dueDate) < new Date(generatedAt)) return true;
  const updatedAt = workflow.audit?.updatedAt || workflow.audit?.createdAt;
  if (!updatedAt) return false;
  const ageMs = new Date(generatedAt) - new Date(updatedAt);
  return ageMs > 1000 * 60 * 60 * 24 * 30 && !["decision_ready", "closed"].includes(workflow.lifecycleStatus);
}

function guardrailLabels(contract) {
  if (!contract || !Array.isArray(contract.guardrails)) return [];
  return contract.guardrails.map(item => item.metric || item.key || item.label).filter(Boolean);
}

function strongestKpis(records) {
  const grouped = new Map();
  for (const record of records) {
    const kpi = record.contract?.primaryKpi;
    if (!kpi?.key) continue;
    const current = grouped.get(kpi.key) || {
      key: kpi.key,
      label: kpi.label || kpi.key,
      count: 0,
      targetValues: []
    };
    current.count += 1;
    const target = finiteOrNull(kpi.targetValue);
    if (target !== null) current.targetValues.push(target);
    grouped.set(kpi.key, current);
  }
  return [...grouped.values()]
    .map(item => ({
      key: item.key,
      label: item.label,
      count: item.count,
      averageTargetValue: item.targetValues.length
        ? round(item.targetValues.reduce((sum, value) => sum + value, 0) / item.targetValues.length, 2)
        : null
    }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)))
    .slice(0, 5);
}

function evidenceGaps(records) {
  const gaps = [];
  for (const record of records) {
    if (!record.contract) gaps.push({ pilotId: record.id, gap: "decision_contract_missing" });
    if (!record.ledger) gaps.push({ pilotId: record.id, gap: "business_impact_missing" });
    if (!record.workflow) gaps.push({ pilotId: record.id, gap: "pilot_workflow_missing" });
    if (record.workflow && Array.isArray(record.workflow.stages)) {
      for (const stage of record.workflow.stages) {
        const stageIsRelevant = stage.status === "active" || stage.status === "completed";
        if (stageIsRelevant && (!Array.isArray(stage.evidence) || stage.evidence.length === 0)) {
          gaps.push({ pilotId: record.id, gap: `stage_evidence_missing:${stage.key}` });
        }
      }
    }
    if (record.ledger && !isVerifiedLedger(record.ledger)) {
      gaps.push({ pilotId: record.id, gap: "financial_verification_missing" });
    }
  }
  return gaps.slice(0, 25);
}

function topPerformingPilots(records) {
  return records
    .filter(record => isVerifiedLedger(record.ledger))
    .map(record => ({
      pilotId: record.id,
      netValue: finiteOrNull(record.ledger?.roi?.netValue),
      roiPercentage: finiteOrNull(record.ledger?.roi?.roiPercentage)
    }))
    .filter(item => item.netValue !== null || item.roiPercentage !== null)
    .sort((a, b) => (b.netValue ?? -Infinity) - (a.netValue ?? -Infinity))
    .slice(0, 5);
}

function underperformingPilots(records) {
  return records
    .filter(record => isVerifiedLedger(record.ledger))
    .map(record => ({
      pilotId: record.id,
      netValue: finiteOrNull(record.ledger?.roi?.netValue),
      roiPercentage: finiteOrNull(record.ledger?.roi?.roiPercentage)
    }))
    .filter(item => (item.netValue !== null && item.netValue < 0) || (item.roiPercentage !== null && item.roiPercentage < 0))
    .sort((a, b) => (a.netValue ?? Infinity) - (b.netValue ?? Infinity))
    .slice(0, 5);
}

function evidenceConfidenceFrom(records) {
  if (!records.length) return "none";
  const complete = records.filter(record =>
    hasApprovedContract(record.contract) &&
    isVerifiedLedger(record.ledger) &&
    readinessScore(record.workflow) >= 3
  ).length;
  const ratio = complete / records.length;
  if (ratio >= 0.75) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

function recommendedActions(portfolio, financialBenchmarks, interventions, scaleCandidates) {
  const actions = [];
  if (scaleCandidates.length) {
    actions.push({
      signal: "scale_review_ready",
      recommendation: "Review scale candidates with verified financial proof and operating readiness."
    });
  }
  if (interventions.length) {
    actions.push({
      signal: "intervention_required",
      recommendation: "Resolve blockers, stale stages, or missing finance evidence before executive readout."
    });
  }
  if (portfolio.pilotsTotal === 0) {
    actions.push({
      signal: "no_portfolio_evidence",
      recommendation: "Create pilot contracts, financial ledgers, and control-room workflows before portfolio review."
    });
  }
  if (financialBenchmarks.verifiedImpactRate < 0.5 && portfolio.pilotsTotal > 0) {
    actions.push({
      signal: "low_finance_verification",
      recommendation: "Prioritize finance verification so portfolio ROI is executive-defensible."
    });
  }
  return actions;
}

function portfolioHealth(pilotsTotal, averageReadinessScore, blockersCount, verifiedCount) {
  if (pilotsTotal === 0) return "empty";
  if (blockersCount > 0 && averageReadinessScore < 2) return "at_risk";
  if (averageReadinessScore >= 3 && verifiedCount > 0) return "strong";
  if (averageReadinessScore >= 2) return "developing";
  return "weak";
}

function topCounts(values, limit = 5) {
  const counts = new Map();
  for (const raw of values) {
    const value = normalizeString(raw);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function sum(values) {
  return values.map(finiteOrNull).filter(value => value !== null).reduce((total, value) => total + value, 0);
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function normalizeString(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function requireOrganizationId(context = {}) {
  if (!context.organizationId) {
    const error = new Error("Authenticated organization is required.");
    error.status = 401;
    error.code = "AUTH_REQUIRED";
    throw error;
  }
  return context.organizationId;
}

module.exports = {
  buildEnterpriseIntelligence,
  calculateFinancialBenchmarks,
  calculatePortfolioHealth,
  extractDecisionPatterns,
  identifyInterventionRequired,
  identifyScaleCandidates
};

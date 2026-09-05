"use strict";

const PRODUCT_SECTIONS = Object.freeze([
  { key: "control-center", label: "Control Center", roles: ["owner", "admin", "analyst", "viewer"] },
  { key: "pilot", label: "Pilot", roles: ["owner", "admin", "analyst", "viewer"] },
  { key: "value", label: "Value", roles: ["owner", "admin", "analyst", "viewer"] },
  { key: "execution", label: "Execution", roles: ["owner", "admin", "analyst", "viewer"] },
  { key: "governance", label: "Governance", roles: ["owner", "admin", "analyst", "viewer"] },
  { key: "data-trust", label: "Data Trust", roles: ["owner", "admin", "analyst", "viewer"] },
  { key: "evidence", label: "Evidence", roles: ["owner", "admin", "analyst", "viewer"] },
  { key: "reports", label: "Reports", roles: ["owner", "admin", "analyst", "viewer"] },
  { key: "settings", label: "Settings", roles: ["owner", "admin"] }
]);

const GAP_PHASES = Object.freeze([
  ["enterprise-replication", "Roadmap only: enterprise replication has no backend module in this repository."],
  ["account-intelligence", "Roadmap only: account intelligence has no backend module in this repository."],
  ["benchmark-intelligence", "Roadmap only: benchmark intelligence has no backend module in this repository."],
  ["enterprise-integrations", "Roadmap only: enterprise integration connectors have no backend module in this repository."],
  ["observatory", "Roadmap only: intelligence observatory has no backend module in this repository."],
  ["learning-intelligence", "Roadmap only: enterprise learning intelligence has no backend module in this repository."],
  ["advisory-intelligence", "Roadmap only: advisory intelligence has no backend module in this repository."],
  ["scenario-intelligence", "Roadmap only: scenario intelligence has no backend module in this repository."],
  ["strategic-planning", "Roadmap only: strategic planning intelligence has no backend module in this repository."],
  ["strategic-portfolio", "Roadmap only: strategic portfolio intelligence has no backend module in this repository."],
  ["operating-model", "Roadmap only: operating model intelligence has no backend module in this repository."],
  ["transformation-intelligence", "Roadmap only: transformation intelligence has no backend module in this repository."],
  ["change-intelligence", "Roadmap only: change intelligence has no backend module in this repository."],
  ["capability-intelligence", "Roadmap only: capability intelligence has no backend module in this repository."],
  ["performance-intelligence", "Roadmap only: enterprise performance intelligence has no backend module in this repository."],
  ["enterprise-value-intelligence", "Roadmap only: enterprise value intelligence has no backend module in this repository."],
  ["value-portfolio", "Roadmap only: value portfolio intelligence has no backend module in this repository."],
  ["value-operating-system", "Roadmap only: value operating system intelligence has no backend module in this repository."]
]);

function buildEnterpriseProductSurface(input = {}) {
  const role = normalizeRole(input.role);
  const generatedAt = input.generatedAt || new Date().toISOString();
  const pilotState = input.pilotState || {};
  const enterprise = input.enterpriseIntelligence || {};
  const governance = input.modelGovernance || {};
  const decisionLedger = input.decisionLedger || governance.decisionLedger || {};
  const internalRole = ["owner", "admin"].includes(role);
  const capabilityGaps = GAP_PHASES.map(([key, reason]) => ({
    key,
    status: "roadmap",
    customerVisible: false,
    reason
  }));
  const controlCards = buildControlCards({ pilotState, enterprise, governance, decisionLedger, capabilityGaps });
  const navigation = PRODUCT_SECTIONS
    .filter(item => item.roles.includes(role))
    .map(item => ({
      key: item.key,
      label: item.label,
      href: "#enterprise-control-center",
      readOnly: role === "viewer",
      adminOnly: item.key === "settings"
    }));
  const visibleSectionKeys = new Set(navigation.map(item => item.key));
  const sections = buildSections({ pilotState, enterprise, governance, decisionLedger, capabilityGaps })
    .filter(section => visibleSectionKeys.has(section.key));
  return {
    persisted: false,
    generatedAt,
    organizationId: input.organization?.id || input.organizationId || null,
    workspaceName: input.organization?.name || null,
    role,
    permissions: rolePermissions(role),
    navigation,
    controlCenter: {
      title: "Enterprise Control Center",
      state: summarizeSurfaceState(controlCards),
      cards: controlCards
    },
    sections,
    reports: buildReports(),
    capabilityGaps: internalRole ? capabilityGaps : [],
    internalCapabilityMap: internalRole ? buildInternalCapabilityMap(capabilityGaps) : null,
    boundary: {
      productizationOnly: true,
      autonomousDecisions: false,
      autonomousRecommendations: false,
      source: "Phase 8.0 presentation surface over existing backend capabilities."
    }
  };
}

function buildControlCards({ pilotState, enterprise, governance, decisionLedger }) {
  const portfolio = enterprise.portfolio || {};
  const financial = enterprise.financialBenchmarks || {};
  const sourceRefs = enterprise.sourceRefs || {};
  const acceptance = pilotState.pilotAcceptanceSummary || {};
  const control = pilotState.pilotControlSummary || {};
  const readiness = pilotState.readiness || {};
  const snapshot = pilotState.savingsSnapshot || {};
  const modelGovernance = governance.modelGovernance || {};
  const outcomeMonitor = governance.outcomeMonitor || {};
  const ledgerIntegrity = decisionLedger.integrity || {};
  const interventions = enterprise.executiveIntelligence?.interventionRequired || [];
  const staleCount = interventions.filter(item => (item.reasons || []).includes("stale_lifecycle")).length;
  const evidenceGapCount = enterprise.decisionPatterns?.evidenceGaps?.length || 0;

  return [
    card({
      key: "enterprise-health",
      label: "Enterprise health",
      value: portfolio.portfolioHealth || "empty",
      status: portfolioStatus(portfolio.portfolioHealth),
      summary: `${portfolio.pilotsTotal || 0} pilot records, ${portfolio.activeBlockersCount || 0} active blockers`,
      sourceModule: "enterprise-intelligence",
      sourceRecordId: sourceRefs.pilotWorkflowIds?.[0] || sourceRefs.pilotContractIds?.[0] || null,
      evidenceRefs: sourceRefs.pilotWorkflowIds || [],
      blockers: portfolio.activeBlockersCount ? [`${portfolio.activeBlockersCount} active pilot blockers`] : [],
      risks: evidenceGapCount ? [`${evidenceGapCount} evidence gaps in enterprise intelligence`] : [],
      why: "Uses the existing enterprise intelligence portfolioHealth and activeBlockersCount fields."
    }),
    card({
      key: "verified-realized-value",
      label: "Verified realized value",
      value: financial.totalRealizedValue || 0,
      unit: "money",
      status: financial.verifiedImpactRate > 0 ? "healthy" : "partial_evidence",
      summary: `Verified impact rate: ${financial.verifiedImpactRate ?? 0}`,
      sourceModule: "enterprise-intelligence",
      sourceRecordId: sourceRefs.businessImpactLedgerIds?.[0] || null,
      evidenceRefs: sourceRefs.businessImpactLedgerIds || [],
      risks: financial.verifiedImpactRate > 0 ? [] : ["No verified business impact ledger is available."],
      reportRoute: "/api/enterprise/intelligence",
      why: "Uses existing financialBenchmarks.totalRealizedValue and verifiedImpactRate."
    }),
    card({
      key: "value-leakage",
      label: "Value leakage",
      value: snapshot.avoidableIncentiveCost ?? null,
      unit: "money",
      status: snapshot.avoidableIncentiveCost === null || snapshot.avoidableIncentiveCost === undefined ? "empty" : "partial_evidence",
      summary: snapshot.claimLevelFa || snapshot.evidenceTagFa || "Pilot value leakage evidence is not available.",
      sourceModule: "pilot-workspace",
      sourceRecordId: pilotState.experiment?.id || pilotState.customerAnalysis?.id || null,
      evidenceRefs: [pilotState.experiment?.id, pilotState.customerAnalysis?.id].filter(Boolean),
      reportRoute: "/api/pilot/readout.md",
      why: "Uses the existing pilot savingsSnapshot.avoidableIncentiveCost field."
    }),
    card({
      key: "execution-health",
      label: "Execution health",
      value: control.lifecycleStatus || "untracked",
      status: executionStatus(control),
      summary: `${control.blockersCount || 0} blockers, ${control.completedStagesCount || 0}/${control.totalStagesCount || 0} stages complete`,
      sourceModule: "pilot-control-room",
      sourceRecordId: control.id || null,
      evidenceRefs: control.evidenceRefs || [],
      blockers: control.blockersCount ? [`${control.blockersCount} control-room blockers`] : [],
      reportRoute: "/api/pilot/workspace",
      why: "Uses the existing pilotControlSummary lifecycle and blocker fields."
    }),
    card({
      key: "governance-trust",
      label: "Governance trust",
      value: ledgerIntegrity.valid === false ? "invalid" : "valid",
      status: ledgerIntegrity.valid === false ? "blocked" : ledgerIntegrity.checked > 0 ? "healthy" : "partial_evidence",
      summary: `${ledgerIntegrity.checked || 0} decision records checked`,
      sourceModule: "decision-ledger",
      sourceRecordId: ledgerIntegrity.latestHash || null,
      evidenceRefs: [ledgerIntegrity.latestHash].filter(Boolean),
      auditEvents: decisionLedger.entries?.map(item => item.id).filter(Boolean).slice(0, 8) || [],
      reportRoute: "/api/decision-ledger",
      why: "Uses the existing decision ledger integrity verification."
    }),
    card({
      key: "data-trust",
      label: "Data trust",
      value: modelGovernance.claimLevel || modelGovernance.claimLevelFa || "untracked",
      status: dataTrustStatus(modelGovernance, outcomeMonitor),
      summary: outcomeMonitor.summaryFa || modelGovernance.claimLevelFa || "Model governance evidence is not available.",
      sourceModule: "model-governance",
      sourceRecordId: modelGovernance.registry?.championId || null,
      evidenceRefs: modelGovernance.registry?.candidates?.map(item => item.id).filter(Boolean) || [],
      reportRoute: "/api/model-governance/overview",
      why: "Uses existing model governance and outcome monitor fields."
    }),
    card({
      key: "pilot-patterns",
      label: "Pilot evidence patterns",
      value: enterprise.decisionPatterns?.lifecycleBottlenecks?.length || 0,
      status: enterprise.decisionPatterns?.lifecycleBottlenecks?.length ? "partial_evidence" : "empty",
      summary: "Source-backed lifecycle bottlenecks and evidence gaps from implemented pilot records.",
      sourceModule: "enterprise-intelligence",
      sourceRecordId: sourceRefs.pilotWorkflowIds?.[0] || null,
      evidenceRefs: sourceRefs.pilotWorkflowIds || [],
      risks: (enterprise.decisionPatterns?.evidenceGaps || []).map(item => item.gap).slice(0, 5),
      reportRoute: "/api/enterprise/intelligence",
      why: "Uses existing enterprise intelligence decisionPatterns fields; it does not create strategy guidance."
    }),
    card({
      key: "critical-blockers",
      label: "Critical blockers",
      value: portfolio.activeBlockersCount || 0,
      status: portfolio.activeBlockersCount > 0 ? "blocked" : portfolio.pilotsTotal > 0 ? "healthy" : "empty",
      summary: `${interventions.length} source-backed intervention flags`,
      sourceModule: "enterprise-intelligence",
      sourceRecordId: sourceRefs.pilotWorkflowIds?.[0] || null,
      evidenceRefs: sourceRefs.pilotWorkflowIds || [],
      blockers: interventions.flatMap(item => item.reasons || []).slice(0, 8),
      reportRoute: "/api/enterprise/intelligence",
      why: "Uses existing activeBlockersCount and interventionRequired flags."
    }),
    card({
      key: "evidence-freshness",
      label: "Evidence freshness",
      value: staleCount ? `${staleCount} stale` : "current",
      status: staleCount ? "stale_evidence" : portfolio.pilotsTotal > 0 ? "healthy" : "empty",
      summary: "Freshness is derived from existing stale_lifecycle flags.",
      sourceModule: "enterprise-intelligence",
      sourceRecordId: sourceRefs.pilotWorkflowIds?.[0] || null,
      evidenceRefs: sourceRefs.pilotWorkflowIds || [],
      risks: staleCount ? [`${staleCount} stale lifecycle records`] : [],
      why: "Uses existing enterprise intelligence stale_lifecycle detection."
    }),
    card({
      key: "latest-executive-reports",
      label: "Latest executive reports",
      value: "3 report routes",
      status: "healthy",
      summary: "Pilot readout, pilot package, and acceptance package are available through authenticated endpoints.",
      sourceModule: "reports",
      sourceRecordId: acceptance.id || pilotState.experiment?.id || null,
      evidenceRefs: [acceptance.id, pilotState.experiment?.id].filter(Boolean),
      reportRoute: "/api/pilot/acceptance/package.md",
      why: "Uses existing authenticated markdown report endpoints."
    }),
    card({
      key: "open-human-decisions",
      label: "Open human decisions",
      value: acceptance.lifecycleStatus || control.lifecycleStatus || "untracked",
      status: acceptance.certificationStatus === "certified" ? "healthy" : acceptance.persisted ? "partial_evidence" : "empty",
      summary: acceptance.certificationStatus || "No certified production acceptance record.",
      sourceModule: "production-acceptance",
      sourceRecordId: acceptance.id || null,
      evidenceRefs: acceptance.evidenceRefs || [],
      auditEvents: acceptance.auditEventIds || [],
      reportRoute: "/api/pilot/acceptance",
      why: "Uses existing production acceptance lifecycle and certification fields."
    })
  ];
}

function buildSections({ pilotState, enterprise, governance, decisionLedger, capabilityGaps }) {
  const sourceRefs = enterprise.sourceRefs || {};
  const acceptance = pilotState.pilotAcceptanceSummary || {};
  const control = pilotState.pilotControlSummary || {};
  return [
    section("pilot", "Pilot", [
      entry("pilot-readiness", "Pilot readiness", "available", "/api/pilot/workspace", "Uses readiness checks and pilot workspace steps."),
      entry("decision-contract", "Decision contract", "available", "/api/pilot/decision-contract", "Uses the current pilot decision contract."),
      entry("business-impact", "Business impact ledger", "available", "/api/pilot/business-impact", "Uses the current business impact ledger."),
      entry("pilot-control-room", "Pilot control room", "available", "/api/pilot/control-room", "Uses the current operational workflow and blockers."),
      entry("production-acceptance", "Production acceptance", "available", "/api/pilot/acceptance", "Uses the current acceptance lifecycle and certification."),
      entry("pilot-readout", "Executive pilot readout", "available", "/api/pilot/readout.md", "Uses the existing authenticated pilot readout.")
    ], [
      pilotState.customerAnalysis?.id,
      pilotState.experiment?.id,
      acceptance.id,
      control.id
    ].filter(Boolean)),
    section("value", "Value", [
      entry("verified-impact", "Verified business impact", "available", "/api/pilot/business-impact", "Uses finance-validated business impact ledger records."),
      entry("value-leakage", "Value leakage", "available", "/api/pilot/workspace", "Uses pilot savingsSnapshot avoidable incentive cost."),
      entry("enterprise-financial-rollup", "Enterprise financial rollup", "available", "/api/enterprise/intelligence", "Uses implemented enterprise financialBenchmarks across pilot records.")
    ], sourceRefs.businessImpactLedgerIds),
    section("execution", "Execution", [
      entry("control-room-status", "Control room status", "available", "/api/pilot/control-room", "Uses the implemented pilot control room lifecycle."),
      entry("execution-blockers", "Execution blockers", control.persisted ? "available" : "partial", "/api/pilot/workspace", "Uses pilot control-room blockers and lifecycle readiness."),
      entry("outcome-loop", "Outcome loop", pilotState.outcome ? "available" : "partial", "/api/pilot/workspace", "Uses the implemented pilot workspace outcome import/readout path.")
    ], [control.id].filter(Boolean)),
    section("governance", "Governance", [
      entry("decision-ledger", "Decision ledger", "available", "/api/decision-ledger", "Uses the existing append-only decision ledger."),
      entry("model-governance", "Model governance", "available", "/api/model-governance/overview", "Uses existing model governance, promotion gates, and outcome monitoring."),
      entry("acceptance-approvals", "Acceptance approvals", acceptance.persisted ? "available" : "partial", "/api/pilot/acceptance", "Uses production acceptance customer and executive approval records."),
      entry("audit-trail", "Audit trail", "available", "/api/decision-ledger", "Decision ledger and operational audit endpoints remain server-authoritative.")
    ], decisionLedger.entries?.map(item => item.id).filter(Boolean) || []),
    section("data-trust", "Data Trust", [
      entry("data-quality", "Data quality", "partial", "/api/model-governance/overview", "Model governance and pilot readiness checks are available."),
      entry("lineage", "Lineage", "partial", "/api/pilot/workspace", "Pilot package and acceptance package provide source lineage."),
      entry("data-trust", "Data trust", "partial", "/api/model-governance/overview", "Existing model governance and outcome monitor are surfaced.")
    ], governance.modelGovernance?.registry?.candidates?.map(item => item.id).filter(Boolean) || []),
    section("evidence", "Evidence", [
      entry("evidence-graph", "Evidence graph", "partial", "/api/enterprise/product-surface", "The product surface links each card to source module, record ID, evidence refs, audit events, risks, and reports."),
      entry("evidence-packages", "Evidence packages", "available", "/api/pilot/acceptance/package.md", "Production acceptance package is available."),
      entry("reports", "Reports", "available", "/api/pilot/readout.md", "Pilot readout, pilot package, acceptance package, and governance JSON reports are linked."),
      entry("traceability", "Traceability", "available", "/api/enterprise/product-surface", "Every executive card carries trace metadata.")
    ], [acceptance.id, pilotState.experiment?.id].filter(Boolean)),
    section("reports", "Reports", buildReports().map(report => entry(report.key, report.label, "available", report.route, report.description)), []),
    section("settings", "Settings", [
      entry("workspace-access", "Workspace access", "available", "/api/access/members", "Owner/admin workspace access controls remain server-side."),
      entry("operational-health", "Operational health", "admin_only", "/api/internal/health", "Admin-only operational health remains behind server-side RBAC."),
      entry("internal-capability-map", "Internal capability map", "internal", null, `${capabilityGaps.length} roadmap capabilities are intentionally excluded from customer navigation.`)
    ], [])
  ];
}

function buildReports() {
  return [
    { key: "pilot-readout", label: "Pilot executive readout", route: "/api/pilot/readout.md", description: "Existing pilot readiness and outcome readout." },
    { key: "pilot-package", label: "Pilot evidence package", route: "/api/pilot/package.md", description: "Existing pilot evidence package." },
    { key: "acceptance-package", label: "Production acceptance package", route: "/api/pilot/acceptance/package.md", description: "Existing production acceptance evidence package." },
    { key: "enterprise-intelligence", label: "Enterprise intelligence JSON", route: "/api/enterprise/intelligence", description: "Existing enterprise portfolio and evidence rollup." },
    { key: "model-governance", label: "Model governance JSON", route: "/api/model-governance/overview", description: "Existing model governance overview." },
    { key: "decision-ledger", label: "Decision ledger JSON", route: "/api/decision-ledger", description: "Existing decision ledger integrity report." }
  ];
}

function buildInternalCapabilityMap(capabilityGaps) {
  return {
    visibility: "owner_admin_only",
    customerVisible: false,
    purpose: "Repository-truth registry for roadmap capabilities that are not implemented in v1.0.",
    entries: capabilityGaps
  };
}

function card(input) {
  return {
    key: input.key,
    label: input.label,
    value: input.value,
    unit: input.unit || null,
    status: input.status,
    summary: input.summary || "",
    trace: {
      sourceModule: input.sourceModule,
      sourceRecordId: input.sourceRecordId || null,
      evidenceRefs: input.evidenceRefs || [],
      auditEvents: input.auditEvents || [],
      reportRoute: input.reportRoute || null,
      blockers: input.blockers || [],
      risks: input.risks || [],
      humanDecisionRefs: input.humanDecisionRefs || [],
      why: input.why || ""
    }
  };
}

function section(key, label, entries, evidenceRefs) {
  const customerEntries = entries.filter(item => item.status !== "internal" && item.status !== "roadmap");
  return {
    key,
    label,
    state: customerEntries.some(item => item.status === "available") ? "partial_evidence" : "empty",
    evidenceRefs: evidenceRefs || [],
    entries
  };
}

function entry(key, label, status, sourceRoute, description) {
  return { key, label, status, sourceRoute, description };
}

function summarizeSurfaceState(cards) {
  if (cards.some(item => item.status === "blocked")) return "blocked";
  if (cards.some(item => item.status === "stale_evidence")) return "stale_evidence";
  if (cards.some(item => item.status === "partial_evidence")) return "partial_evidence";
  if (cards.every(item => item.status === "empty")) return "empty";
  return "healthy";
}

function rolePermissions(role) {
  return {
    canReadControlCenter: true,
    canReadEvidence: true,
    canGenerateReports: ["owner", "admin", "analyst"].includes(role),
    canManageEvidence: ["owner", "admin", "analyst"].includes(role),
    canApprove: ["owner", "admin"].includes(role),
    canAdministerWorkspace: ["owner", "admin"].includes(role),
    readOnly: role === "viewer"
  };
}

function normalizeRole(role) {
  return ["owner", "admin", "analyst", "viewer"].includes(role) ? role : "viewer";
}

function portfolioStatus(status) {
  if (status === "strong") return "healthy";
  if (status === "developing") return "partial_evidence";
  if (status === "weak" || status === "at_risk") return "blocked";
  return "empty";
}

function executionStatus(control) {
  if (!control?.persisted) return "empty";
  if (control.blockersCount > 0) return "blocked";
  if (["decision_ready", "closed"].includes(control.lifecycleStatus)) return "healthy";
  return "partial_evidence";
}

function dataTrustStatus(modelGovernance, outcomeMonitor) {
  if (!modelGovernance || !Object.keys(modelGovernance).length) return "empty";
  if (outcomeMonitor?.status === "alert" || outcomeMonitor?.status === "blocked") return "blocked";
  if (modelGovernance.registry?.promotionGate?.blocked === false) return "healthy";
  return "partial_evidence";
}

module.exports = {
  buildEnterpriseProductSurface,
  PRODUCT_SECTIONS,
  GAP_PHASES
};

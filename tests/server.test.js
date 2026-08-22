const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.MARGINLIFT_DB = path.join(os.tmpdir(), `marginlift-test-${Date.now()}.json`);
process.env.ARTIFACT_STORAGE_PATH = path.join(os.tmpdir(), `marginlift-artifacts-${Date.now()}`);
process.env.MARGINLIFT_FONT_DIR = path.join(os.tmpdir(), `marginlift-fonts-${Date.now()}`);
process.env.ARTIFACT_ENCRYPTION_KEY = "22".repeat(32);
process.env.MARGINLIFT_LOG_LEVEL = "silent";

const { start } = require("../src/server");

function waitForListening(server) {
  if (server.listening) return Promise.resolve();
  return new Promise(resolve => server.once("listening", resolve));
}

async function readResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

async function run() {
  const server = start(0);
  await waitForListening(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(route, options = {}) {
    const headers = {};
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.cookie) headers.Cookie = options.cookie;

    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    return {
      response,
      payload: await readResponse(response),
      cookie: response.headers.get("set-cookie")
    };
  }

  try {
    const health = await request("/api/health");
    assert.strictEqual(health.response.status, 200);
    assert.strictEqual(health.payload.data.status, "ok");
    assert.strictEqual(health.payload.data.service, "marginlift");
    assert.strictEqual(health.payload.data.storage, undefined);
    assert.strictEqual(health.response.headers.get("x-content-type-options"), "nosniff");
    assert.strictEqual(health.response.headers.get("x-frame-options"), "DENY");
    assert.match(health.response.headers.get("content-security-policy"), /default-src 'self'/);

    const publicConfig = await request("/api/public-config");
    assert.strictEqual(publicConfig.response.status, 200);
    assert.strictEqual(publicConfig.payload.data.publicSignupEnabled, true);

    const fontStatus = await request("/api/font-status");
    assert.strictEqual(fontStatus.response.status, 200);
    assert.strictEqual(fontStatus.payload.data.ready, false);
    assert.strictEqual(fontStatus.payload.data.activeFamily, "Vazirmatn");

    const healthHead = await request("/api/health", { method: "HEAD" });
    assert.strictEqual(healthHead.response.status, 200);

    const missingAllowedFile = await request("/docs/retention-decision-contract.md");
    assert.strictEqual(missingAllowedFile.response.status, 404);
    assert.strictEqual(missingAllowedFile.payload.error.code, "NOT_FOUND");

    const homeHead = await request("/", { method: "HEAD" });
    assert.strictEqual(homeHead.response.status, 200);
    assert.strictEqual(homeHead.payload, "");

    for (const page of ["/", "/login", "/signup", "/sales.html", "/styles-v2.css", "/styles-v3.css", "/styles-v4.css", "/fonts/marginlift-font.css", "/brand-mark.svg", "/executive-report-v3.css", "/motion.js", "/executive-report.html", "/executive-report.js", "/privacy.html", "/terms.html", "/security.html", "/pilot-data-request.html", "/vm-deployment.html", "/synthetic-ecommerce-transactions.csv", "/synthetic-subscription-transactions.csv", "/docs/vm-deployment.md", "/docs/model-governance.md", "/docs/demo-user-guide-fa.md"]) {
      const pageResponse = await request(page);
      assert.strictEqual(pageResponse.response.status, 200, `${page} should be public`);
    }

    const executiveReport = await request("/executive-report.html");
    assert.match(String(executiveReport.payload), /یادداشت تصمیم/);
    assert.match(String(executiveReport.payload), /evidencePassport/);

    const executiveReportStyles = await request("/executive-report-v3.css");
    assert.match(String(executiveReportStyles.payload), /\.report-sheet/);
    assert.match(String(executiveReportStyles.payload), /A4 portrait/);

    const publicHome = await request("/");
    assert(publicHome.payload.includes("تخفیف کمتر"));
    assert(publicHome.payload.includes("/marginlift-command-center.png"));

    const productLogin = await request("/login");
    assert(productLogin.payload.includes('id="authShell"'));
    assert(productLogin.payload.includes('id="appShell"'));
    assert(productLogin.payload.includes('id="presentationModeButton"'));
    assert(productLogin.payload.includes('id="presentationGuide"'));
    assert(productLogin.payload.includes('id="usabilityConsoleLink"'));

    const fontAsset = await request("/fonts/Estedad-Variable.woff2");
    assert.strictEqual(fontAsset.response.status, 200);
    assert.strictEqual(fontAsset.response.headers.get("content-type"), "font/woff2");
    const runtimeFontCss = await request("/fonts/marginlift-font.css");
    assert.match(String(runtimeFontCss.payload), /marginlift-font:vazirmatn/);
    const missingLicensedFont = await request("/fonts/IRANSansX-Variable.woff2");
    assert.strictEqual(missingLicensedFont.response.status, 404);
    assert.strictEqual(missingLicensedFont.payload.error.code, "LICENSED_FONT_NOT_READY");
    const anonymousUsabilityConsole = await request("/internal/usability-test");
    assert.strictEqual(anonymousUsabilityConsole.response.status, 401);

    const signup = await request("/api/auth/signup", {
      method: "POST",
      body: {
        email: `founder-${Date.now()}@marginlift.ir`,
        password: "pilotready"
      }
    });
    assert.strictEqual(signup.response.status, 201);
    assert.strictEqual(signup.payload.data.organization.name, "marginlift");
    assert.ok(signup.cookie);

    const login = await request("/api/auth/login", {
      method: "POST",
      body: {
        email: "growth@example.com",
        password: "demo1234"
      }
    });
    assert.strictEqual(login.response.status, 200);
    assert.ok(login.cookie);

    const cookie = login.cookie.split(";")[0];
    assert.match(cookie, /marginlift_session=[^.]+\.[A-Za-z0-9_-]+/);
    const tamperedCookie = `${cookie.slice(0, -1)}${cookie.endsWith("a") ? "b" : "a"}`;
    const tamperedSession = await request("/api/session", { cookie: tamperedCookie });
    assert.strictEqual(tamperedSession.response.status, 200);
    assert.strictEqual(tamperedSession.payload.data, null);

    const ownerUsabilityConsole = await request("/internal/usability-test", { cookie });
    assert.strictEqual(ownerUsabilityConsole.response.status, 200);
    assert.match(String(ownerUsabilityConsole.payload), /سه جلسه واقعی، یک تصمیم قابل دفاع/);
    assert.match(String(ownerUsabilityConsole.payload), /\/internal\/usability-session\.js/);
    const ownerUsabilityScript = await request("/internal/usability-session.js", { cookie });
    assert.strictEqual(ownerUsabilityScript.response.status, 200);
    assert.match(String(ownerUsabilityScript.payload), /MarginLiftUsability/);

    const memberEmail = `viewer-${Date.now()}@marginlift.ir`;
    const member = await request("/api/access/members", {
      method: "POST",
      cookie,
      body: { email: memberEmail, password: "viewer-password-2026", role: "viewer", name: "QA Viewer" }
    });
    assert.strictEqual(member.response.status, 201);
    assert.strictEqual(member.payload.data.role, "viewer");

    const viewerLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email: memberEmail, password: "viewer-password-2026" }
    });
    const viewerCookie = viewerLogin.cookie.split(";")[0];
    const viewerRead = await request("/api/customers/current", { cookie: viewerCookie });
    assert.strictEqual(viewerRead.response.status, 200);
    const viewerWrite = await request("/api/imports/csv", {
      method: "POST",
      cookie: viewerCookie,
      body: { csvText: "customer_id,treatment,outcome_revenue_toman\n1,control,0" }
    });
    assert.strictEqual(viewerWrite.response.status, 403);
    assert.strictEqual(viewerWrite.payload.error.code, "INSUFFICIENT_ROLE");
    const viewerOps = await request("/api/ops/metrics", { cookie: viewerCookie });
    assert.strictEqual(viewerOps.response.status, 403);
    const viewerUsabilityConsole = await request("/internal/usability-test", { cookie: viewerCookie });
    assert.strictEqual(viewerUsabilityConsole.response.status, 403);

    const fallbackContract = await request("/api/pilot/decision-contract", { cookie: viewerCookie });
    assert.strictEqual(fallbackContract.response.status, 200);
    assert.strictEqual(fallbackContract.payload.data.persisted, false);
    assert.strictEqual(fallbackContract.payload.data.lifecycleStatus, "draft");

    const viewerContractCreate = await request("/api/pilot/decision-contract", {
      method: "POST",
      cookie: viewerCookie,
      body: {
        businessObjective: "Viewer should not be able to create a pilot contract.",
        primaryKpi: {
          key: "incremental_profit_per_customer",
          label: "Incremental profit per assigned customer",
          baselineValue: 100000,
          targetValue: 125000,
          unit: "toman",
          direction: "increase",
          measurementMethod: "intention_to_treat",
          dataSource: "outcome_csv",
          measurementWindow: { days: 30 }
        }
      }
    });
    assert.strictEqual(viewerContractCreate.response.status, 403);
    assert.strictEqual(viewerContractCreate.payload.error.code, "INSUFFICIENT_ROLE");

    const createdContract = await request("/api/pilot/decision-contract", {
      method: "POST",
      cookie,
      body: {
        businessObjective: "Prove targeted retention offers increase incremental profit before enterprise rollout.",
        primaryKpi: {
          key: "incremental_profit_per_customer",
          label: "Incremental profit per assigned customer",
          baselineValue: 100000,
          targetValue: 125000,
          unit: "toman",
          direction: "increase",
          measurementMethod: "intention_to_treat",
          dataSource: "outcome_csv",
          measurementWindow: { days: 30 }
        },
        guardrails: [
          { metric: "refund_rate", threshold: "<= 3%", status: "draft" }
        ],
        ownership: {
          sponsor: "CRO",
          businessOwner: "Lifecycle Lead",
          dataOwner: "Data Lead",
          financeOwner: "Finance Lead",
          marginliftOwner: "MarginLift Principal"
        },
        decisionDeadline: "2026-09-22T00:00:00.000Z"
      }
    });
    assert.strictEqual(createdContract.response.status, 201);
    assert.strictEqual(createdContract.payload.data.persisted, true);
    assert.strictEqual(createdContract.payload.data.organizationId, login.payload.data.organization.id);
    assert.strictEqual(createdContract.payload.data.primaryKpi.measurementWindow.days, 30);

    const viewerContractRead = await request("/api/pilot/decision-contract", { cookie: viewerCookie });
    assert.strictEqual(viewerContractRead.response.status, 200);
    assert.strictEqual(viewerContractRead.payload.data.persisted, true);

    const viewerContractUpdate = await request("/api/pilot/decision-contract", {
      method: "PATCH",
      cookie: viewerCookie,
      body: { lifecycleStatus: "approved" }
    });
    assert.strictEqual(viewerContractUpdate.response.status, 403);
    assert.strictEqual(viewerContractUpdate.payload.error.code, "INSUFFICIENT_ROLE");

    const approvedContract = await request("/api/pilot/decision-contract", {
      method: "PATCH",
      cookie,
      body: {
        lifecycleStatus: "approved",
        metadata: { reason: "Sponsor approved baseline and target." }
      }
    });
    assert.strictEqual(approvedContract.response.status, 200);
    assert.strictEqual(approvedContract.payload.data.lifecycleStatus, "approved");
    assert.strictEqual(approvedContract.payload.data.approval.status, "approved");
    assert.ok(approvedContract.payload.data.approval.approvalHistory.some(item => item.action === "approval_status_changed"));

    const skippedContractTransition = await request("/api/pilot/decision-contract", {
      method: "PATCH",
      cookie,
      body: { lifecycleStatus: "outcome_review" }
    });
    assert.strictEqual(skippedContractTransition.response.status, 409);
    assert.strictEqual(skippedContractTransition.payload.error.code, "INVALID_LIFECYCLE_TRANSITION");

    const lockedContract = await request("/api/pilot/decision-contract", {
      method: "PATCH",
      cookie,
      body: {
        lifecycleStatus: "locked",
        metadata: { reason: "Contract frozen before experiment launch." }
      }
    });
    assert.strictEqual(lockedContract.response.status, 200);
    assert.strictEqual(lockedContract.payload.data.lifecycleStatus, "locked");

    const lockedContractMutation = await request("/api/pilot/decision-contract", {
      method: "PATCH",
      cookie,
      body: {
        primaryKpi: { targetValue: 150000 }
      }
    });
    assert.strictEqual(lockedContractMutation.response.status, 409);
    assert.strictEqual(lockedContractMutation.payload.error.code, "PILOT_CONTRACT_LOCKED");

    const fallbackBusinessImpact = await request("/api/pilot/business-impact", { cookie: viewerCookie });
    assert.strictEqual(fallbackBusinessImpact.response.status, 200);
    assert.strictEqual(fallbackBusinessImpact.payload.data.persisted, false);

    const viewerBusinessImpactCreate = await request("/api/pilot/business-impact", {
      method: "POST",
      cookie: viewerCookie,
      body: {
        financialObjective: "Viewer should not create finance evidence.",
        impactModel: { metric: "incremental_profit", baselineValue: 100000, observedValue: 125000 },
        roi: { investmentCost: 10000, grossValue: 25000 }
      }
    });
    assert.strictEqual(viewerBusinessImpactCreate.response.status, 403);
    assert.strictEqual(viewerBusinessImpactCreate.payload.error.code, "INSUFFICIENT_ROLE");

    const createdBusinessImpact = await request("/api/pilot/business-impact", {
      method: "POST",
      cookie,
      body: {
        pilotContractId: createdContract.payload.data.id,
        financialObjective: "Prove the pilot generated enough incremental profit to scale.",
        impactModel: {
          metric: "incremental_profit",
          baselineValue: 100000,
          observedValue: 140000,
          unit: "toman",
          calculationMethod: "observed_minus_baseline"
        },
        forecast: {
          predictedImpact: 40000,
          confidenceLevel: "medium",
          assumptions: ["Stable holdout", "No concurrent pricing change"]
        },
        realizedImpact: {
          measuredImpact: 0,
          measurementWindow: { days: 30 },
          evidenceSource: null
        },
        roi: {
          investmentCost: 10000,
          grossValue: 40000
        }
      }
    });
    assert.strictEqual(createdBusinessImpact.response.status, 201);
    assert.strictEqual(createdBusinessImpact.payload.data.persisted, true);
    assert.strictEqual(createdBusinessImpact.payload.data.organizationId, login.payload.data.organization.id);
    assert.strictEqual(createdBusinessImpact.payload.data.roi.netValue, 30000);
    assert.strictEqual(createdBusinessImpact.payload.data.financeValidation.status, "not_verified");

    const viewerBusinessImpactRead = await request("/api/pilot/business-impact", { cookie: viewerCookie });
    assert.strictEqual(viewerBusinessImpactRead.response.status, 200);
    assert.strictEqual(viewerBusinessImpactRead.payload.data.persisted, true);

    const viewerBusinessImpactPatch = await request("/api/pilot/business-impact", {
      method: "PATCH",
      cookie: viewerCookie,
      body: { action: "submit" }
    });
    assert.strictEqual(viewerBusinessImpactPatch.response.status, 403);
    assert.strictEqual(viewerBusinessImpactPatch.payload.error.code, "INSUFFICIENT_ROLE");

    const directVerifiedImpact = await request("/api/pilot/business-impact", {
      method: "PATCH",
      cookie,
      body: {
        action: "verify",
        financeValidation: {
          verifiedBy: "finance_lead",
          verifiedAt: "2026-09-22T00:00:00.000Z"
        }
      }
    });
    assert.strictEqual(directVerifiedImpact.response.status, 409);
    assert.strictEqual(directVerifiedImpact.payload.error.code, "INVALID_BUSINESS_IMPACT_TRANSITION");

    const submittedBusinessImpact = await request("/api/pilot/business-impact", {
      method: "PATCH",
      cookie,
      body: {
        action: "submit",
        metadata: { reason: "Finance evidence package submitted." }
      }
    });
    assert.strictEqual(submittedBusinessImpact.response.status, 200);
    assert.strictEqual(submittedBusinessImpact.payload.data.lifecycleStatus, "submitted");
    assert.strictEqual(submittedBusinessImpact.payload.data.financeValidation.status, "submitted");

    const missingEvidenceVerification = await request("/api/pilot/business-impact", {
      method: "PATCH",
      cookie,
      body: {
        action: "verify",
        financeValidation: {
          verifiedBy: "finance_lead",
          verifiedAt: "2026-09-22T00:00:00.000Z"
        }
      }
    });
    assert.strictEqual(missingEvidenceVerification.response.status, 400);
    assert.strictEqual(missingEvidenceVerification.payload.error.code, "FINANCE_EVIDENCE_SOURCE_REQUIRED");

    const verifiedBusinessImpact = await request("/api/pilot/business-impact", {
      method: "PATCH",
      cookie,
      body: {
        action: "verify",
        realizedImpact: {
          measuredImpact: 36000,
          measurementWindow: { days: 30 },
          evidenceSource: "finance-reviewed-outcome-v1.csv"
        },
        roi: {
          investmentCost: 10000,
          grossValue: 36000
        },
        financeValidation: {
          verifiedBy: "finance_lead",
          verifiedAt: "2026-09-22T00:00:00.000Z",
          notes: "Matched finance export."
        },
        metadata: { evidenceSource: "finance-reviewed-outcome-v1.csv" }
      }
    });
    assert.strictEqual(verifiedBusinessImpact.response.status, 200);
    assert.strictEqual(verifiedBusinessImpact.payload.data.lifecycleStatus, "verified");
    assert.strictEqual(verifiedBusinessImpact.payload.data.financeValidation.status, "verified");
    assert.strictEqual(verifiedBusinessImpact.payload.data.roi.netValue, 26000);
    assert.ok(verifiedBusinessImpact.payload.data.auditEvents.some(item => item.action === "finance_validation_transition" && item.from === "submitted" && item.to === "verified"));

    const pilotWorkspaceWithImpact = await request("/api/pilot/workspace", { cookie });
    assert.strictEqual(pilotWorkspaceWithImpact.response.status, 200);
    assert.strictEqual(pilotWorkspaceWithImpact.payload.data.businessImpactSummary.persisted, true);
    assert.strictEqual(pilotWorkspaceWithImpact.payload.data.businessImpactSummary.financeVerification, "verified");

    const fallbackControlRoom = await request("/api/pilot/control-room", { cookie: viewerCookie });
    assert.strictEqual(fallbackControlRoom.response.status, 200);
    assert.strictEqual(fallbackControlRoom.payload.data.persisted, false);

    const viewerControlCreate = await request("/api/pilot/control-room", {
      method: "POST",
      cookie: viewerCookie,
      body: {
        pilotContractId: createdContract.payload.data.id,
        businessImpactLedgerId: createdBusinessImpact.payload.data.id
      }
    });
    assert.strictEqual(viewerControlCreate.response.status, 403);
    assert.strictEqual(viewerControlCreate.payload.error.code, "INSUFFICIENT_ROLE");

    const createdControlRoom = await request("/api/pilot/control-room", {
      method: "POST",
      cookie,
      body: {
        pilotContractId: createdContract.payload.data.id,
        businessImpactLedgerId: createdBusinessImpact.payload.data.id,
        milestones: [
          { name: "Executive decision readout", targetDate: "2026-09-22", status: "pending" }
        ]
      }
    });
    assert.strictEqual(createdControlRoom.response.status, 201);
    assert.strictEqual(createdControlRoom.payload.data.persisted, true);
    assert.strictEqual(createdControlRoom.payload.data.organizationId, login.payload.data.organization.id);
    assert.strictEqual(createdControlRoom.payload.data.lifecycleStatus, "draft");
    assert.strictEqual(createdControlRoom.payload.data.stages.length, 7);

    const viewerControlPatch = await request("/api/pilot/control-room", {
      method: "PATCH",
      cookie: viewerCookie,
      body: { action: "transition_stage", lifecycleStatus: "kickoff" }
    });
    assert.strictEqual(viewerControlPatch.response.status, 403);
    assert.strictEqual(viewerControlPatch.payload.error.code, "INSUFFICIENT_ROLE");

    const skippedControlTransition = await request("/api/pilot/control-room", {
      method: "PATCH",
      cookie,
      body: { action: "transition_stage", lifecycleStatus: "data_ready" }
    });
    assert.strictEqual(skippedControlTransition.response.status, 409);
    assert.strictEqual(skippedControlTransition.payload.error.code, "INVALID_PILOT_WORKFLOW_TRANSITION");

    const kickoffControlRoom = await request("/api/pilot/control-room", {
      method: "PATCH",
      cookie,
      body: {
        action: "transition_stage",
        lifecycleStatus: "kickoff",
        metadata: { reason: "Pilot kickoff complete." }
      }
    });
    assert.strictEqual(kickoffControlRoom.response.status, 200);
    assert.strictEqual(kickoffControlRoom.payload.data.lifecycleStatus, "kickoff");
    assert.ok(kickoffControlRoom.payload.data.auditEvents.some(item => item.action === "pilot_stage_transition" && item.from === "draft" && item.to === "kickoff"));

    const evidenceControlRoom = await request("/api/pilot/control-room", {
      method: "PATCH",
      cookie,
      body: {
        action: "append_evidence",
        stageKey: "kickoff",
        evidence: {
          label: "Signed pilot kickoff notes",
          referenceId: "doc_kickoff"
        }
      }
    });
    assert.strictEqual(evidenceControlRoom.response.status, 200);
    assert.strictEqual(evidenceControlRoom.payload.data.stages.find(item => item.key === "kickoff").evidence.length, 1);

    const blockedControlRoom = await request("/api/pilot/control-room", {
      method: "PATCH",
      cookie,
      body: {
        action: "add_blocker",
        description: "Finance export delivery is delayed.",
        ownerId: "finance_lead",
        severity: "high"
      }
    });
    assert.strictEqual(blockedControlRoom.response.status, 200);
    assert.strictEqual(blockedControlRoom.payload.data.blockers.length, 1);
    assert.ok(blockedControlRoom.payload.data.auditEvents.some(item => item.action === "pilot_blocker_added"));

    const resolvedControlRoom = await request("/api/pilot/control-room", {
      method: "PATCH",
      cookie,
      body: {
        action: "update_blocker",
        blockerId: blockedControlRoom.payload.data.blockers[0].id,
        updates: {
          status: "resolved"
        }
      }
    });
    assert.strictEqual(resolvedControlRoom.response.status, 200);
    assert.strictEqual(resolvedControlRoom.payload.data.blockers[0].status, "resolved");

    const pilotWorkspaceWithControl = await request("/api/pilot/workspace", { cookie });
    assert.strictEqual(pilotWorkspaceWithControl.response.status, 200);
    assert.strictEqual(pilotWorkspaceWithControl.payload.data.pilotControlSummary.persisted, true);
    assert.strictEqual(pilotWorkspaceWithControl.payload.data.pilotControlSummary.lifecycleStatus, "kickoff");
    assert.strictEqual(pilotWorkspaceWithControl.payload.data.pilotControlSummary.blockersCount, 0);

    const expiredMemberEmail = `expired-${Date.now()}@marginlift.ir`;
    const expiredMember = await request("/api/access/members", {
      method: "POST",
      cookie,
      body: { email: expiredMemberEmail, password: "expired-password-2026", role: "viewer", name: "Expired Viewer" }
    });
    assert.strictEqual(expiredMember.response.status, 201);
    const testDb = JSON.parse(fs.readFileSync(process.env.MARGINLIFT_DB, "utf8"));
    const expiredUser = testDb.users.find(item => item.email === expiredMemberEmail);
    expiredUser.accessExpiresAt = "2020-01-01T00:00:00.000Z";
    fs.writeFileSync(process.env.MARGINLIFT_DB, JSON.stringify(testDb), "utf8");
    const expiredLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email: expiredMemberEmail, password: "expired-password-2026" }
    });
    assert.strictEqual(expiredLogin.response.status, 403);
    assert.strictEqual(expiredLogin.payload.error.code, "ACCESS_EXPIRED");

    const members = await request("/api/access/members", { cookie });
    assert.strictEqual(members.response.status, 200);
    assert.ok(members.payload.data.some(item => item.id === member.payload.data.id));
    const promoteMember = await request(`/api/access/members/${member.payload.data.id}`, {
      method: "PATCH",
      cookie,
      body: { role: "analyst" }
    });
    assert.strictEqual(promoteMember.response.status, 200);
    assert.strictEqual(promoteMember.payload.data.role, "analyst");

    const auditLog = await request("/api/audit-log", { cookie });
    assert.strictEqual(auditLog.response.status, 200);
    assert.strictEqual(auditLog.payload.data.integrity.valid, true);
    assert.ok(auditLog.payload.data.entries.some(item => item.action === "workspace_member_role_changed"));

    const opsMetrics = await request("/api/ops/metrics", { cookie });
    assert.strictEqual(opsMetrics.response.status, 200);
    assert.ok(opsMetrics.payload.data.requests > 0);
    const artifacts = await request("/api/artifacts", { cookie });
    assert.strictEqual(artifacts.response.status, 200);
    assert.deepStrictEqual(artifacts.payload.data, []);
    const event = await request("/api/events", {
      method: "POST",
      cookie,
      body: {
        event: "campaign_imported",
        properties: {
          campaign_name: "Integration test",
          has_file: true
        }
      }
    });
    assert.strictEqual(event.response.status, 201);

    const summary = await request("/api/events/summary", { cookie });
    assert.strictEqual(summary.response.status, 200);
    assert.ok(summary.payload.data.totalEvents >= 1);
    assert.ok(summary.payload.data.funnel.some(item => item.event === "campaign_imported" && item.count >= 1));
    assert.ok(summary.payload.data.latest.some(item => item.event === "campaign_imported"));

    const overview = await request("/api/decision-engine/overview", { cookie });
    assert.strictEqual(overview.response.status, 200);
    assert.strictEqual(overview.payload.data.decisionQueue.length, 4);
    assert.match(overview.payload.data.contract.churnDefinitionFa, /۳۰ روز/);
    assert.ok(overview.payload.data.upliftLab);
    assert.ok(overview.payload.data.upliftLab.qiniCurve.length >= 1);
    assert.ok(overview.payload.data.upliftLab.reactionMix.some(item => item.label === "Persuadables"));
    assert.ok(overview.payload.data.upliftLab.treatmentComparison.some(item => item.key === "control"));

    const customers = await request("/api/customers/current", { cookie });
    assert.strictEqual(customers.response.status, 200);
    assert.ok(customers.payload.data.customer360.length >= 1);
    assert.ok(customers.payload.data.summary.targetableCustomers >= 1);
    assert.strictEqual(customers.payload.data.model.unitFa, "customer_id");

    const retentionConfiguration = await request("/api/retention/configuration", { cookie });
    assert.strictEqual(retentionConfiguration.response.status, 200);
    assert.strictEqual(retentionConfiguration.payload.data.configuration.presetKey, "super_app_packages");
    assert.ok(retentionConfiguration.payload.data.presets.length >= 2);

    const behavioralWorkspace = await request("/api/behavioral/workspace", { cookie: viewerCookie });
    assert.strictEqual(behavioralWorkspace.response.status, 200);
    assert.strictEqual(behavioralWorkspace.payload.data.individualPsychologyInference, false);
    assert.ok(behavioralWorkspace.payload.data.candidates.every(item => item.evidenceLevel === "hypothesis_only"));
    assert.ok(behavioralWorkspace.payload.data.ethicalContract.some(item => item.key === "frequency_cap" && item.status === "blocked"));

    const retentionConfigurationUpdate = await request("/api/retention/configuration", {
      method: "PATCH",
      cookie,
      body: {
        presetKey: "super_app_packages",
        display: { purchaseObjectFa: "بسته اینترنت آزمایشی" },
        readiness: { minimumHistoryDays: 30, minimumCustomers: 10, minimumRepeatCustomers: 5 }
      }
    });
    assert.strictEqual(retentionConfigurationUpdate.response.status, 200);
    assert.strictEqual(retentionConfigurationUpdate.payload.data.configuration.display.purchaseObjectFa, "بسته اینترنت آزمایشی");

    const retentionCsv = fs.readFileSync(path.join(__dirname, "..", "synthetic-package-transactions.csv"), "utf8");
    const retentionPreview = await request("/api/retention/preview", {
      method: "POST",
      cookie,
      body: { csvText: retentionCsv, cutoff: "2026-02-01T00:00:00Z" }
    });
    assert.strictEqual(retentionPreview.response.status, 200);
    assert.strictEqual(retentionPreview.payload.data.readyForImport, true);
    assert.strictEqual(retentionPreview.payload.data.mapping.customerId, "customer_id_hash");
    assert.strictEqual(retentionPreview.payload.data.privacy.blocked, false);

    const piiRetentionPreview = await request("/api/retention/preview", {
      method: "POST",
      cookie,
      body: { csvText: "customer_id_hash,transaction_id,purchased_at,paid_amount,email\nhash_1,txn_1,2026-01-01,100000,person@example.com" }
    });
    assert.strictEqual(piiRetentionPreview.response.status, 200);
    assert.strictEqual(piiRetentionPreview.payload.data.readyForImport, false);
    assert.strictEqual(piiRetentionPreview.payload.data.privacy.blocked, true);

    const retentionImport = await request("/api/retention/import", {
      method: "POST",
      cookie,
      body: { name: "تحلیل نگهداشت تست", csvText: retentionCsv, cutoff: "2026-02-01T00:00:00Z" }
    });
    assert.strictEqual(retentionImport.response.status, 201);
    assert.strictEqual(retentionImport.payload.data.workspace.evidenceLevel, "observational_baseline");
    assert.ok(retentionImport.payload.data.workspace.queue.every(item => item.incentiveAllowed === false));

    const retentionWorkspace = await request("/api/retention/workspace", { cookie });
    assert.strictEqual(retentionWorkspace.response.status, 200);
    assert.strictEqual(retentionWorkspace.payload.data.stale, false);
    assert.strictEqual(retentionWorkspace.payload.data.analysis.name, "تحلیل نگهداشت تست");
    assert.strictEqual(retentionWorkspace.payload.data.analysis.baseline.leakageAudit.passed, true);
    assert.strictEqual(retentionWorkspace.payload.data.analysis.baseline.modelCard.decisionPermission, "shadow_only");
    assert.strictEqual(retentionWorkspace.payload.data.workspace.contactSafety.contractReady, true);
    assert.ok(retentionWorkspace.payload.data.workspace.contactSafety.summary.actionAllowed >= 1);

    const contactPolicyWorkspace = await request("/api/contact-policy/workspace", { cookie: viewerCookie });
    assert.strictEqual(contactPolicyWorkspace.response.status, 200);
    assert.strictEqual(contactPolicyWorkspace.payload.data.enforcement, "server_side_fail_closed");
    assert.strictEqual(contactPolicyWorkspace.payload.data.contractReady, true);

    const retentionAudience = await request("/api/retention/audience.csv", { cookie });
    assert.strictEqual(retentionAudience.response.status, 200);
    assert.match(String(retentionAudience.payload), /customer_id_hash,state,days_from_due/);
    assert.match(String(retentionAudience.payload), /preferred_channel,contact_count_30d,action_allowed/);
    assert.match(String(retentionAudience.payload), /observational_baseline/);
    assert.match(String(retentionAudience.payload), /true,false,observational_baseline/);

    for (const role of ["executive", "crm", "finance", "data"]) {
      const readout = await request(`/api/retention/readout.md?role=${role}`, { cookie });
      assert.strictEqual(readout.response.status, 200);
      assert.match(String(readout.payload), /مرز ادعا/);
      assert.match(String(readout.payload), /holdout/);
    }

    const shadowRun = await request("/api/retention/shadow-runs", {
      method: "POST",
      cookie,
      body: { capacity: 3 }
    });
    assert.strictEqual(shadowRun.response.status, 201);
    assert.strictEqual(shadowRun.payload.data.liveActionAllowed, false);
    assert.ok(shadowRun.payload.data.summary.selectedCustomers <= 3);

    const shadowWorkspace = await request("/api/retention/shadow-workspace", { cookie });
    assert.strictEqual(shadowWorkspace.response.status, 200);
    assert.strictEqual(shadowWorkspace.payload.data.latestRun.id, shadowRun.payload.data.id);

    const retentionBrief = await request("/api/retention/experiment-brief.md?baselineRate=0.2&minimumDetectableEffect=0.03&outcomeWindowDays=30&holdoutRate=0.2", { cookie });
    assert.strictEqual(retentionBrief.response.status, 200);
    assert.match(String(retentionBrief.payload), /Intention-To-Treat/);
    assert.match(String(retentionBrief.payload), /مرز ادعا/);

    const demoScenario = await request("/api/retention/demo/reset", {
      method: "POST",
      cookie,
      body: { presetKey: "subscription_services" }
    });
    assert.strictEqual(demoScenario.response.status, 201);
    assert.strictEqual(demoScenario.payload.data.isDemoScenario, true);
    assert.strictEqual(demoScenario.payload.data.configuration.presetKey, "subscription_services");

    const experiment = await request("/api/experiments/plan", { cookie });
    assert.strictEqual(experiment.response.status, 200);
    assert.ok(experiment.payload.data.sampleSize.perGroup >= 50);
    assert.ok(experiment.payload.data.guardrailsFa.length >= 3);

    const finance = await request("/api/finance/summary", { cookie });
    assert.strictEqual(finance.response.status, 200);
    assert.ok(finance.payload.data.expectedIncrementalProfit >= 0);

    const audienceExport = await request("/api/exports/audience.csv", { cookie });
    assert.strictEqual(audienceExport.response.status, 409);
    assert.strictEqual(audienceExport.payload.error.code, "CONTACT_SAFETY_CONTRACT_REQUIRED");

    const customerCsv = fs.readFileSync(path.join(__dirname, "..", "synthetic-customer-events.csv"), "utf8");
    const preview = await request("/api/imports/preview", {
      method: "POST",
      cookie,
      body: {
        csvText: customerCsv
      }
    });
    assert.strictEqual(preview.response.status, 200);
    assert.strictEqual(preview.payload.data.detectedType, "customer");
    assert.strictEqual(preview.payload.data.ready, true);

    const smartImport = await request("/api/imports/csv", {
      method: "POST",
      cookie,
      body: {
        name: "Customer import test",
        csvText: customerCsv
      }
    });
    assert.strictEqual(smartImport.response.status, 201);
    assert.strictEqual(smartImport.payload.data.type, "customer");
    assert.ok(smartImport.payload.data.analysis.summary.targetableCustomers >= 1);
    assert.ok(smartImport.payload.data.analysis.experimentId);
    assert.strictEqual(smartImport.payload.data.analysis.modelGovernance.backtest.status, "insufficient_sample");

    const storedArtifacts = await request("/api/artifacts", { cookie });
    assert.strictEqual(storedArtifacts.response.status, 200);
    assert.ok(storedArtifacts.payload.data.length >= 2);
    const customerArtifact = storedArtifacts.payload.data.find(item => item.type === "customer_csv");
    assert.strictEqual(customerArtifact.encryption, "aes-256-gcm");
    const artifactDownload = await request(`/api/artifacts/${customerArtifact.id}/download`, { cookie });
    assert.strictEqual(artifactDownload.response.status, 200);
    assert.ok(String(artifactDownload.payload).includes("customer_id"));
    const artifactDelete = await request(`/api/artifacts/${customerArtifact.id}`, {
      method: "DELETE",
      cookie
    });
    assert.strictEqual(artifactDelete.response.status, 200);
    assert.strictEqual(artifactDelete.payload.data.deleted, true);

    const governanceAfterImport = await request("/api/model-governance/overview", { cookie });
    assert.strictEqual(governanceAfterImport.response.status, 200);
    assert.strictEqual(governanceAfterImport.payload.data.modelGovernance.dataSnapshot.rowCount, 12);
    assert.strictEqual(governanceAfterImport.payload.data.modelGovernance.dataSnapshot.profile, undefined);
    assert.strictEqual(governanceAfterImport.payload.data.modelGovernance.registry.promotionGate.eligible, false);
    assert.strictEqual(governanceAfterImport.payload.data.decisionLedger.integrity.valid, true);
    assert.ok(governanceAfterImport.payload.data.decisionLedger.entries.some(item => item.eventType === "model_evaluation_completed"));

    const currentExperiment = await request("/api/experiments/current", { cookie });
    assert.strictEqual(currentExperiment.response.status, 200);
    assert.strictEqual(currentExperiment.payload.data.id, smartImport.payload.data.analysis.experimentId);
    assert.ok(currentExperiment.payload.data.dataset.hash.startsWith("sha256:"));
    assert.strictEqual(currentExperiment.payload.data.assignmentSummary.total, 12);
    assert.strictEqual(currentExperiment.payload.data.assignments, undefined);
    assert.strictEqual(currentExperiment.payload.data.assignmentIntegrity.duplicateCustomerIds, undefined);
    assert.strictEqual(currentExperiment.payload.data.design.randomizationEvidence.verified, false);

    const history = await request("/api/analyses/history", { cookie });
    assert.strictEqual(history.response.status, 200);
    assert.ok(history.payload.data.some(item => item.type === "customer"));

    const pilotPackage = await request("/api/pilot/package.md", { cookie });
    assert.strictEqual(pilotPackage.response.status, 200);
    assert.ok(String(pilotPackage.payload).includes("# بسته پایلوت MarginLift"));

    const readiness = await request("/api/readiness/current", { cookie });
    assert.strictEqual(readiness.response.status, 200);
    assert.strictEqual(readiness.payload.data.status, "ready");
    assert.ok(readiness.payload.data.checks.some(item => item.key === "control" && item.passed));

    const pilotWorkspaceBeforeOutcome = await request("/api/pilot/workspace", { cookie });
    assert.strictEqual(pilotWorkspaceBeforeOutcome.response.status, 200);
    assert.ok(pilotWorkspaceBeforeOutcome.payload.data.savingsSnapshot.expectedIncrementalProfit >= 0);
    assert.ok(pilotWorkspaceBeforeOutcome.payload.data.workspace.steps.some(item => item.key === "outcome_received" && !item.complete));

    const outcomeCsv = fs.readFileSync(path.join(__dirname, "..", "synthetic-outcome-data.csv"), "utf8");
    const unlinkedOutcome = await request("/api/outcomes/import", {
      method: "POST",
      cookie,
      body: { name: "Unlinked outcome", csvText: outcomeCsv }
    });
    assert.strictEqual(unlinkedOutcome.response.status, 400);
    assert.strictEqual(unlinkedOutcome.payload.error.code, "EXPERIMENT_ID_REQUIRED");

    const outcomeLines = outcomeCsv.trim().split(/\r?\n/);
    const duplicateOutcomeCsv = `${outcomeLines.join("\n")}\n${outcomeLines[1]}\n`;
    const duplicateOutcome = await request("/api/outcomes/import", {
      method: "POST",
      cookie,
      body: {
        name: "Duplicate outcome",
        csvText: duplicateOutcomeCsv,
        experimentId: currentExperiment.payload.data.id
      }
    });
    assert.strictEqual(duplicateOutcome.response.status, 422);
    assert.strictEqual(duplicateOutcome.payload.error.code, "OUTCOME_INTEGRITY_REJECTED");

    const outcomeImport = await request("/api/outcomes/import", {
      method: "POST",
      cookie,
      body: {
        name: "Outcome import test",
        csvText: outcomeCsv,
        experimentId: currentExperiment.payload.data.id
      }
    });
    assert.strictEqual(outcomeImport.response.status, 201);
    assert.strictEqual(outcomeImport.payload.data.summary.decisionStatus, "needs_review");
    assert.strictEqual(outcomeImport.payload.data.experimentId, currentExperiment.payload.data.id);
    assert.strictEqual(outcomeImport.payload.data.version, 1);
    assert.strictEqual(outcomeImport.payload.data.supersedesOutcomeId, null);
    assert.strictEqual(outcomeImport.payload.data.integrity.status, "needs_review");
    assert.ok(outcomeImport.payload.data.integrity.checks.some(item => item.key === "randomization" && !item.passed));

    const revisedOutcomeImport = await request("/api/outcomes/import", {
      method: "POST",
      cookie,
      body: {
        name: "Outcome import revision",
        csvText: outcomeCsv,
        experimentId: currentExperiment.payload.data.id
      }
    });
    assert.strictEqual(revisedOutcomeImport.response.status, 201);
    assert.strictEqual(revisedOutcomeImport.payload.data.version, 2);
    assert.strictEqual(revisedOutcomeImport.payload.data.supersedesOutcomeId, outcomeImport.payload.data.id);

    const pilotWorkspaceAfterOutcome = await request("/api/pilot/workspace", { cookie });
    assert.strictEqual(pilotWorkspaceAfterOutcome.response.status, 200);
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.workspace.steps.some(item => item.key === "outcome_received" && item.complete));
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.workspace.steps.some(item => item.key === "scale_stop" && item.statusFa === "نیازمند اصلاح شواهد"));
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.savingsSnapshot.claimLevel, "pilot_observation");
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.savingsSnapshot.revenueAtRisk, null);
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.readiness.claimLadder.length, 4);
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.outcome.summary.evidenceStatus, "descriptive_only");
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.outcome.version, 2);
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.outcome.provenance.outcomeVersion, 2);
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.outcome.statistics.primary);
    assert.strictEqual(pilotWorkspaceAfterOutcome.payload.data.outcome.summary.primaryEstimatePerCustomer !== undefined, true);
    assert.ok(pilotWorkspaceAfterOutcome.payload.data.outcome.integrity.checks.some(item => item.key === "preregistration" && !item.passed));

    const readout = await request("/api/pilot/readout.md", { cookie });
    assert.strictEqual(readout.response.status, 200);
    assert.ok(String(readout.payload).includes("# گزارش پایلوت MarginLift"));
    assert.ok(String(readout.payload).includes("## شناسنامه و سلامت آزمایش"));
    assert.ok(String(readout.payload).includes("## نتیجه آماری و عدم‌قطعیت"));
    assert.ok(String(readout.payload).includes("## سلامت و حاکمیت مدل"));
    assert.ok(String(readout.payload).includes(currentExperiment.payload.data.id));
    assert.ok(String(readout.payload).includes("بازبینی"));
    assert.ok(String(readout.payload).includes("تأییدنشده"));

    const report = await request("/api/campaigns/current/report", { cookie });
    assert.strictEqual(report.response.status, 200);
    assert.ok(String(report.payload).includes("# گزارش MarginLift"));

    const registeredExperiment = await request("/api/experiments/register", {
      method: "POST",
      cookie,
      body: { name: "Prospective server-generated pilot", holdoutRate: 0.2, outcomeWindowDays: 30 }
    });
    assert.strictEqual(registeredExperiment.response.status, 201);
    assert.strictEqual(registeredExperiment.payload.data.status, "registered");
    assert.strictEqual(registeredExperiment.payload.data.design.randomizationEvidence.verified, true);
    assert.strictEqual(registeredExperiment.payload.data.design.randomizationEvidence.source, "server_generated");
    assert.strictEqual(registeredExperiment.payload.data.assignments, undefined);
    assert.strictEqual(registeredExperiment.payload.data.randomizationSeed, undefined);
    const persistedExperiment = JSON.parse(fs.readFileSync(process.env.MARGINLIFT_DB, "utf8"))
      .experiments.find(item => item.id === registeredExperiment.payload.data.id);
    assert.match(persistedExperiment.randomizationSeed, /^[a-f0-9]{64}$/);
    assert.strictEqual(
      `sha256:${require("crypto").createHash("sha256").update(persistedExperiment.randomizationSeed).digest("hex")}`,
      persistedExperiment.design.randomizationEvidence.seedHash
    );

    const governanceAfterRegistration = await request("/api/model-governance/overview", { cookie });
    assert.strictEqual(governanceAfterRegistration.response.status, 200);
    assert.strictEqual(governanceAfterRegistration.payload.data.decisionLedger.integrity.valid, true);
    assert.ok(governanceAfterRegistration.payload.data.decisionLedger.entries.some(item => item.eventType === "experiment_registered"));

    const ledger = await request("/api/decision-ledger", { cookie });
    assert.strictEqual(ledger.response.status, 200);
    assert.strictEqual(ledger.payload.data.integrity.valid, true);
    assert.ok(ledger.payload.data.entries.some(item => item.eventType === "outcome_evaluated"));

    const assignmentExport = await request("/api/experiments/current/assignments.csv", { cookie });
    assert.strictEqual(assignmentExport.response.status, 200);
    assert.ok(String(assignmentExport.payload).includes("experiment_id,customer_id,assigned_group"));
    assert.ok(String(assignmentExport.payload).includes(registeredExperiment.payload.data.id));

    const duplicateRegistration = await request("/api/experiments/register", {
      method: "POST",
      cookie,
      body: { holdoutRate: 0.2 }
    });
    assert.strictEqual(duplicateRegistration.response.status, 409);
    assert.strictEqual(duplicateRegistration.payload.error.code, "ACTIVE_EXPERIMENT_EXISTS");

    let rateLimitedEvent = null;
    for (let index = 0; index < 61; index += 1) {
      const response = await request("/api/events", {
        method: "POST",
        body: { event: "readiness_test", properties: { index } }
      });
      if (response.response.status === 429) {
        rateLimitedEvent = response;
        break;
      }
    }
    assert.ok(rateLimitedEvent, "events endpoint should be rate limited");
    assert.strictEqual(rateLimitedEvent.payload.error.code, "RATE_LIMITED");
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (fs.existsSync(process.env.MARGINLIFT_DB)) fs.unlinkSync(process.env.MARGINLIFT_DB);
    fs.rmSync(process.env.ARTIFACT_STORAGE_PATH, { recursive: true, force: true });
    fs.rmSync(process.env.MARGINLIFT_FONT_DIR, { recursive: true, force: true });
  }
}

run()
  .then(() => console.log("server.test.js passed"))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });

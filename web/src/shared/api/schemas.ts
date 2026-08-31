import { z } from "zod";

export const RbacRoleSchema = z.enum(["owner", "admin", "analyst", "viewer"]);
export type RbacRole = z.infer<typeof RbacRoleSchema>;

export const PersonaSchema = z.enum(["executive", "crm", "finance", "data"]);
export type Persona = z.infer<typeof PersonaSchema>;

export const EvidenceLevelSchema = z.enum([
  "none",
  "observational_estimate",
  "shadow_result",
  "pilot_estimate",
  "verified_incremental",
]);
export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;

export const SessionSchema = z
  .object({
    id: z.string(),
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string().default("کاربر MarginLift"),
      accessExpiresAt: z.string().nullable().optional(),
    }),
    organization: z.object({
      id: z.string(),
      name: z.string(),
      plan: z.string().default("pilot"),
    }),
    role: RbacRoleSchema,
    expiresAt: z.string(),
  })
  .nullable();
export type Session = z.infer<typeof SessionSchema>;

export const EvidenceMetaSchema = z
  .object({
    key: EvidenceLevelSchema.default("none"),
    labelFa: z.string().default("بدون شواهد"),
    claimFa: z.string().default("برای ادعای مالی داده کافی وجود ندارد."),
  })
  .passthrough();
export type EvidenceMeta = z.infer<typeof EvidenceMetaSchema>;

export const ClaimBoundarySchema = z
  .object({
    evidenceLevel: EvidenceLevelSchema,
    canClaimCausality: z.boolean().default(false),
    canClaimIncrementalProfit: z.boolean().default(false),
    canRecommendScale: z.boolean().default(false),
    disclaimerRequired: z.boolean().default(true),
    claimFa: z.string(),
  })
  .passthrough();

const TodaySchema = z
  .object({
    state: z.enum(["awaiting_data", "needs_data_fix", "observational_ready", "shadow_ready", "pilot_registered", "needs_review", "verified"]),
    labelFa: z.string(),
    decisionFa: z.string(),
    headlineFa: z.string(),
    blockerFa: z.string(),
    ownerFa: z.string(),
    nextActionFa: z.string(),
    cta: z.object({ labelFa: z.string(), href: z.string() }),
    primaryMetric: z.object({
      key: z.string().nullable(),
      labelFa: z.string(),
      value: z.number().nullable(),
      unit: z.string().nullable(),
      available: z.boolean(),
    }),
    evidenceLevel: EvidenceLevelSchema,
    evidence: EvidenceMetaSchema,
    claimBoundary: ClaimBoundarySchema,
  })
  .passthrough();

const DataContextSchema = z
  .object({
    provenance: z.enum(["no_data", "sample_data", "customer_data_without_verified_pilot"]),
    environmentLabelFa: z.string(),
    analysisId: z.string().nullable(),
    datasetHash: z.string().nullable(),
    datasetVersion: z.string().nullable(),
    modelVersion: z.string().nullable(),
    policyVersion: z.string().nullable(),
    source: z.string().nullable(),
    rowCount: z.number().nullable(),
    cutoffAt: z.string().nullable(),
    importedAt: z.string().nullable(),
    stale: z.boolean(),
    claimBoundary: ClaimBoundarySchema,
  })
  .passthrough();

const VisualizationSchema = z
  .object({
    key: z.string(),
    available: z.boolean(),
    evidenceLevel: EvidenceLevelSchema,
    unit: z.string().nullable(),
    data: z.unknown().nullable(),
    descriptionFa: z.string().optional(),
    sourceFa: z.string(),
    reason: z.string().optional(),
  })
  .passthrough();

export const DecisionSchema = z
  .object({
    decisionId: z.string(),
    customerIdHash: z.string().default("ناموجود"),
    asOf: z.string().nullable().optional(),
    channel: z.string().nullable().optional(),
    productType: z.string().nullable().optional(),
    state: z.string().default("unknown"),
    stateFa: z.string().default("نامشخص"),
    riskBand: z.string().default("unknown"),
    riskLabelFa: z.string().default("محاسبه نشده"),
    recommendedAction: z.string().default("no_action"),
    recommendedActionFa: z.string().default("بدون اقدام"),
    incentivePolicy: z.string().default("no_action"),
    incentivePolicyFa: z.string().default("بدون مشوق"),
    decisionReasonFa: z.string().default("دلیل تصمیم ثبت نشده است."),
    evidenceLevel: EvidenceLevelSchema.default("observational_estimate"),
    evidenceLabelFa: z.string().default("برآورد مشاهده‌ای"),
    confidenceFa: z.string().default("پایین"),
    expectedIncrementalProfit: z.number().nullable().default(null),
    actionCost: z.number().nullable().default(null),
    incentiveAllowed: z.boolean().default(false),
    policyVersion: z.string().nullable().default(null),
    modelVersion: z.string().nullable().default(null),
    datasetVersion: z.string().nullable().default(null),
    guardrails: z.array(z.string()).default([]),
    actionAlternatives: z
      .array(
        z.object({
          action: z.string(),
          labelFa: z.string(),
          status: z.string(),
        }),
      )
      .default([]),
    override: z
      .object({
        action: z.string(),
        reasonFa: z.string(),
        actorRole: z.string().optional(),
        createdAt: z.string(),
      })
      .nullable()
      .default(null),
  })
  .passthrough();
export type Decision = z.infer<typeof DecisionSchema>;

export const DecisionPageSchema = z.object({
  analysisId: z.string().nullable(),
  total: z.number().default(0),
  page: z.number().default(1),
  pageSize: z.number().default(50),
  items: z.array(DecisionSchema).default([]),
});
export type DecisionPage = z.infer<typeof DecisionPageSchema>;

const WorkspaceMetricsSchema = z
  .object({
    units: z.number().default(0),
    eligibleUnits: z.number().default(0),
    medianRepurchaseDays: z.number().nullable().default(null),
    queueSize: z.number().default(0),
    contactAllowed: z.number().default(0),
    contactBlocked: z.number().default(0),
    repeatCustomers: z.number().default(0),
    coverageDays: z.number().default(0),
  })
  .passthrough();

const WorkspaceSchema = z
  .object({
    status: z.string().default("awaiting_data"),
    statusFa: z.string().default("در انتظار داده"),
    headlineFa: z.string().default("برای ساخت تصمیم، داده وارد کنید"),
    nextActionFa: z.string().default("قرارداد داده را کامل کنید."),
    evidenceLevel: EvidenceLevelSchema.default("none"),
    evidenceLabelFa: z.string().default("بدون شواهد"),
    evidenceClaimFa: z.string().optional(),
    policyVersion: z.string().nullable().optional(),
    metrics: WorkspaceMetricsSchema.default({}),
    states: z
      .array(
        z.object({
          key: z.string().optional(),
          labelFa: z.string(),
          count: z.number(),
          share: z.number().default(0),
        }),
      )
      .default([]),
    queue: z.array(DecisionSchema).default([]),
  })
  .passthrough();

export const MetricContractSchema = z
  .object({
    id: z.string().optional(),
    version: z.number().default(1),
    status: z.string().default("draft"),
    statusFa: z.string().default("پیش‌نویس"),
    primaryMetricFa: z.string().default("سود مشارکتی افزایشی"),
    minimumSamplePerPolicy: z.number().nullable().default(null),
    samplePlanning: z
      .object({
        method: z.string().default("two_arm_mean_difference_normal_approximation"),
        assumedContributionProfitStdDev: z.number().nullable().default(null),
        minimumDetectableContributionProfitPerCustomer: z.number().nullable().default(null),
        recommendedMinimumSamplePerPolicy: z.number().nullable().default(null),
      })
      .passthrough()
      .default({}),
    channelChurnDefinitionFa: z.string().default(""),
    eligibilityFa: z.string().default(""),
    finance: z
      .object({
        grossMarginDefinitionFa: z.string().default(""),
        contributionProfitFormulaFa: z.string().default(""),
        incentiveCostDefinitionFa: z.string().default(""),
        channelCostDefinitionFa: z.string().default(""),
        refundPolicyFa: z.string().default(""),
      })
      .passthrough()
      .default({}),
    currentPolicy: z
      .object({
        descriptionFa: z.string().default(""),
        ownerFa: z.string().default(""),
        actionsLogged: z.boolean().default(false),
        reproducible: z.boolean().default(false),
      })
      .passthrough()
      .default({}),
    decisionRules: z
      .object({
        requirePositiveLowerBoundForScale: z.boolean().default(true),
        stopWhenPointEstimateNegative: z.boolean().default(true),
        minIncrementalNetRevenuePerAssignedCustomer: z.number().nullable().default(null),
        maxIncrementalIncentiveCostPerAssignedCustomer: z.number().nullable().default(null),
        maxOptOutRateDelta: z.number().nullable().default(null),
        maxComplaintRateDelta: z.number().nullable().default(null),
        thresholdBasisFa: z.string().default(""),
      })
      .passthrough()
      .default({}),
    approvals: z.object({ crm: z.unknown().nullable(), data: z.unknown().nullable(), finance: z.unknown().nullable() }).default({ crm: null, data: null, finance: null }),
    owners: z
      .object({
        crmFa: z.string().default(""),
        dataFa: z.string().default(""),
        financeFa: z.string().default(""),
        experimentFa: z.string().default(""),
      })
      .passthrough()
      .default({}),
    readiness: z
      .object({ missingFa: z.array(z.string()).default([]) })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type MetricContract = z.infer<typeof MetricContractSchema>;

export const RetentionConfigurationSchema = z
  .object({
    presetKey: z.string().default("generic_ecommerce"),
    display: z
      .object({
        purchaseObjectFa: z.string().default("خرید"),
        channelFa: z.string().default("کانال CRM"),
      })
      .passthrough()
      .default({}),
    lifecycle: z
      .object({
        lapsedAfterDays: z.number().default(30),
        dormantAfterDays: z.number().default(60),
        lostAfterDays: z.number().default(90),
        minHistoricalPurchases: z.number().default(2),
      })
      .passthrough()
      .default({}),
    readiness: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();
export type RetentionConfiguration = z.infer<typeof RetentionConfigurationSchema>;

export const OutcomeSchema = z
  .object({
    id: z.string().optional(),
    version: z.number().optional(),
    evidenceLevel: EvidenceLevelSchema.default("pilot_estimate"),
    evidenceLabelFa: z.string().default("برآورد پایلوت"),
    integrity: z
      .object({
        fatal: z.boolean().default(false),
        decisionEligible: z.boolean().default(false),
        status: z.string().default("pending"),
        statusFa: z.string().default("در انتظار ممیزی"),
        checks: z
          .array(
            z.object({
              key: z.string(),
              labelFa: z.string().optional(),
              passed: z.boolean(),
              statusFa: z.string().optional(),
            }),
          )
          .default([]),
      })
      .passthrough()
      .default({}),
    summary: z
      .object({
        decision: z.string().optional(),
        decisionFa: z.string().default("نیازمند بازبینی"),
        treatmentUsers: z.number().default(0),
        controlUsers: z.number().default(0),
        primaryEstimatePerCustomer: z.number().nullable().optional(),
        incrementalContributionProfitPerAssignedCustomer: z.number().nullable().optional(),
        financeVerificationStatus: z.string().default("pending"),
      })
      .passthrough()
      .default({}),
    guardrails: z
      .object({
        configured: z.boolean().default(false),
        passed: z.boolean().default(false),
        checks: z.array(z.object({ key: z.string(), labelFa: z.string(), observed: z.number(), threshold: z.number().nullable(), passed: z.boolean() }).passthrough()).default([]),
      })
      .passthrough()
      .optional(),
    financeReconciliation: z
      .object({
        status: z.string().default("pending"),
        expected: z.object({
          totalNetRevenue: z.number(),
          totalContributionMargin: z.number(),
          totalIncentiveCost: z.number(),
          totalChannelCost: z.number(),
          totalRefundAmount: z.number(),
        }).optional(),
        tolerance: z.number().nullable().optional(),
        checks: z.array(z.unknown()).default([]),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type Outcome = z.infer<typeof OutcomeSchema>;

export const RetentionWorkspaceSchema = z
  .object({
    configuration: RetentionConfigurationSchema.default({}),
    metricContract: MetricContractSchema.default({}),
    evidence: EvidenceMetaSchema.default({}),
    experiment: z.record(z.string(), z.unknown()).nullable().default(null),
    outcome: OutcomeSchema.nullable().default(null),
    shadow: z.object({
      latestRun: z.record(z.string(), z.unknown()).nullable().default(null),
      healthyConsecutiveRuns: z.number().default(0),
      readyForExperiment: z.boolean().default(false),
    }).default({}),
    experimentAdmission: z.object({
      ready: z.boolean().default(false),
      checks: z.array(z.object({ key: z.string(), labelFa: z.string(), passed: z.boolean(), detailFa: z.string() })).default([]),
      blockersFa: z.array(z.string()).default([]),
      population: z.object({
        uniqueCustomers: z.number().default(0),
        minimumSamplePerPolicy: z.number().default(0),
        requiredTotal: z.number().nullable().default(null),
      }).default({}),
    }).default({}),
    analysis: z
      .object({
        id: z.string(),
        name: z.string(),
        rowCount: z.number().default(0),
        cutoffAt: z.string().nullable().optional(),
        createdAt: z.string().optional(),
        readiness: z
          .object({ score: z.number().default(0), statusFa: z.string().default("در انتظار داده") })
          .passthrough()
          .default({}),
      })
      .passthrough()
      .nullable()
      .default(null),
    stale: z.boolean().default(false),
    workspace: WorkspaceSchema.default({}),
    today: TodaySchema,
    dataContext: DataContextSchema,
    visualizations: z.object({
      profitWaterfall: VisualizationSchema,
      treatmentControl: VisualizationSchema,
      retentionCohort: VisualizationSchema,
      evidenceLadder: VisualizationSchema,
    }),
  })
  .passthrough();
export type RetentionWorkspace = z.infer<typeof RetentionWorkspaceSchema>;

export const RetentionPreviewSchema = z
  .object({
    rowCount: z.number().default(0),
    columns: z.array(z.string()).default([]),
    readyForImport: z.boolean().default(false),
    canImport: z.boolean().default(false),
    datasetHash: z.string(),
    mapping: z.record(z.string(), z.string()).default({}),
    fields: z
      .array(
        z.object({
          key: z.string(),
          labelFa: z.string(),
          required: z.boolean().default(false),
          column: z.string().nullable().optional(),
        }),
      )
      .default([]),
    privacy: z
      .object({
        blocked: z.boolean().default(false),
        statusFa: z.string().default("بررسی نشده"),
        findings: z.array(z.string()).optional(),
      })
      .passthrough()
      .default({}),
    readiness: z
      .object({
        statusFa: z.string().default("در انتظار بررسی"),
        checks: z
          .array(
            z.object({
              key: z.string(),
              labelFa: z.string(),
              passed: z.boolean(),
              statusFa: z.string().optional(),
            }),
          )
          .default([]),
      })
      .passthrough()
      .optional(),
    qualityIssues: z.array(z.object({
      group: z.enum(["critical", "fixable", "recommendation"]),
      code: z.string(),
      messageFa: z.string(),
      details: z.array(z.unknown()).default([]),
    })).default([]),
    quality: z.object({
      status: z.enum(["ready", "ready_with_notes", "blocked"]),
      groups: z.object({
        critical: z.array(z.unknown()).default([]),
        fixable: z.array(z.unknown()).default([]),
        recommendation: z.array(z.unknown()).default([]),
      }),
    }),
    claimBoundary: ClaimBoundarySchema,
  })
  .passthrough();
export type RetentionPreview = z.infer<typeof RetentionPreviewSchema>;

const ClaimStepSchema = z
  .object({
    key: z.string(),
    labelFa: z.string(),
    statusFa: z.string().optional(),
    reached: z.boolean().optional(),
    complete: z.boolean().optional(),
  })
  .passthrough();

export const PilotWorkspaceSchema = z
  .object({
    readiness: z
      .object({
        status: z.string().default("blocked"),
        statusFa: z.string().default("در انتظار داده"),
        claimLevel: z.string().default("none"),
        claimLevelFa: z.string().default("بدون شواهد"),
        score: z.number().default(0),
        checks: z.array(ClaimStepSchema).default([]),
        claimLadder: z.array(ClaimStepSchema).default([]),
      })
      .passthrough()
      .default({}),
    savingsSnapshot: z
      .object({
        headlineFa: z.string().default("پایلوت در انتظار داده است"),
        claimLevel: z.string().default("none"),
        claimLevelFa: z.string().default("بدون شواهد"),
        evidenceTagFa: z.string().default("بدون شواهد"),
        decisionFa: z.string().default("برای تصمیم داده کافی وجود ندارد."),
        confidenceFa: z.string().default("نامشخص"),
        avoidableIncentiveCost: z.number().nullable().default(null),
        expectedIncrementalProfit: z.number().nullable().default(null),
        revenueAtRisk: z.number().nullable().default(null),
        pilotRoi: z.number().nullable().default(null),
      })
      .passthrough()
      .default({}),
    workspace: z
      .object({
        overallStatusFa: z.string().default("در انتظار داده"),
        ownerFa: z.string().default("مالک تعیین نشده"),
        decisionDeadlineFa: z.string().default("تعیین نشده"),
        experimentId: z.string().nullable().default(null),
        steps: z.array(ClaimStepSchema).default([]),
      })
      .passthrough()
      .default({}),
    experiment: z.record(z.string(), z.unknown()).nullable().optional(),
    outcome: OutcomeSchema.nullable().optional(),
  })
  .passthrough();
export type PilotWorkspace = z.infer<typeof PilotWorkspaceSchema>;

export const LedgerEntrySchema = z
  .object({
    id: z.string(),
    eventType: z.string(),
    entityType: z.string(),
    entityId: z.string(),
    decision: z.string(),
    decisionFa: z.string(),
    rationaleFa: z.string(),
    evidence: z.record(z.string(), z.unknown()).default({}),
    previousHash: z.string().nullable(),
    hash: z.string(),
    createdAt: z.string(),
  })
  .passthrough();

export const GovernanceSchema = z
  .object({
    decisionLedger: z.object({
      integrity: z
        .object({
          valid: z.boolean(),
          checked: z.number(),
          latestHash: z.string().nullable(),
          statusFa: z.string(),
        })
        .passthrough(),
      entries: z.array(LedgerEntrySchema).default([]),
    }),
    operatingPolicy: z
      .object({
        autoPromotion: z.boolean().default(false),
        autoScale: z.boolean().default(false),
        policyFa: z.string().default("تصمیم نهایی به تأیید انسانی نیاز دارد."),
      })
      .passthrough(),
    modelGovernance: z.record(z.string(), z.unknown()).default({}),
    outcomeMonitor: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();
export type Governance = z.infer<typeof GovernanceSchema>;

export const ConfigurationResponseSchema = z.object({
  configuration: RetentionConfigurationSchema,
  presets: z
    .array(
      z
        .object({
          key: z.string(),
          labelFa: z.string().default("الگوی آماده"),
        })
        .passthrough(),
    )
    .default([]),
});
export type ConfigurationResponse = z.infer<typeof ConfigurationResponseSchema>;

export const DataImportFormSchema = z.object({
  name: z.string().trim().min(3, "نام تحلیل باید دست‌کم ۳ نویسه باشد."),
  cutoff: z.string().optional(),
  csvText: z.string().min(20, "فایل CSV معتبر انتخاب کنید."),
  mapping: z.record(z.string(), z.string()).default({}),
  expectedDatasetHash: z.string().optional(),
  source: z.string().optional(),
});
export type DataImportForm = z.infer<typeof DataImportFormSchema>;

export const SettingsFormSchema = z.object({
  presetKey: z.string().min(1),
  purchaseObjectFa: z.string().trim().min(2, "موضوع خرید را وارد کنید."),
  channelFa: z.string().trim().min(2, "نام کانال را وارد کنید."),
  lapsedAfterDays: z.coerce.number().int().min(1).max(365),
  dormantAfterDays: z.coerce.number().int().min(2).max(730),
  lostAfterDays: z.coerce.number().int().min(3).max(1095),
  minHistoricalPurchases: z.coerce.number().int().min(1).max(100),
});
export type SettingsForm = z.infer<typeof SettingsFormSchema>;

export const OutcomePreviewSchema = z
  .object({
    outcomeDatasetHash: z.string(),
    integrity: z
      .object({
        fatal: z.boolean().default(false),
        statusFa: z.string().default("در انتظار ممیزی"),
        decisionEligible: z.boolean().default(false),
      })
      .passthrough(),
  })
  .passthrough();

export const ExperimentSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    status: z.string().default("registered"),
  })
  .passthrough();

export const DecisionReceiptSchema = z
  .object({
    schemaVersion: z.string(),
    decision: z.object({
      decisionId: z.string(),
      customerIdHash: z.string(),
      recommendation: z.string(),
      recommendationFa: z.string(),
      rationaleFa: z.string(),
      evidenceLevel: EvidenceLevelSchema,
      confidenceFa: z.string().default("نامشخص"),
      expectedIncrementalProfit: z.number().nullable(),
      actionCost: z.number().nullable(),
      claimBoundary: ClaimBoundarySchema,
    }).passthrough(),
    alternatives: z.array(z.object({ action: z.string(), labelFa: z.string(), status: z.string() }).passthrough()).default([]),
    guardrails: z.array(z.string()).default([]),
    unknowns: z.array(z.string()).default([]),
    versions: z.object({
      analysisId: z.string(),
      datasetHash: z.string().nullable(),
      datasetVersion: z.string().nullable(),
      modelVersion: z.string().nullable(),
      policyVersion: z.string().nullable(),
    }).passthrough(),
    override: z.unknown().nullable(),
    overrideHistory: z.array(z.unknown()).default([]),
    generatedAt: z.string(),
  })
  .passthrough();
export type DecisionReceipt = z.infer<typeof DecisionReceiptSchema>;

export const RetentionReadoutSchema = z
  .object({
    schemaVersion: z.string(),
    role: PersonaSchema,
    generatedAt: z.string(),
    organization: z.object({ id: z.string().nullable(), name: z.string() }),
    decision: z.object({ state: z.string(), decisionFa: z.string(), headlineFa: z.string(), nextActionFa: z.string() }),
    primaryMetric: TodaySchema.shape.primaryMetric,
    evidence: EvidenceMetaSchema.extend({ boundary: ClaimBoundarySchema }),
    riskFa: z.string(),
    dataContext: DataContextSchema,
    versions: z.object({
      analysisId: z.string().nullable(),
      datasetHash: z.string().nullable(),
      datasetVersion: z.string().nullable(),
      modelVersion: z.string().nullable(),
      policyVersion: z.string().nullable(),
    }),
    owners: z.array(z.object({ roleFa: z.string(), actionFa: z.string() })).default([]),
    financeVerified: z.boolean().optional(),
    finalDecision: z.string().nullable().optional(),
    confidenceInterval95: z.object({ lower: z.number(), upper: z.number() }).nullable().optional(),
    guardrails: z.object({
      configured: z.boolean().default(false),
      passed: z.boolean().default(false),
      checks: z.array(z.object({ key: z.string(), labelFa: z.string(), observed: z.number(), threshold: z.number().nullable(), passed: z.boolean() }).passthrough()).default([]),
    }).passthrough().nullable().optional(),
    reconciliation: z.object({
      status: z.string(),
      tolerance: z.number().nullable().optional(),
      checks: z.array(z.object({ key: z.string(), labelFa: z.string(), difference: z.number().nullable(), passed: z.boolean() }).passthrough()).default([]),
    }).passthrough().nullable().optional(),
  })
  .passthrough();
export type RetentionReadout = z.infer<typeof RetentionReadoutSchema>;

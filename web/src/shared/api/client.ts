import { z } from "zod";
import {
  ConfigurationResponseSchema,
  DataImportFormSchema,
  DecisionPageSchema,
  DecisionReceiptSchema,
  DecisionSchema,
  ExperimentSchema,
  GovernanceSchema,
  MetricContractSchema,
  OutcomeSchema,
  OutcomePreviewSchema,
  PilotWorkspaceSchema,
  RetentionConfigurationSchema,
  RetentionPreviewSchema,
  RetentionReadoutSchema,
  RetentionWorkspaceSchema,
  SessionSchema,
  SettingsFormSchema,
  type DataImportForm,
  type Persona,
  type SettingsForm,
} from "./schemas";

const ApiEnvelopeSchema = z.object({ data: z.unknown() });

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<Schema extends z.ZodTypeAny>(
  path: string,
  schema: Schema,
  init: RequestInit = {},
): Promise<z.output<Schema>> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || "در ارتباط با سرور خطایی رخ داد.";
    throw new ApiError(message, response.status, payload?.error?.code);
  }

  const envelope = ApiEnvelopeSchema.parse(payload);
  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) {
    throw new ApiError("پاسخ سرور با قرارداد این صفحه سازگار نیست.", 500, "INVALID_API_RESPONSE");
  }
  return parsed.data;
}

function json(method: "POST" | "PATCH", body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export const api = {
  session: () => request("/api/session", SessionSchema),
  retentionWorkspace: () => request("/api/retention/workspace", RetentionWorkspaceSchema),
  decisions: (filters: { page?: number; pageSize?: number; action?: string; evidence?: string } = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return request(`/api/retention/decisions?${params}`, DecisionPageSchema);
  },
  overrideDecision: (decisionId: string, body: { overrideAction: string; reasonFa: string }) =>
    request(`/api/retention/decisions/${encodeURIComponent(decisionId)}/override`, DecisionSchema, json("POST", body)),
  decisionReceipt: (decisionId: string) =>
    request(`/api/retention/decisions/${encodeURIComponent(decisionId)}/receipt`, DecisionReceiptSchema),
  previewRetention: (input: DataImportForm) =>
    request("/api/retention/preview", RetentionPreviewSchema, json("POST", DataImportFormSchema.parse(input))),
  importRetention: (input: DataImportForm) =>
    request("/api/retention/import", RetentionWorkspaceSchema, json("POST", DataImportFormSchema.parse(input))),
  readout: (role: Persona) =>
    request(`/api/retention/readout.json?role=${encodeURIComponent(role)}`, RetentionReadoutSchema),
  pilotWorkspace: () => request("/api/pilot/workspace", PilotWorkspaceSchema),
  createShadowRun: (body: { name: string; capacity?: number }) =>
    request("/api/retention/shadow-runs", z.record(z.string(), z.unknown()), json("POST", body)),
  updateMetricContract: (body: Record<string, unknown>) =>
    request("/api/retention/metric-contract", MetricContractSchema, json("PATCH", body)),
  registerExperiment: (name: string) =>
    request("/api/retention/experiments/register", ExperimentSchema, json("POST", { name })),
  previewOutcome: (csvText: string) =>
    request("/api/retention/outcomes/preview", OutcomePreviewSchema, json("POST", { csvText })),
  importOutcome: (csvText: string) =>
    request("/api/retention/outcomes/import", z.record(z.string(), z.unknown()), json("POST", { name: "Outcome پایلوت سیاست نگهداشت", csvText })),
  verifyFinance: (outcomeId: string, body: { reviewerFa: string; reasonFa: string }) =>
    request(`/api/retention/outcomes/${encodeURIComponent(outcomeId)}/verify-finance`, OutcomeSchema, json("POST", body)),
  governance: () => request("/api/model-governance/overview", GovernanceSchema),
  configuration: () => request("/api/retention/configuration", ConfigurationResponseSchema),
  updateConfiguration: (form: SettingsForm) => {
    const values = SettingsFormSchema.parse(form);
    return request(
      "/api/retention/configuration",
      z.object({ configuration: RetentionConfigurationSchema }).passthrough(),
      json("PATCH", {
        presetKey: values.presetKey,
        display: { purchaseObjectFa: values.purchaseObjectFa, channelFa: values.channelFa },
        lifecycle: {
          lapsedAfterDays: values.lapsedAfterDays,
          dormantAfterDays: values.dormantAfterDays,
          lostAfterDays: values.lostAfterDays,
          minHistoricalPurchases: values.minHistoricalPurchases,
        },
      }),
    );
  },
};

export async function downloadApiFile(path: string, filename: string): Promise<void> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error?.message || "فایل آماده دریافت نیست.", response.status, payload?.error?.code);
  }
  const href = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Download, Eye, FileUp, FlaskConical, ShieldCheck } from "lucide-react";
import { api, downloadApiFile } from "../../shared/api/client";
import { formatNumber, formatToman } from "../../shared/lib/format";
import { ErrorState, EvidenceBadge, LoadingState } from "../../shared/ui";

const financeFields = [
  ["totalNetRevenue", "درآمد خالص"],
  ["totalContributionMargin", "حاشیه سود مشارکتی"],
  ["totalIncentiveCost", "هزینه مشوق"],
  ["totalChannelCost", "هزینه کانال"],
  ["totalRefundAmount", "بازپرداخت"],
] as const;
type FinanceField = (typeof financeFields)[number][0];

export function PilotPage() {
  const [outcomeCsv, setOutcomeCsv] = useState("");
  const [outcomeName, setOutcomeName] = useState("");
  const [reviewerFa, setReviewerFa] = useState("");
  const [financeReasonFa, setFinanceReasonFa] = useState("");
  const [financeTolerance, setFinanceTolerance] = useState("0");
  const [financeValues, setFinanceValues] = useState<Record<FinanceField, string>>({
    totalNetRevenue: "",
    totalContributionMargin: "",
    totalIncentiveCost: "",
    totalChannelCost: "",
    totalRefundAmount: "",
  });
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["retention-workspace"], queryFn: api.retentionWorkspace });
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["retention-workspace"] });
  const shadowMutation = useMutation({ mutationFn: () => api.createShadowRun({ name: `Shadow Run ${new Date().toLocaleDateString("fa-IR")}` }), onSuccess: refresh });
  const registerMutation = useMutation({ mutationFn: () => api.registerExperiment("Current CRM Policy در برابر MarginLift Policy"), onSuccess: refresh });
  const outcomePreview = useMutation({ mutationFn: () => api.previewOutcome(outcomeCsv) });
  const outcomeImport = useMutation({ mutationFn: () => api.importOutcome(outcomeCsv, outcomePreview.data?.outcomeDatasetHash || ""), onSuccess: refresh });
  const financeMutation = useMutation({
    mutationFn: (outcomeId: string) => api.verifyFinance(outcomeId, {
      reviewerFa,
      reasonFa: financeReasonFa,
      toleranceToman: Number(financeTolerance),
      reconciliation: Object.fromEntries(financeFields.map(([key]) => [key, Number(financeValues[key])])),
    }),
    onSuccess: refresh,
  });

  if (query.isLoading) return <LoadingState label="در حال دریافت وضعیت پایلوت…" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const data = query.data;
  const experimentId = typeof data.experiment?.id === "string" ? data.experiment.id : null;
  const outcomeId = data.outcome?.id || null;
  const financeVerified = data.outcome?.summary.financeVerificationStatus === "verified";
  const canOperate = session.data ? ["owner", "admin", "analyst"].includes(session.data.role) : false;
  const canVerifyFinance = session.data ? ["owner", "admin"].includes(session.data.role) : false;
  const financeReady = financeFields.every(([key]) => financeValues[key].trim() !== "") && Number.isFinite(Number(financeTolerance)) && Number(financeTolerance) >= 0;
  const steps = [
    { key: "data", label: "داده", complete: Boolean(data.analysis), status: data.analysis ? "نسخه داده ثبت شده" : "در انتظار Data Contract" },
    { key: "contract", label: "قرارداد معیار", complete: data.metricContract.status === "locked", status: data.metricContract.statusFa },
    { key: "shadow", label: "Shadow", complete: data.shadow.readyForExperiment, status: `${formatNumber(data.shadow.healthyConsecutiveRuns)} اجرای سالم از ۲` },
    { key: "experiment", label: "آزمایش", complete: Boolean(experimentId), status: experimentId ? "ثبت و قفل شده" : "ثبت نشده" },
    { key: "outcome", label: "Outcome", complete: Boolean(outcomeId), status: outcomeId ? data.outcome?.integrity.statusFa || "دریافت شده" : "در انتظار فایل" },
    { key: "finance", label: "Finance", complete: financeVerified, status: financeVerified ? "تطبیق تأیید شد" : "در انتظار تطبیق" },
  ];

  async function readOutcome(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) throw new Error("فایل Outcome مرورگر باید کمتر از ۲ مگابایت باشد.");
    setOutcomeName(file.name);
    setOutcomeCsv(await file.text());
    outcomePreview.reset();
  }

  const operationError = shadowMutation.error || registerMutation.error || outcomePreview.error || outcomeImport.error || financeMutation.error;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><span className="eyebrow">پایلوت</span><h1>کنترل اجرای پایلوت</h1></div>
        <EvidenceBadge level={data.today.evidenceLevel} label={data.today.evidence.labelFa} />
      </header>

      <section className="pilot-summary">
        <div><FlaskConical aria-hidden="true" size={22} /><span>{data.today.labelFa}</span></div>
        <h2>{data.today.decisionFa}</h2>
        <dl className="metric-strip">
          <div><dt>سود افزایشی به‌ازای مشتری</dt><dd>{formatToman(data.outcome?.summary.incrementalContributionProfitPerAssignedCustomer ?? null)}</dd></div>
          <div><dt>سلامت Outcome</dt><dd>{data.outcome?.integrity.statusFa || "ناموجود"}</dd></div>
          <div><dt>مالک گام بعدی</dt><dd>{data.today.ownerFa}</dd></div>
          <div><dt>مجوز Scale</dt><dd>{data.today.claimBoundary.canRecommendScale ? "مجاز با Guardrail" : "مجاز نیست"}</dd></div>
        </dl>
      </section>

      <section className="workflow-panel" aria-labelledby="pilot-steps-title">
        <div className="section-title-row"><div><span className="eyebrow">اجرای کنترل‌شده</span><h2 id="pilot-steps-title">گیت‌های پایلوت</h2></div><span>{steps.filter((step) => step.complete).length} از {steps.length}</span></div>
        <ol className="pilot-steps">
          {steps.map((item) => <li key={item.key} className={item.complete ? "is-complete" : ""}>{item.complete ? <Check aria-hidden="true" size={17} /> : <Circle aria-hidden="true" size={17} />}<div><strong>{item.label}</strong><span>{item.status}</span></div></li>)}
        </ol>

        <div className="contract-gaps" aria-live="polite">
          <strong>{data.experimentAdmission.ready ? "گیت Live Holdout آماده است" : "موانع تولید Assignment واقعی"}</strong>
          <ul>{data.experimentAdmission.checks.map((item) => <li key={item.key}>{item.passed ? "تأیید: " : "نیازمند اقدام: "}{item.labelFa}{item.passed ? "" : ` — ${item.detailFa}`}</li>)}</ul>
        </div>

        <div className="pilot-actions">
          <button className="button button-secondary" type="button" disabled={!canOperate || !data.analysis || data.metricContract.status !== "locked" || shadowMutation.isPending || data.shadow.readyForExperiment} onClick={() => shadowMutation.mutate()}><Eye aria-hidden="true" size={17} />اجرای Shadow</button>
          <button className="button button-primary" type="button" disabled={!canOperate || !data.experimentAdmission.ready || Boolean(experimentId) || registerMutation.isPending} onClick={() => registerMutation.mutate()}><FlaskConical aria-hidden="true" size={17} />ثبت آزمایش</button>
          <button className="button button-secondary" type="button" disabled={!experimentId} onClick={() => downloadApiFile("/api/retention/experiments/current/assignments.csv", "marginlift-retention-policy-assignments.csv")}><Download aria-hidden="true" size={17} />دریافت Assignment</button>
        </div>
      </section>

      <section className="workflow-panel" aria-labelledby="outcome-title">
        <div className="section-heading"><FileUp aria-hidden="true" size={22} /><div><h2 id="outcome-title">دریافت Outcome</h2><p>ابتدا فایل را ممیزی کنید؛ Import فقط پس از Preview سالم انجام می‌شود.</p></div></div>
        <label className="file-drop compact-file-drop"><FileUp aria-hidden="true" size={22} /><strong>{outcomeName || "انتخاب فایل Outcome CSV"}</strong><span>شناسه هش‌شده، assigned policy، هزینه و نتیجه واقعی</span><input type="file" accept=".csv,text/csv" disabled={!experimentId || !canOperate} onChange={(event) => void readOutcome(event.target.files?.[0])} /></label>
        {outcomePreview.data ? <p className={`form-message ${outcomePreview.data.integrity.fatal ? "is-error" : "is-success"}`}>{outcomePreview.data.integrity.statusFa}</p> : null}
        <div className="pilot-actions"><button className="button button-secondary" type="button" disabled={!outcomeCsv || !experimentId || outcomePreview.isPending} onClick={() => outcomePreview.mutate()}>ممیزی Outcome</button><button className="button button-primary" type="button" disabled={!outcomePreview.data || outcomePreview.data.integrity.fatal || outcomeImport.isPending} onClick={() => outcomeImport.mutate()}>ثبت Outcome</button></div>
      </section>

      {outcomeId && !financeVerified ? <section className="workflow-panel" aria-labelledby="finance-title">
        <div className="section-heading"><ShieldCheck aria-hidden="true" size={22} /><div><h2 id="finance-title">تطبیق Finance</h2><p>فقط پس از تطبیق دستی درآمد، هزینه مشوق، کانال و بازپرداخت تأیید کنید.</p></div></div>
        {data.outcome?.financeReconciliation?.expected ? <dl className="metric-strip">
          {financeFields.map(([key, label]) => <div key={key}><dt>{label} محاسبه‌شده</dt><dd>{formatToman(data.outcome?.financeReconciliation?.expected?.[key] ?? null)}</dd></div>)}
        </dl> : null}
        <div className="form-grid"><label className="field"><span>نام یا نقش بازبین</span><input value={reviewerFa} onChange={(event) => setReviewerFa(event.target.value)} disabled={!canVerifyFinance} /></label><label className="field"><span>شرح تطبیق</span><input value={financeReasonFa} onChange={(event) => setFinanceReasonFa(event.target.value)} disabled={!canVerifyFinance} /></label></div>
        <div className="form-grid">
          {financeFields.map(([key, label]) => <label className="field" key={key}><span>{label} طبق منبع Finance</span><input type="number" value={financeValues[key]} onChange={(event) => setFinanceValues((current) => ({ ...current, [key]: event.target.value }))} disabled={!canVerifyFinance} /></label>)}
          <label className="field"><span>تلورانس مجاز (تومان)</span><input type="number" min="0" value={financeTolerance} onChange={(event) => setFinanceTolerance(event.target.value)} disabled={!canVerifyFinance} /></label>
        </div>
        <button className="button button-primary" type="button" disabled={!canVerifyFinance || !financeReady || reviewerFa.trim().length < 2 || financeReasonFa.trim().length < 12 || financeMutation.isPending} onClick={() => financeMutation.mutate(outcomeId)}>تأیید تطبیق مالی و صدور تصمیم</button>
      </section> : null}

      {operationError ? <p className="form-message is-error" role="alert">{(operationError as Error).message}</p> : null}
    </div>
  );
}

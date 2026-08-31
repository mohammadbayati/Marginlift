import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Filter, ShieldAlert } from "lucide-react";
import { api } from "../../shared/api/client";
import type { Decision } from "../../shared/api/schemas";
import { formatDate, formatToman, shortId } from "../../shared/lib/format";
import { Drawer, EmptyState, ErrorState, EvidenceBadge, LoadingState } from "../../shared/ui";

type OverrideForm = { overrideAction: string; reasonFa: string };

export function DecisionsPage() {
  const [action, setAction] = useState("");
  const [evidence, setEvidence] = useState("");
  const [selected, setSelected] = useState<Decision | null>(null);
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const query = useQuery({ queryKey: ["decisions", action, evidence], queryFn: () => api.decisions({ pageSize: 100, action, evidence }) });
  const receipt = useQuery({
    queryKey: ["decision-receipt", selected?.decisionId],
    queryFn: () => api.decisionReceipt(selected!.decisionId),
    enabled: Boolean(selected),
  });
  const form = useForm<OverrideForm>({ defaultValues: { overrideAction: "no_action", reasonFa: "" } });
  const canOverride = session.data ? ["owner", "admin", "analyst"].includes(session.data.role) : false;
  const overrideMutation = useMutation({
    mutationFn: (values: OverrideForm) => api.overrideDecision(selected!.decisionId, values),
    onSuccess: async (updated) => {
      setSelected(updated);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["decisions"] });
      await queryClient.invalidateQueries({ queryKey: ["decision-receipt", updated.decisionId] });
    },
  });
  const summary = useMemo(() => ({ total: query.data?.total || 0, blocked: query.data?.items.filter((item) => !item.incentiveAllowed).length || 0 }), [query.data]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><span className="eyebrow">تصمیم‌ها</span><h1>صف تصمیم قابل حسابرسی</h1></div>
        <div className="page-summary"><span>{summary.total} تصمیم</span><span>{summary.blocked} بدون مجوز مشوق</span></div>
      </header>

      <section className="table-panel">
        <div className="table-toolbar">
          <div className="toolbar-title"><Filter aria-hidden="true" size={18} /><strong>فیلتر صف</strong></div>
          <label><span className="sr-only">فیلتر اقدام</span><select value={action} onChange={(event) => setAction(event.target.value)}><option value="">همه اقدام‌ها</option><option value="no_action">بدون اقدام</option><option value="message_no_discount">پیام بدون تخفیف</option><option value="targeted_discount">تخفیف هدفمند</option></select></label>
          <label><span className="sr-only">فیلتر شواهد</span><select value={evidence} onChange={(event) => setEvidence(event.target.value)}><option value="">همه شواهد</option><option value="observational_estimate">برآورد مشاهده‌ای</option><option value="pilot_estimate">برآورد پایلوت</option><option value="verified_incremental">اثر تأییدشده</option></select></label>
        </div>

        {query.isLoading ? <LoadingState label="در حال دریافت صف تصمیم…" /> : null}
        {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null}
        {query.data && !query.data.items.length ? <EmptyState title="تصمیمی در این فیلتر نیست" description="فیلتر را تغییر دهید یا ابتدا داده را وارد کنید." /> : null}
        {query.data?.items.length ? (
          <div className="table-scroll" tabIndex={0} aria-label="جدول تصمیم‌ها؛ برای مشاهده ستون‌های بیشتر پیمایش کنید">
            <table>
              <thead><tr><th>شناسه</th><th>وضعیت</th><th>اقدام</th><th>سیاست مشوق</th><th>شواهد</th><th>سود مورد انتظار</th><th><span className="sr-only">جزئیات</span></th></tr></thead>
              <tbody>
                {query.data.items.map((item) => (
                  <tr key={item.decisionId}>
                    <td><bdi className="technical-id">{shortId(item.customerIdHash, 14)}</bdi></td>
                    <td>{item.stateFa}</td>
                    <td><strong>{item.override?.action ? "Override ثبت‌شده" : item.recommendedActionFa}</strong></td>
                    <td>{item.incentivePolicyFa}</td>
                    <td><EvidenceBadge level={item.evidenceLevel} label={item.evidenceLabelFa} /></td>
                    <td>{formatToman(item.expectedIncrementalProfit)}</td>
                    <td><button className="icon-button" type="button" aria-label={`مشاهده رسید تصمیم ${item.customerIdHash}`} title="رسید تصمیم" onClick={() => setSelected(item)}><ChevronLeft aria-hidden="true" size={19} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <Drawer open={Boolean(selected)} title={selected?.recommendedActionFa || "رسید تصمیم"} description={selected?.decisionReasonFa} onClose={() => setSelected(null)}>
        {selected ? (
          <>
            {receipt.isLoading ? <LoadingState label="در حال ساخت رسید تصمیم…" /> : null}
            {receipt.isError ? <ErrorState error={receipt.error} onRetry={() => receipt.refetch()} /> : null}
            <div className="receipt-status"><EvidenceBadge level={receipt.data?.decision.evidenceLevel || selected.evidenceLevel} label={selected.evidenceLabelFa} />{!selected.incentiveAllowed ? <span className="guardrail-badge"><ShieldAlert aria-hidden="true" size={15} />مشوق مجاز نیست</span> : null}</div>
            <dl className="receipt-facts">
              <div><dt>Decision ID</dt><dd><bdi>{receipt.data?.decision.decisionId || selected.decisionId}</bdi></dd></div>
              <div><dt>Customer Hash</dt><dd><bdi>{receipt.data?.decision.customerIdHash || selected.customerIdHash}</bdi></dd></div>
              <div><dt>تاریخ تصمیم</dt><dd>{formatDate(selected.asOf)}</dd></div>
              <div><dt>اعتماد</dt><dd>{receipt.data?.decision.confidenceFa || selected.confidenceFa}</dd></div>
              <div><dt>نسخه سیاست</dt><dd><bdi>{shortId(receipt.data?.versions.policyVersion || selected.policyVersion)}</bdi></dd></div>
              <div><dt>نسخه داده</dt><dd><bdi>{shortId(receipt.data?.versions.datasetVersion || selected.datasetVersion)}</bdi></dd></div>
              <div><dt>نسخه مدل</dt><dd><bdi>{shortId(receipt.data?.versions.modelVersion || selected.modelVersion)}</bdi></dd></div>
              <div><dt>سود افزایشی</dt><dd>{formatToman(receipt.data?.decision.expectedIncrementalProfit ?? selected.expectedIncrementalProfit)}</dd></div>
            </dl>
            <section className="receipt-section"><h3>مجهولات تصمیم</h3><ul className="plain-list">{receipt.data?.unknowns.length ? receipt.data.unknowns.map((item) => <li key={item}><bdi>{item}</bdi></li>) : <li>مورد ثبت‌شده‌ای نیست.</li>}</ul></section>
            <section className="receipt-section"><h3>Guardrailها</h3><ul className="plain-list">{(receipt.data?.guardrails || selected.guardrails).map((item) => <li key={item}><bdi>{item}</bdi></li>)}</ul></section>
            <section className="receipt-section"><h3>گزینه‌های سیاست</h3><ul className="plain-list">{(receipt.data?.alternatives || selected.actionAlternatives).map((item) => <li key={item.action}><span>{item.labelFa}</span><bdi>{item.status}</bdi></li>)}</ul></section>
            {selected.override ? <section className="receipt-section"><h3>Override ثبت‌شده</h3><p>{selected.override.reasonFa}</p><small>{formatDate(selected.override.createdAt)}</small></section> : null}
            <form className="override-form" onSubmit={form.handleSubmit((values) => overrideMutation.mutate(values))}>
              <h3>ثبت Override</h3>
              <label className="field"><span>اقدام جایگزین</span><select {...form.register("overrideAction")} disabled={!canOverride}><option value="no_action">بدون اقدام</option><option value="message_no_discount">پیام بدون تخفیف</option><option value="targeted_discount">تخفیف هدفمند، فقط در آزمون</option></select></label>
              <label className="field"><span>دلیل قابل حسابرسی</span><textarea {...form.register("reasonFa", { minLength: 12, required: true })} disabled={!canOverride} rows={3} /></label>
              {!canOverride ? <p className="form-message">نقش مشاهده‌گر اجازه تغییر تصمیم ندارد.</p> : null}
              {overrideMutation.error ? <p className="form-message is-error" role="alert">{(overrideMutation.error as Error).message}</p> : null}
              <button className="button button-primary" type="submit" disabled={!canOverride || overrideMutation.isPending}>{overrideMutation.isPending ? "در حال ثبت…" : "ثبت Override"}</button>
            </form>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}

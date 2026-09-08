import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Filter, Printer, Search, ShieldAlert } from "lucide-react";
import { api } from "../../shared/api/client";
import type { Decision } from "../../shared/api/schemas";
import { formatDate, formatNumber, formatToman, shortId } from "../../shared/lib/format";
import { decisionStateLabels } from "../../shared/lib/visual";
import { Drawer, EmptyState, ErrorState, EvidenceBadge, LoadingState } from "../../shared/ui";

type OverrideForm = { overrideAction: string; reasonFa: string };

export function DecisionsPage() {
  const [action, setAction] = useState("");
  const [evidence, setEvidence] = useState("");
  const [search, setSearch] = useState("");
  const [mobileExpanded, setMobileExpanded] = useState(false);
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
  const visibleItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fa");
    if (!needle) return query.data?.items || [];
    return (query.data?.items || []).filter((item) =>
      [item.customerIdHash, item.stateFa, item.recommendedActionFa, item.incentivePolicyFa]
        .some((value) => value.toLocaleLowerCase("fa").includes(needle)),
    );
  }, [query.data, search]);
  const summary = useMemo(() => ({
    total: query.data?.total ?? null,
    loaded: query.data?.items.length ?? null,
    blocked: query.data?.items.filter((item) => !item.incentiveAllowed).length ?? null,
  }), [query.data]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><span className="eyebrow">تصمیم‌ها</span><h1>صف تصمیم قابل حسابرسی</h1></div>
        <div className="page-summary"><span>{formatNumber(summary.total)} تصمیم</span><span>{formatNumber(summary.blocked)} از {formatNumber(summary.loaded)} ردیف بارگذاری‌شده بدون مجوز مشوق</span></div>
      </header>

      <section className="table-panel">
        <div className="table-toolbar">
          <div className="toolbar-title"><Filter aria-hidden="true" size={18} /><strong>فیلتر صف</strong></div>
          <label className="table-search"><Search aria-hidden="true" size={17} /><span className="sr-only">جست‌وجوی صف تصمیم</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="شناسه، وضعیت یا اقدام" /></label>
          <label><span className="sr-only">فیلتر اقدام</span><select value={action} onChange={(event) => setAction(event.target.value)}><option value="">همه اقدام‌ها</option><option value="no_action">بدون اقدام</option><option value="message_no_discount">پیام بدون تخفیف</option><option value="targeted_discount">تخفیف هدفمند</option></select></label>
          <label><span className="sr-only">فیلتر شواهد</span><select value={evidence} onChange={(event) => setEvidence(event.target.value)}><option value="">همه شواهد</option><option value="observational_estimate">برآورد مشاهده‌ای</option><option value="pilot_estimate">برآورد پایلوت</option><option value="verified_incremental">اثر تأییدشده</option></select></label>
        </div>

        {query.isLoading ? <LoadingState label="در حال دریافت صف تصمیم…" /> : null}
        {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null}
        {query.data && !visibleItems.length ? <EmptyState title="تصمیمی در این فیلتر نیست" description="عبارت جست‌وجو یا فیلتر را تغییر دهید؛ برای ساخت صف جدید، ابتدا داده را وارد کنید." /> : null}
        {visibleItems.length ? (
          <>
            <div className="table-scroll decision-table" tabIndex={0} aria-label="جدول تصمیم‌ها؛ برای مشاهده ستون‌های بیشتر پیمایش کنید">
              <table>
              <thead><tr><th>شناسه</th><th>وضعیت</th><th>اقدام</th><th>سیاست مشوق</th><th>شواهد</th><th>سود مورد انتظار</th><th><span className="sr-only">جزئیات</span></th></tr></thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.decisionId}>
                    <td><bdi className="technical-id">{shortId(item.customerIdHash, 14)}</bdi></td>
                    <td><span className="decision-state">{decisionStateLabels[item.state] || item.stateFa}</span></td>
                    <td><strong>{item.override?.action ? "تصمیم انسانی ثبت‌شده" : item.recommendedActionFa}</strong>{item.override?.action ? <small className="cell-note">جایگزین پیشنهاد سیستم</small> : null}</td>
                    <td>{item.incentivePolicyFa}</td>
                    <td><EvidenceBadge level={item.evidenceLevel} label={item.evidenceLabelFa} /></td>
                    <td><span className="money-cell">{formatToman(item.expectedIncrementalProfit)}</span><small className="cell-note">{item.evidenceLevel === "verified_incremental" ? "اثر تأییدشده" : "برآورد؛ نه نتیجه قطعی"}</small></td>
                    <td><button className="icon-button" type="button" aria-label={`مشاهده رسید تصمیم ${item.customerIdHash}`} title="رسید تصمیم" onClick={() => setSelected(item)}><ChevronLeft aria-hidden="true" size={19} /></button></td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <ul className={`decision-cards ${mobileExpanded ? "is-expanded" : ""}`} aria-label="صف تصمیم‌ها">
              {visibleItems.map((item) => (
                <li key={item.decisionId}>
                  <div className="decision-card-head"><span className="decision-state">{decisionStateLabels[item.state] || item.stateFa}</span><EvidenceBadge level={item.evidenceLevel} label={item.evidenceLabelFa} /></div>
                  <strong>{item.override?.action ? "تصمیم انسانی ثبت‌شده" : item.recommendedActionFa}</strong>
                  <p>{item.incentivePolicyFa}</p>
                  <dl><div><dt>شناسه</dt><dd><bdi>{shortId(item.customerIdHash, 16)}</bdi></dd></div><div><dt>{item.evidenceLevel === "verified_incremental" ? "اثر تأییدشده" : "برآورد سود"}</dt><dd>{formatToman(item.expectedIncrementalProfit)}</dd></div></dl>
                  <button className="button button-secondary" type="button" onClick={() => setSelected(item)}>مشاهده رسید<ChevronLeft aria-hidden="true" size={18} /></button>
                </li>
              ))}
            </ul>
            {visibleItems.length > 10 ? <button className="button button-secondary mobile-list-toggle" type="button" onClick={() => setMobileExpanded((value) => !value)}>{mobileExpanded ? "نمایش خلاصه" : `نمایش ${formatNumber(visibleItems.length - 10)} تصمیم دیگر`}</button> : null}
          </>
        ) : null}
      </section>

      <Drawer open={Boolean(selected)} title={selected?.recommendedActionFa || "رسید تصمیم"} description={selected?.decisionReasonFa} onClose={() => setSelected(null)}>
        {selected ? (
          <>
            {receipt.isLoading ? <LoadingState label="در حال ساخت رسید تصمیم…" /> : null}
            {receipt.isError ? <ErrorState error={receipt.error} onRetry={() => receipt.refetch()} /> : null}
            <section className="receipt-verdict" aria-labelledby="receipt-verdict-title"><span>پیشنهاد قابل حسابرسی</span><h3 id="receipt-verdict-title">{selected.recommendedActionFa}</h3><p>{selected.decisionReasonFa}</p></section>
            <div className="receipt-status"><EvidenceBadge level={receipt.data?.decision.evidenceLevel || selected.evidenceLevel} label={selected.evidenceLabelFa} />{!selected.incentiveAllowed ? <span className="guardrail-badge"><ShieldAlert aria-hidden="true" size={15} />مشوق مجاز نیست</span> : null}<button className="button button-secondary receipt-print" type="button" onClick={() => window.print()}><Printer aria-hidden="true" size={17} />چاپ رسید</button></div>
            <dl className="receipt-facts">
              <div><dt>شناسه تصمیم</dt><dd><bdi>{receipt.data?.decision.decisionId || selected.decisionId}</bdi></dd></div>
              <div><dt>شناسه ناشناس مشتری</dt><dd><bdi>{receipt.data?.decision.customerIdHash || selected.customerIdHash}</bdi></dd></div>
              <div><dt>تاریخ تصمیم</dt><dd>{formatDate(selected.asOf)}</dd></div>
              <div><dt>اعتماد</dt><dd>{receipt.data?.decision.confidenceFa || selected.confidenceFa}</dd></div>
              <div><dt>نسخه سیاست</dt><dd><bdi>{shortId(receipt.data?.versions.policyVersion || selected.policyVersion)}</bdi></dd></div>
              <div><dt>نسخه داده</dt><dd><bdi>{shortId(receipt.data?.versions.datasetVersion || selected.datasetVersion)}</bdi></dd></div>
              <div><dt>نسخه مدل</dt><dd><bdi>{shortId(receipt.data?.versions.modelVersion || selected.modelVersion)}</bdi></dd></div>
              <div><dt>{selected.evidenceLevel === "verified_incremental" ? "سود افزایشی تأییدشده" : "برآورد سود افزایشی"}</dt><dd>{formatToman(receipt.data?.decision.expectedIncrementalProfit ?? selected.expectedIncrementalProfit)}</dd></div>
            </dl>
            <section className="receipt-section"><h3>مجهولات تصمیم</h3><ul className="plain-list">{receipt.data?.unknowns.length ? receipt.data.unknowns.map((item) => <li key={item}><bdi>{item}</bdi></li>) : <li>مورد ثبت‌شده‌ای نیست.</li>}</ul></section>
            <section className="receipt-section"><h3>قواعد حفاظتی</h3><ul className="plain-list">{(receipt.data?.guardrails || selected.guardrails).map((item) => <li key={item}><bdi>{item}</bdi></li>)}</ul></section>
            <section className="receipt-section"><h3>گزینه‌های سیاست</h3><ul className="plain-list">{(receipt.data?.alternatives || selected.actionAlternatives).map((item) => <li key={item.action}><span>{item.labelFa}</span><bdi>{item.status}</bdi></li>)}</ul></section>
            {selected.override ? <section className="receipt-section"><h3>تصمیم انسانی ثبت‌شده</h3><p>{selected.override.reasonFa}</p><small>{formatDate(selected.override.createdAt)}</small></section> : null}
            <form className="override-form" onSubmit={form.handleSubmit((values) => overrideMutation.mutate(values))}>
              <h3>ثبت تصمیم انسانی جایگزین</h3>
              <label className="field"><span>اقدام جایگزین</span><select {...form.register("overrideAction")} disabled={!canOverride}><option value="no_action">بدون اقدام</option><option value="message_no_discount">پیام بدون تخفیف</option><option value="targeted_discount">تخفیف هدفمند، فقط در آزمون</option></select></label>
              <label className="field"><span>دلیل قابل حسابرسی</span><textarea {...form.register("reasonFa", { minLength: 12, required: true })} disabled={!canOverride} rows={3} /></label>
              {!canOverride ? <p className="form-message">نقش مشاهده‌گر اجازه تغییر تصمیم ندارد.</p> : null}
              {overrideMutation.error ? <p className="form-message is-error" role="alert">{(overrideMutation.error as Error).message}</p> : null}
              <button className="button button-primary" type="submit" disabled={!canOverride || overrideMutation.isPending}>{overrideMutation.isPending ? "در حال ثبت…" : "ثبت تصمیم جایگزین"}</button>
            </form>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { api } from "../../shared/api/client";
import { formatDate, formatNumber, formatToman, shortId } from "../../shared/lib/format";
import { ErrorState, EvidenceBadge, LoadingState } from "../../shared/ui";
import { personaLabels, usePersona } from "../persona";

export function ReportPage() {
  const { persona } = usePersona();
  const query = useQuery({ queryKey: ["retention-readout", persona], queryFn: () => api.readout(persona) });
  if (query.isLoading) return <LoadingState label="در حال ساخت گزارش مدیریتی…" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const report = query.data;
  const metric = report.primaryMetric.available
    ? report.primaryMetric.unit === "toman"
      ? formatToman(report.primaryMetric.value)
      : report.primaryMetric.unit === "day"
        ? `${formatNumber(report.primaryMetric.value)} روز`
        : formatNumber(report.primaryMetric.value)
    : "ناموجود";
  const sample = report.dataContext.provenance === "sample_data";

  return (
    <main className="report-canvas" dir="rtl" lang="fa">
      <button className="button button-secondary print-button" type="button" onClick={() => window.print()}><Printer aria-hidden="true" size={17} />چاپ یا ذخیره PDF</button>
      <article className={`a4-report ${persona === "finance" ? "is-finance" : ""}`}>
        {sample ? <div className="report-watermark">داده نمونه · قابل ارائه به‌عنوان نتیجه مشتری نیست</div> : null}
        <header><div><span className="report-brand">MarginLift</span><h1>گزارش یک‌صفحه‌ای تصمیم</h1><p>{report.organization.name} · نمای {personaLabels[persona]}</p></div><EvidenceBadge level={report.evidence.key} label={report.evidence.labelFa} /></header>

        <section className="report-decision"><span>تصمیم فعلی</span><h2>{report.decision.decisionFa}</h2><p>{report.decision.headlineFa}</p></section>

        <dl className="report-metrics">
          <div><dt>{report.primaryMetric.labelFa}</dt><dd>{metric}</dd></div>
          <div><dt>مرحله تصمیم</dt><dd><bdi>{report.decision.state}</bdi></dd></div>
          <div><dt>محیط داده</dt><dd>{report.dataContext.environmentLabelFa}</dd></div>
          <div><dt>تاریخ تولید</dt><dd>{formatDate(report.generatedAt)}</dd></div>
        </dl>

        <section className="report-evidence">
          <div><h3>مرز شواهد</h3><p>{report.evidence.boundary.claimFa}</p></div>
          <dl><div><dt>ریسک اصلی</dt><dd>{report.riskFa}</dd></div><div><dt>مجوز Scale</dt><dd>{report.evidence.boundary.canRecommendScale ? "مجاز با Guardrail" : "مجاز نیست"}</dd></div></dl>
        </section>

        {persona === "finance" ? <section className="report-evidence finance-readout" aria-labelledby="finance-readout-title">
          <div>
            <h3 id="finance-readout-title">کنترل مالی تصمیم</h3>
            <p>{report.financeVerified ? "اعداد با منبع Finance تطبیق داده شده‌اند." : "تطبیق Finance هنوز کامل نشده است."}</p>
          </div>
          <dl>
            <div><dt>فاصله اطمینان ۹۵٪</dt><dd>{report.confidenceInterval95 ? `${formatToman(report.confidenceInterval95.lower)} تا ${formatToman(report.confidenceInterval95.upper)}` : "ناموجود"}</dd></div>
            <div><dt>Reconciliation</dt><dd>{report.reconciliation?.status === "verified" ? "تأییدشده" : "تأییدنشده"}</dd></div>
            <div><dt>Guardrailها</dt><dd>{report.guardrails?.passed ? "همه پاس شده‌اند" : "نیازمند بازبینی"}</dd></div>
          </dl>
          {report.guardrails?.checks?.length ? <ul>{report.guardrails.checks.map((item) => <li key={item.key}><strong>{item.passed ? "پاس" : "رد"}</strong> {item.labelFa}: {formatNumber(item.observed)} در برابر {item.threshold === null ? "حد ناموجود" : formatNumber(item.threshold)}</li>)}</ul> : null}
        </section> : null}

        <section className="report-next"><h3>سه اقدام دارای مالک</h3><ol>{report.owners.slice(0, 3).map((item) => <li key={`${item.roleFa}-${item.actionFa}`}><strong>{item.roleFa}</strong><span>{item.actionFa}</span></li>)}</ol></section>

        <footer><span>Analysis: <bdi>{shortId(report.versions.analysisId)}</bdi></span><span>Policy: <bdi>{shortId(report.versions.policyVersion)}</bdi></span><span>Dataset: <bdi>{shortId(report.versions.datasetHash)}</bdi></span></footer>
      </article>
    </main>
  );
}

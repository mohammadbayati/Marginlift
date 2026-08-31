import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../shared/api/client";
import { formatNumber, formatToman } from "../../shared/lib/format";
import { ErrorState, EvidenceBadge, LoadingState } from "../../shared/ui";
import { usePersona } from "../persona";

export function TodayPage() {
  const { persona } = usePersona();
  const query = useQuery({ queryKey: ["retention-workspace"], queryFn: api.retentionWorkspace });

  if (query.isLoading) return <LoadingState label="در حال آماده‌سازی تصمیم امروز…" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { workspace, analysis, today } = query.data;
  const metricValue = today.primaryMetric.available
    ? today.primaryMetric.unit === "toman"
      ? formatToman(today.primaryMetric.value)
      : today.primaryMetric.unit === "day"
        ? `${formatNumber(today.primaryMetric.value)} روز`
        : formatNumber(today.primaryMetric.value)
    : "ناموجود";

  return (
    <div className="page-stack page-today">
      <header className="page-header">
        <div>
          <span className="eyebrow">امروز · نمای {persona === "executive" ? "مدیریت" : persona === "crm" ? "CRM" : persona === "finance" ? "مالی" : "داده"}</span>
          <h1>یک تصمیم، با مرز ادعای روشن</h1>
        </div>
        <span className="as-of">برش داده: {analysis?.cutoffAt ? <bdi>{analysis.cutoffAt.slice(0, 10)}</bdi> : "ثبت نشده"}</span>
      </header>

      <section className="decision-brief" aria-labelledby="today-decision-title">
        <div className="decision-copy">
          <div className="decision-meta">
            <span>تصمیم پیشنهادی</span>
            <EvidenceBadge level={today.evidenceLevel} label={today.evidence.labelFa} />
          </div>
          <h2 id="today-decision-title">{today.decisionFa}</h2>
          <p>{today.headlineFa}</p>
          <p className="claim-copy">{today.claimBoundary.claimFa}</p>
          <small className="decision-blocker">مانع فعلی: {today.blockerFa}</small>
        </div>
        <dl className="single-metric">
          <div>
            <dt>{today.primaryMetric.labelFa}</dt>
            <dd>{metricValue}</dd>
            <dd className="metric-note">{today.primaryMetric.available ? today.labelFa : "تا وجود شواهد معتبر، عددی ساخته نمی‌شود."}</dd>
          </div>
        </dl>
        <Link className="button button-primary decision-cta" to={today.cta.href}>
          {today.cta.labelFa}
          <ArrowLeft aria-hidden="true" size={17} />
        </Link>
      </section>

      <section className="context-line" aria-label="وضعیت عملیاتی">
        <div><span>ردیف تحلیل‌شده</span><strong>{formatNumber(analysis?.rowCount ?? 0)}</strong></div>
        <div><span>مجاز برای تماس</span><strong>{formatNumber(workspace.metrics.contactAllowed)}</strong></div>
        <div><span>مالک اقدام</span><strong>{today.ownerFa}</strong></div>
        <div><span>اقدام بعدی</span><strong>{today.nextActionFa}</strong></div>
      </section>
    </div>
  );
}

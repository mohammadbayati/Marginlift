import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../shared/api/client";
import { formatNumber, formatToman } from "../../shared/lib/format";
import { ErrorState, EvidenceBadge, LoadingState } from "../../shared/ui";
import { usePersona } from "../persona";

const personaFocus = {
  executive: "اثر مالی و تصمیم سرمایه‌گذاری",
  crm: "صف اقدام و محدودیت تماس",
  finance: "سود، هزینه و قابلیت تطبیق",
  data: "کیفیت داده و زنجیره شواهد",
} as const;

const provenanceLabels = {
  no_data: "داده‌ای ثبت نشده",
  sample_data: "داده نمونه",
  customer_data_without_verified_pilot: "داده مشتری · بدون پایلوت تأییدشده",
} as const;

export function TodayPage() {
  const { persona } = usePersona();
  const query = useQuery({ queryKey: ["retention-workspace"], queryFn: api.retentionWorkspace });

  if (query.isLoading) return <LoadingState label="در حال آماده‌سازی تصمیم امروز…" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { workspace, analysis, today, dataContext } = query.data;
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

      <section className="trust-strip" aria-label="شناسنامه تصمیم">
        <div><span>محیط داده</span><strong>{provenanceLabels[dataContext.provenance]}</strong></div>
        <div><span>منبع</span><strong>{dataContext.source || "ثبت نشده"}</strong></div>
        <div><span>حجم بررسی</span><strong>{formatNumber(dataContext.rowCount ?? analysis?.rowCount ?? null)} ردیف</strong></div>
        <div><span>تمرکز این نما</span><strong>{personaFocus[persona]}</strong></div>
      </section>

      <section className="value-path" aria-labelledby="value-path-title">
        <div className="value-path-intro">
          <span className="eyebrow">خروجی این چرخه</span>
          <h2 id="value-path-title">از داده‌ی ناشناس تا تصمیمی که بتوان آن را توضیح داد.</h2>
          <p>{analysis ? "این تحلیل آماده‌ی بازبینی است؛ هر عدد باید همراه با منبع، تاریخ و سطح شواهد خوانده شود." : "این محیط بعد از ورود داده، فقط سه خروجی عملی می‌سازد: آمادگی، تصمیم و مدرک قابل بازبینی."}</p>
        </div>
        <ol className="value-path-steps">
          <li><strong>۰۱</strong><span>آمادگی داده و مرز ادعا</span></li>
          <li><strong>۰۲</strong><span>اقدام یا عدم اقدام برای تیم اجرا</span></li>
          <li><strong>۰۳</strong><span>گزارش و رسید تصمیم برای مدیریت</span></li>
        </ol>
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

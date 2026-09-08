import { useQuery } from "@tanstack/react-query";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../shared/api/client";
import type { EvidenceLevel } from "../../shared/api/schemas";
import { formatDate, formatNumber, formatToman } from "../../shared/lib/format";
import { axisMoney, probabilityTooltip, waterfallRanges } from "../../shared/lib/visual";
import { EmptyState, ErrorState, EvidenceBadge, LoadingState } from "../../shared/ui";

type FinancialPoint = { key: string; labelFa: string; value: number | null; kind?: string; sampleSize?: number | null };
type CohortPoint = { timeDays: number; atRisk: number; survivalProbability: number; confidenceLower: number; confidenceUpper: number; confidenceRange: [number, number] };
type LadderPoint = { level: EvidenceLevel; labelFa: string; claimFa: string; reached: boolean; current: boolean; blockerFa: string | null };

const primary = "#315DDE";
const verified = "#007B5E";
const warning = "#A65A00";

function unavailableReason(reason?: string) {
  const labels: Record<string, string> = {
    financial_components_unavailable: "برای تفکیک مالی، ستون سود مشارکتی لازم است.",
    registered_experiment_outcome_required: "این نمودار پس از ثبت آزمایش و دریافت Outcome نمایش داده می‌شود.",
    kaplan_meier_curve_unavailable: "برای منحنی نگهداشت، پوشش زمانی و خرید تکراری کافی نیست.",
  };
  return labels[reason || ""] || "داده کافی برای این نمودار وجود ندارد.";
}

function ChartUnavailable({ reason }: { reason?: string }) {
  return <EmptyState title="هنوز قابل محاسبه نیست" description={unavailableReason(reason)} />;
}

export function EvidencePage() {
  const query = useQuery({ queryKey: ["retention-workspace"], queryFn: api.retentionWorkspace });
  if (query.isLoading) return <LoadingState label="در حال آماده‌سازی شواهد…" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { evidence, visualizations, analysis } = query.data;
  const waterfall = visualizations.profitWaterfall;
  const comparison = visualizations.treatmentControl;
  const cohort = visualizations.retentionCohort;
  const ladder = visualizations.evidenceLadder;
  const waterfallData = waterfallRanges((waterfall.data || []) as FinancialPoint[]);
  const comparisonData = (comparison.data || []) as FinancialPoint[];
  const cohortData = ((cohort.data || []) as Omit<CohortPoint, "confidenceRange">[]).map((point) => ({
    ...point,
    confidenceRange: [point.confidenceLower, point.confidenceUpper] as [number, number],
  }));
  const ladderData = (ladder.data || []) as LadderPoint[];
  const interval = comparison.confidenceInterval95 as { lower: number; upper: number } | null;
  const integrity = comparison.integrity as { valid?: boolean; status?: string } | null;

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">شواهد</span><h1>اتاق شواهد تصمیم</h1></div><EvidenceBadge level={evidence.key} label={evidence.labelFa} /></header>
      <p className="evidence-boundary">{evidence.claimFa}</p>
      <p className="as-of">برش داده: {formatDate(analysis?.cutoffAt)} · مقادیر مالی به تومان؛ مقایسه پایلوت به ازای هر مشتری تخصیص‌یافته.</p>

      <div className="evidence-grid">
        <figure className="visual-panel" aria-labelledby="waterfall-title">
          <figcaption><span>۰۱ · تفکیک سود</span><strong id="waterfall-title">سود از کدام جزء می‌آید؟</strong><small>{waterfall.descriptionFa || "تفکیک مالی تصمیم"}</small></figcaption>
          {waterfall.available ? <>
            <div className="chart-frame" aria-label="نمودار تفکیک سود">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={waterfallData} accessibilityLayer margin={{ top: 16, right: 12, bottom: 8, left: 4 }}><CartesianGrid stroke="#D9DEE5" vertical={false} strokeDasharray="3 3" /><XAxis dataKey="labelFa" tick={{ fontSize: 11 }} interval={0} tickLine={false} /><YAxis tickFormatter={axisMoney} width={62} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><ReferenceLine y={0} stroke="#626A76" /><Tooltip formatter={(_value, _name, item) => [formatToman(item.payload.value), "مقدار جزء"]} /><Bar dataKey="range" maxBarSize={60} isAnimationActive={false} radius={2}>{waterfallData.map((item) => <Cell key={item.key} fill={item.kind === "delta" && waterfall.evidenceLevel === "verified_incremental" ? verified : item.value !== null && item.value < 0 ? warning : primary} />)}</Bar></BarChart></ResponsiveContainer>
            </div>
            <table className="chart-table"><caption>جدول جایگزین تفکیک سود</caption><thead><tr><th>جزء</th><th>مقدار</th></tr></thead><tbody>{waterfallData.map((item) => <tr key={item.key}><td>{item.labelFa}</td><td>{formatToman(item.value)}</td></tr>)}</tbody></table>
          </> : <ChartUnavailable reason={waterfall.reason} />}
          <footer><EvidenceBadge level={waterfall.evidenceLevel} /><span>{waterfall.sourceFa}</span></footer>
        </figure>

        <figure className="visual-panel" aria-labelledby="treatment-title">
          <figcaption><span>۰۲ · اقدام و کنترل</span><strong id="treatment-title">آیا سیاست جدید تفاوتی ایجاد کرده؟</strong><small>{comparison.descriptionFa || "مقایسه ITT دو سیاست"}</small></figcaption>
          {comparison.available ? <>
            <div className="chart-frame" aria-label="نمودار مقایسه سیاست‌ها">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={comparisonData} layout="vertical" accessibilityLayer><CartesianGrid stroke="#D9DEE5" horizontal={false} strokeDasharray="3 3" /><XAxis type="number" tickFormatter={axisMoney} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="labelFa" width={106} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><ReferenceLine x={0} stroke="#626A76" /><Tooltip formatter={(value) => [formatToman(Number(value)), "میانگین سود ITT"]} /><Bar dataKey="value" maxBarSize={36} isAnimationActive={false} radius={2}>{comparisonData.map((item) => <Cell key={item.key} fill={item.key === "control" ? "#626A76" : primary} />)}</Bar></BarChart></ResponsiveContainer>
            </div>
            <dl className="comparison-summary"><div><dt>تفاوت میانگین ITT</dt><dd>{formatToman(typeof comparison.estimate === "number" ? comparison.estimate : null)}</dd></div><div><dt>فاصله اطمینان ۹۵٪ تفاوت</dt><dd>{interval ? `${formatToman(interval.lower)} تا ${formatToman(interval.upper)}` : "ناموجود"}</dd></div><div><dt>یکپارچگی آزمایش</dt><dd>{integrity?.valid === true ? "معتبر" : integrity?.valid === false ? "نیازمند بررسی" : "وضعیت تأیید نشده"}</dd></div></dl>
            <table className="chart-table"><caption>داده جایگزین مقایسه سیاست‌ها</caption><thead><tr><th>سیاست</th><th>میانگین سود</th><th>نمونه</th></tr></thead><tbody>{comparisonData.map((item) => <tr key={item.key}><td>{item.labelFa}</td><td>{formatToman(item.value)}</td><td>{formatNumber(item.sampleSize)}</td></tr>)}</tbody></table>
          </> : <ChartUnavailable reason={comparison.reason} />}
          <footer><EvidenceBadge level={comparison.evidenceLevel} /><span>{comparison.sourceFa}</span></footer>
        </figure>

        <figure className="visual-panel" aria-labelledby="cohort-title">
          <figcaption><span>۰۳ · چرخه مشتری</span><strong id="cohort-title">چه مدت تا خرید مجدد باقی می‌ماند؟</strong><small>{cohort.descriptionFa || "منحنی Kaplan–Meier"}</small></figcaption>
          {cohort.available ? <>
            <div className="chart-frame" aria-label="منحنی احتمال عدم خرید مجدد">
              <ResponsiveContainer width="100%" height="100%"><ComposedChart data={cohortData} accessibilityLayer><CartesianGrid stroke="#D9DEE5" vertical={false} strokeDasharray="3 3" /><XAxis dataKey="timeDays" type="number" domain={[0, "dataMax"]} tickFormatter={formatNumber} unit=" روز" tick={{ fontSize: 11 }} /><YAxis domain={[0, 1]} width={48} tickFormatter={(value) => `${formatNumber(Number(value) * 100)}٪`} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={(value) => `روز ${formatNumber(Number(value))}`} formatter={(value, key) => [probabilityTooltip(value), key === "confidenceRange" ? "بازه اطمینان" : "احتمال عدم خرید مجدد"]} /><Area type="stepAfter" dataKey="confidenceRange" stroke="none" fill={primary} fillOpacity={0.12} isAnimationActive={false} /><Line type="stepAfter" dataKey="survivalProbability" stroke={primary} strokeWidth={2.5} dot={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer>
            </div>
            <p className="chart-note">خط: احتمال عدم خرید مجدد · ناحیه: فاصله اطمینان. با کاهش تعداد در معرض، پشتیبانی نمونه کمتر می‌شود.</p>
            <details className="chart-data"><summary>جدول کامل منحنی و پشتیبانی نمونه</summary><div className="table-scroll" tabIndex={0} aria-label="جدول منحنی خرید مجدد"><table className="chart-table"><caption>احتمال عدم خرید مجدد؛ Kaplan–Meier</caption><thead><tr><th>روز</th><th>احتمال</th><th>بازه اطمینان</th><th>در معرض</th></tr></thead><tbody>{cohortData.map((item) => <tr key={item.timeDays}><td>{formatNumber(item.timeDays)}</td><td>{formatNumber(item.survivalProbability * 100)}٪</td><td>{probabilityTooltip(item.confidenceRange)}</td><td>{formatNumber(item.atRisk)}</td></tr>)}</tbody></table></div></details>
          </> : <ChartUnavailable reason={cohort.reason} />}
          <footer><EvidenceBadge level={cohort.evidenceLevel} /><span>{cohort.sourceFa}</span></footer>
        </figure>

        <section className="visual-panel claim-panel" aria-labelledby="claim-title">
          <div className="figure-heading"><span>۰۴ · نردبان شواهد</span><strong id="claim-title">تا ادعای تأییدشده چه فاصله‌ای داریم؟</strong><small>{ladder.descriptionFa}</small></div>
          <ol className="claim-ladder">
            {ladderData.map((item, index) => <li key={item.level} aria-current={item.current ? "step" : undefined} className={`${item.reached ? "is-reached" : ""} ${item.current ? "is-current" : ""}`}><span>{formatNumber(index + 1)}</span><div><strong>{item.labelFa}</strong><em>{item.current ? "مرحله فعلی" : item.reached ? "پشت سر گذاشته‌شده" : "هنوز نرسیده‌ایم"}</em><small>{item.claimFa}</small>{item.current && item.blockerFa ? <p>مانع بعدی: {item.blockerFa}</p> : null}</div></li>)}
          </ol>
          <footer><EvidenceBadge level={ladder.evidenceLevel} /><span>{ladder.sourceFa}</span></footer>
        </section>
      </div>
    </div>
  );
}

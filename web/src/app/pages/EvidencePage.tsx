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
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../shared/api/client";
import type { EvidenceLevel } from "../../shared/api/schemas";
import { formatNumber, formatToman } from "../../shared/lib/format";
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

  const { evidence, visualizations } = query.data;
  const waterfall = visualizations.profitWaterfall;
  const comparison = visualizations.treatmentControl;
  const cohort = visualizations.retentionCohort;
  const ladder = visualizations.evidenceLadder;
  const waterfallData = (waterfall.data || []) as FinancialPoint[];
  const comparisonData = (comparison.data || []) as FinancialPoint[];
  const cohortData = ((cohort.data || []) as Omit<CohortPoint, "confidenceRange">[]).map((point) => ({
    ...point,
    confidenceRange: [point.confidenceLower, point.confidenceUpper] as [number, number],
  }));
  const ladderData = (ladder.data || []) as LadderPoint[];

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">شواهد</span><h1>Evidence Room</h1></div><EvidenceBadge level={evidence.key} label={evidence.labelFa} /></header>
      <p className="evidence-boundary">{evidence.claimFa}</p>

      <div className="evidence-grid">
        <figure className="visual-panel" aria-labelledby="waterfall-title">
          <figcaption><span>اثر مالی</span><strong id="waterfall-title">Profit Waterfall</strong><small>{waterfall.descriptionFa || "تفکیک مالی تصمیم"}</small></figcaption>
          {waterfall.available ? <>
            <div className="chart-frame" aria-label="نمودار تفکیک سود">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={waterfallData} accessibilityLayer><CartesianGrid stroke="#E5E9EE" vertical={false} /><XAxis dataKey="labelFa" /><YAxis tickFormatter={(value) => formatNumber(Number(value))} /><Tooltip formatter={(value) => formatToman(Number(value))} /><Bar dataKey="value" radius={[4, 4, 0, 0]}>{waterfallData.map((item) => <Cell key={item.key} fill={item.kind === "delta" && evidence.key === "verified_incremental" ? verified : item.value !== null && item.value < 0 ? warning : primary} />)}</Bar></BarChart></ResponsiveContainer>
            </div>
            <table className="chart-table"><caption>داده جایگزین Profit Waterfall</caption><thead><tr><th>جزء</th><th>مقدار</th></tr></thead><tbody>{waterfallData.map((item) => <tr key={item.key}><td>{item.labelFa}</td><td>{formatToman(item.value)}</td></tr>)}</tbody></table>
          </> : <ChartUnavailable reason={waterfall.reason} />}
          <footer><EvidenceBadge level={waterfall.evidenceLevel} /><span>{waterfall.sourceFa}</span></footer>
        </figure>

        <figure className="visual-panel" aria-labelledby="treatment-title">
          <figcaption><span>طراحی آزمایش</span><strong id="treatment-title">Treatment و Control</strong><small>{comparison.descriptionFa || "مقایسه ITT دو سیاست"}</small></figcaption>
          {comparison.available ? <>
            <div className="chart-frame" aria-label="نمودار مقایسه سیاست‌ها">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={comparisonData} layout="vertical" accessibilityLayer><CartesianGrid stroke="#E5E9EE" horizontal={false} /><XAxis type="number" tickFormatter={(value) => formatNumber(Number(value))} /><YAxis type="category" dataKey="labelFa" width={112} /><Tooltip formatter={(value) => formatToman(Number(value))} /><Bar dataKey="value" fill={primary} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer>
            </div>
            <table className="chart-table"><caption>داده جایگزین مقایسه سیاست‌ها</caption><thead><tr><th>سیاست</th><th>میانگین سود</th><th>نمونه</th></tr></thead><tbody>{comparisonData.map((item) => <tr key={item.key}><td>{item.labelFa}</td><td>{formatToman(item.value)}</td><td>{formatNumber(item.sampleSize)}</td></tr>)}</tbody></table>
          </> : <ChartUnavailable reason={comparison.reason} />}
          <footer><EvidenceBadge level={comparison.evidenceLevel} /><span>{comparison.sourceFa}</span></footer>
        </figure>

        <figure className="visual-panel" aria-labelledby="cohort-title">
          <figcaption><span>چرخه مشتری</span><strong id="cohort-title">Retention Cohort</strong><small>{cohort.descriptionFa || "منحنی Kaplan–Meier"}</small></figcaption>
          {cohort.available ? <>
            <div className="chart-frame" aria-label="منحنی احتمال عدم خرید مجدد">
              <ResponsiveContainer width="100%" height="100%"><ComposedChart data={cohortData} accessibilityLayer><CartesianGrid stroke="#E5E9EE" vertical={false} /><XAxis dataKey="timeDays" unit=" روز" /><YAxis domain={[0, 1]} tickFormatter={(value) => `${formatNumber(Number(value) * 100)}٪`} /><Tooltip formatter={(value, key) => key === "atRisk" ? formatNumber(Number(value)) : `${formatNumber(Number(value) * 100)}٪`} /><Area type="stepAfter" dataKey="confidenceRange" stroke="none" fill={primary} fillOpacity={0.12} isAnimationActive={false} /><Line type="stepAfter" dataKey="survivalProbability" stroke={primary} strokeWidth={2.5} dot={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer>
            </div>
            <table className="chart-table"><caption>داده جایگزین Retention Cohort</caption><thead><tr><th>روز</th><th>احتمال</th><th>در معرض</th></tr></thead><tbody>{cohortData.slice(0, 12).map((item) => <tr key={item.timeDays}><td>{formatNumber(item.timeDays)}</td><td>{formatNumber(item.survivalProbability * 100)}٪</td><td>{formatNumber(item.atRisk)}</td></tr>)}</tbody></table>
          </> : <ChartUnavailable reason={cohort.reason} />}
          <footer><EvidenceBadge level={cohort.evidenceLevel} /><span>{cohort.sourceFa}</span></footer>
        </figure>

        <section className="visual-panel claim-panel" aria-labelledby="claim-title">
          <div className="figure-heading"><span>مرز ادعا</span><strong id="claim-title">Evidence Ladder</strong><small>{ladder.descriptionFa}</small></div>
          <ol className="claim-ladder">
            {ladderData.map((item, index) => <li key={item.level} className={`${item.reached ? "is-reached" : ""} ${item.current ? "is-current" : ""}`}><span>{formatNumber(index + 1)}</span><div><strong>{item.labelFa}</strong><small>{item.current ? item.blockerFa : item.claimFa}</small></div></li>)}
          </ol>
          <footer><EvidenceBadge level={ladder.evidenceLevel} /><span>{ladder.sourceFa}</span></footer>
        </section>
      </div>
    </div>
  );
}

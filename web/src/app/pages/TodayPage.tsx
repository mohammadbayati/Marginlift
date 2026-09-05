import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, CircleOff, FileCheck2, FileText, PlayCircle, Repeat2, ShieldCheck, UsersRound } from "lucide-react";
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
  const queryClient = useQueryClient();
  const [demoPreset, setDemoPreset] = useState<"generic_ecommerce" | "super_app_packages" | "subscription_services">("generic_ecommerce");
  const session = useQuery({ queryKey: ["session"], queryFn: api.session, staleTime: 60_000 });
  const query = useQuery({ queryKey: ["retention-workspace"], queryFn: api.retentionWorkspace });
  const demo = useMutation({
    mutationFn: api.loadDemoScenario,
    onSuccess: (data) => {
      queryClient.setQueryData(["retention-workspace"], data);
      void queryClient.invalidateQueries({ queryKey: ["decisions"] });
    },
  });

  if (query.isLoading) return <LoadingState label="در حال آماده‌سازی تصمیم امروز…" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { workspace, analysis, today, dataContext } = query.data;
  const canRunDemo = session.data?.role !== "viewer";
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

      <section className="executive-pulse" aria-label="خلاصه عملیاتی امروز">
        <div className="pulse-lead">
          <span className="pulse-kicker"><ShieldCheck aria-hidden="true" size={15} />وضعیت تصمیم</span>
          <strong>{workspace.statusFa}</strong>
          <small>{workspace.headlineFa}</small>
        </div>
        <dl className="pulse-metrics">
          <div><dt><UsersRound aria-hidden="true" size={16} />صف بررسی</dt><dd>{formatNumber(workspace.metrics.queueSize)}</dd></div>
          <div><dt><ShieldCheck aria-hidden="true" size={16} />مجاز برای تماس</dt><dd>{formatNumber(workspace.metrics.contactAllowed)}</dd></div>
          <div><dt><CircleOff aria-hidden="true" size={16} />متوقف‌شده</dt><dd>{formatNumber(workspace.metrics.contactBlocked)}</dd></div>
          <div><dt><Repeat2 aria-hidden="true" size={16} />خریدار تکراری</dt><dd>{formatNumber(workspace.metrics.repeatCustomers)}</dd></div>
        </dl>
      </section>

      {dataContext.provenance !== "customer_data_without_verified_pilot" ? (
        <section className="demo-launcher" aria-labelledby="demo-launcher-title">
          <div className="demo-launcher-copy">
            <span className="eyebrow">دموی هدایت‌شده · بدون فایل</span>
            <h2 id="demo-launcher-title">در یک کلیک، مسیر تصمیم را ببینید.</h2>
            <p>این سناریو کاملاً ساختگی است و فقط برای نمایش تحلیل، صف تصمیم و گزارش مدیریتی استفاده می‌شود.</p>
          </div>
          <label className="field demo-preset-field">
            <span>نوع کسب‌وکار نمونه</span>
            <select value={demoPreset} onChange={(event) => setDemoPreset(event.target.value as typeof demoPreset)} disabled={!canRunDemo || demo.isPending}>
              <option value="generic_ecommerce">فروشگاه اینترنتی</option>
              <option value="super_app_packages">سوپراپ و بسته اینترنت</option>
              <option value="subscription_services">سرویس اشتراکی</option>
            </select>
          </label>
          <button className="button button-primary" type="button" disabled={!canRunDemo || demo.isPending} onClick={() => demo.mutate(demoPreset)}>
            <PlayCircle aria-hidden="true" size={18} />
            {demo.isPending ? "در حال ساخت دمو…" : dataContext.provenance === "sample_data" ? "اجرای سناریوی دیگر" : "اجرای دموی نمونه"}
          </button>
          {!canRunDemo ? <small className="demo-message">حساب مشاهده‌گر فقط می‌تواند نتیجه دمو را ببیند.</small> : null}
          {demo.isError ? <p className="form-message is-error" role="alert">{(demo.error as Error).message}</p> : null}
        </section>
      ) : null}

      <section className="decision-brief decision-brief-primary" aria-labelledby="today-decision-title">
        <div className="decision-copy">
          <div className="decision-meta">
            <span>تصمیم پیشنهادی</span>
            <EvidenceBadge level={today.evidenceLevel} label={today.evidence.labelFa} />
          </div>
          <h2 id="today-decision-title">{today.decisionFa}</h2>
          <p>{today.headlineFa}</p>
          <p className="claim-copy">{today.claimBoundary.claimFa}</p>
          <div className="decision-guardrail"><span>مانع فعلی</span><strong>{today.blockerFa}</strong></div>
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

      {dataContext.provenance === "sample_data" ? (
        <section className="demo-route" aria-labelledby="demo-route-title">
          <div><span className="eyebrow">مسیر پیشنهادی دمو</span><h2 id="demo-route-title">سه توقف، یک داستان قابل ارائه</h2></div>
          <Link to="/app/decisions"><FileCheck2 aria-hidden="true" size={20} /><span><strong>۱. تصمیم‌ها</strong><small>چه کسی اقدام بگیرد و چرا؟</small></span><ArrowLeft aria-hidden="true" size={16} /></Link>
          <Link to="/app/evidence"><BarChart3 aria-hidden="true" size={20} /><span><strong>۲. شواهد</strong><small>این تصمیم چقدر قابل اعتماد است؟</small></span><ArrowLeft aria-hidden="true" size={16} /></Link>
          <Link to="/app/report"><FileText aria-hidden="true" size={20} /><span><strong>۳. گزارش مدیر</strong><small>چه چیزی قابل ارسال است؟</small></span><ArrowLeft aria-hidden="true" size={16} /></Link>
        </section>
      ) : null}

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

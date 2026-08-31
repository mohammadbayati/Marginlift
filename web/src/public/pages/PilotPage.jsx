import {
  ActionLink,
  PageLead,
  PublicShell,
  SectionHeading,
} from "../components/PublicShell";
import {
  DataEvaluationCta,
  EvidenceLadder,
  RoleMatrix,
} from "../components/ProductNarrative";

const pilotGates = [
  ["مسئله", "یک تصمیم تکرارشونده، مالک روشن و policy فعلی قابل‌ثبت باشد."],
  ["داده", "assignment یا treatment، outcome، هزینه اقدام و تعریف مالی قابل‌بررسی باشند."],
  ["اجرا", "CRM بتواند audience، holdout و گاردریل تماس را بدون overlap اجرا کند."],
  ["اثبات", "پنجره outcome، تحلیل و reconciliation پیش از شروع قفل شوند."],
];

const deliverables = [
  "گزارش آمادگی داده و محدودیت ادعا",
  "Metric Contract مشترک میان کسب‌وکار، داده و مالی",
  "Current Policy Contract و baseline قابل‌بازتولید",
  "Decision Queue نسخه‌دار برای اجرای CRM",
  "Experiment Package شامل assignment، KPI و stopping rule",
  "Executive Readout برای تصمیم توسعه، اصلاح یا توقف",
];

export function PilotPage() {
  return (
    <PublicShell currentPath="/pilot" ctaLabel="شروع ارزیابی">
      <section className="ml-page-hero ml-container">
        <PageLead
          eyebrow="پایلوت کنترل‌شده MarginLift"
          title="یک تصمیم واقعی را از داده تا نتیجه ببرید."
          lead="پایلوت از اتصال کامل شروع نمی‌شود؛ از تعریف یک مسئله، یک policy فعلی و یک مسیر امن برای سنجش اثر آغاز می‌شود."
        >
          <div className="ml-page-actions">
            <ActionLink href="/pilot-data-request">بررسی بسته داده</ActionLink>
            <ActionLink href="/security" secondary>مرور امنیت</ActionLink>
          </div>
        </PageLead>
        <div className="ml-pilot-principle">
          <span>قاعده پایلوت</span>
          <strong>نتیجه منفی یا توقف در Data Gate هم خروجی معتبر است.</strong>
          <p>هدف، ساختن ادعای مثبت نیست؛ هدف، گرفتن یک تصمیم قابل‌حسابرسی با هزینه و ریسک محدود است.</p>
        </div>
      </section>

      <section className="ml-section ml-section-muted" aria-labelledby="ml-pilot-flow-title">
        <div className="ml-container">
          <SectionHeading
            eyebrow="دامنه اجرا"
            title="چهار گیت پیش از هر اجرای زنده"
            description="عبور از هر مرحله به شواهد مرحله قبل وابسته است. اتصال فنی یا کمپین زنده پیش‌فرض نیست."
            id="ml-pilot-flow-title"
          />
          <ol className="ml-pilot-gates">
            {pilotGates.map(([title, copy], index) => (
              <li key={title}>
                <span>{["۱", "۲", "۳", "۴"][index]}</span>
                <div><h3>{title}</h3><p>{copy}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ml-section" aria-labelledby="ml-pilot-output-title">
        <div className="ml-container ml-two-column-section">
          <SectionHeading
            eyebrow="خروجی‌ها"
            title="بسته‌ای که هر تیم بتواند بررسی و امضا کند."
            description="خروجی پایلوت فقط نمودار نیست؛ قرارداد داده، policy، آزمایش و readout در کنار هم تحویل می‌شوند."
            id="ml-pilot-output-title"
          />
          <ul className="ml-check-list">
            {deliverables.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className="ml-section ml-section-ink" aria-labelledby="ml-pilot-roles-title">
        <div className="ml-container">
          <SectionHeading
            eyebrow="مدل مسئولیت"
            title="MarginLift تصمیم را مستند می‌کند؛ تیم شما اجرا و تأیید می‌کند."
            id="ml-pilot-roles-title"
          />
          <RoleMatrix />
        </div>
      </section>

      <section className="ml-section" aria-labelledby="ml-pilot-evidence-title">
        <div className="ml-container">
          <SectionHeading
            eyebrow="مسیر ادعا"
            title="پایلوت، نردبان شواهد را کوتاه نمی‌کند."
            description="اثر افزایشی فقط وقتی تأیید می‌شود که assignment سالم، گروه کنترل، outcome بسته و تطبیق مالی وجود داشته باشند."
            id="ml-pilot-evidence-title"
          />
          <EvidenceLadder />
        </div>
      </section>

      <section className="ml-section ml-section-muted" aria-labelledby="ml-commercial-title">
        <div className="ml-container ml-pilot-commercial">
          <div>
            <p className="ml-eyebrow">مدل همکاری</p>
            <h2 id="ml-commercial-title">Diagnostic، Pilot، سپس Subscription</h2>
          </div>
          <p>
            Scope و مبلغ پس از انتخاب مسئله، مشاهده schema، تعیین KPI، مسیر استقرار و ظرفیت تیم‌های درگیر مشخص می‌شوند. هیچ عدد یا نتیجه‌ای پیش از این مرحله وعده داده نمی‌شود.
          </p>
        </div>
      </section>

      <DataEvaluationCta title="برای Pilot Gate اول چه داده‌ای در دسترس است؟" />
    </PublicShell>
  );
}

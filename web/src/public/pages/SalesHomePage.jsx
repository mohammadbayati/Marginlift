import commandCenterImage from "../assets/marginlift-command-center.png";
import {
  ActionLink,
  PageLead,
  PublicShell,
  SectionHeading,
} from "../components/PublicShell";
import {
  CommercialPath,
  DataEvaluationCta,
  DecisionLoop,
  EvidenceSection,
  RoleMatrix,
} from "../components/ProductNarrative";

export function SalesHomePage() {
  return (
    <PublicShell currentPath="/">
      <section className="ml-hero" aria-labelledby="ml-home-title">
        <div className="ml-container">
          <PageLead
            eyebrow="لایه تصمیم‌گیری میان داده مشتری و اجرای کمپین"
            title={<bdi id="ml-home-title">MarginLift</bdi>}
            lead="CRM اجرا می‌کند؛ MarginLift مشخص می‌کند کدام اقدام واقعاً سود ساخته است."
          >
            <p className="ml-hero-copy">
              پیش از کمپین بعدی مشخص کنید کجا هیچ اقدامی لازم نیست، کجا پیام کم‌هزینه کافی است و کجا مشوق می‌تواند رفتار را تغییر دهد.
            </p>
            <div className="ml-page-actions">
              <ActionLink href="/pilot-data-request">ارزیابی آمادگی داده</ActionLink>
              <ActionLink href="/deck" secondary>مشاهده معرفی محصول</ActionLink>
            </div>
            <div className="ml-hero-qualifiers" aria-label="مرزهای محصول">
              <span>بدون جایگزینی CRM</span>
              <span>شروع با داده ناشناس</span>
              <span>اثبات فقط با گروه کنترل سالم</span>
            </div>
          </PageLead>

          <figure className="ml-product-figure">
            <figcaption>
              <span>نمای واقعی محصول</span>
              <strong>مرکز فرمان MarginLift با داده نمایشی</strong>
            </figcaption>
            <img
              src={commandCenterImage}
              alt="اسکرین‌شات واقعی مرکز فرمان MarginLift؛ شامل وضعیت آمادگی داده، تصمیم پیشنهادی، فرصت مالی و صف تصمیم"
            />
          </figure>
        </div>
      </section>

      <section className="ml-section" id="method" aria-labelledby="ml-method-title">
        <div className="ml-container">
          <SectionHeading
            eyebrow="یک چرخه عملیاتی"
            title="تشخیص، تصمیم، اثبات"
            description="خروجی محصول یک توصیه قابل‌اجرا برای کمپین بعدی است؛ همراه با سطح شواهد و مسئول تصمیم."
            id="ml-method-title"
          />
          <DecisionLoop />
        </div>
      </section>

      <section className="ml-section ml-section-ink" aria-labelledby="ml-positioning-title">
        <div className="ml-container ml-positioning-layout">
          <div>
            <p className="ml-eyebrow">مرز روشن محصول</p>
            <h2 id="ml-positioning-title">ابزارهای فعلی را نگه دارید؛ تصمیم میان آن‌ها را قابل‌دفاع کنید.</h2>
          </div>
          <div className="ml-positioning-compare">
            <div>
              <span>CRM و Marketing Automation</span>
              <p>سگمنت می‌سازند، پیام می‌فرستند و کمپین را اجرا می‌کنند.</p>
            </div>
            <div>
              <span>BI و تیم داده</span>
              <p>رفتار گذشته، گزارش و مدل‌های تحلیلی را فراهم می‌کنند.</p>
            </div>
            <div className="is-marginlift">
              <span>MarginLift</span>
              <p>policy، گروه کنترل، اثر مالی و تصمیم توسعه، اصلاح یا توقف را به هم متصل می‌کند.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="ml-section" aria-labelledby="ml-roles-title">
        <div className="ml-container ml-two-column-section">
          <SectionHeading
            eyebrow="نقش‌ها"
            title="هر تیم همان کاری را انجام می‌دهد که مالک آن است."
            description="MarginLift هماهنگی میان اجرا، داده و مالی را به یک قرارداد تصمیم مشترک تبدیل می‌کند."
            id="ml-roles-title"
          />
          <RoleMatrix />
        </div>
      </section>

      <EvidenceSection />

      <section className="ml-section" id="security" aria-labelledby="ml-trust-title">
        <div className="ml-container ml-trust-layout">
          <div>
            <p className="ml-eyebrow">امنیت و حاکمیت داده</p>
            <h2 id="ml-trust-title">کمینه‌سازی داده، پیش از انتقال داده.</h2>
            <p>
              Diagnostic با schema یا نمونه ناشناس شروع می‌شود. اطلاعات تماس، پرداخت و شناسه مستقیم برای ارزیابی اولیه لازم نیست.
            </p>
            <div className="ml-inline-links">
              <a href="/security">کنترل‌های امنیتی</a>
              <a href="/privacy">سیاست حریم خصوصی</a>
              <a href="/pilot-data-request">قرارداد داده پایلوت</a>
            </div>
          </div>
          <dl className="ml-trust-facts">
            <div><dt>داده اولیه</dt><dd>ناشناس یا تجمیعی</dd></div>
            <div><dt>سطح دسترسی</dt><dd>نقش‌محور و محدود به workspace</dd></div>
            <div><dt>ادعای مالی</dt><dd>وابسته به سطح شواهد</dd></div>
            <div><dt>تصمیم نهایی</dt><dd>با مالک کسب‌وکار و مالی</dd></div>
          </dl>
        </div>
      </section>

      <section className="ml-section ml-section-muted" id="engagement" aria-labelledby="ml-engagement-title">
        <div className="ml-container ml-two-column-section">
          <SectionHeading
            eyebrow="مسیر همکاری"
            title="از یک سؤال محدود شروع کنید؛ فقط با شواهد مقیاس دهید."
            description="قیمت و تعهد بلندمدت پیش از روشن‌شدن دامنه، داده و الزامات استقرار اعلام نمی‌شود."
            id="ml-engagement-title"
          />
          <CommercialPath />
        </div>
      </section>

      <DataEvaluationCta />
    </PublicShell>
  );
}

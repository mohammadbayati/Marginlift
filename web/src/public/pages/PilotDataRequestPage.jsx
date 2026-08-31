import { ActionLink, PageLead, PublicShell, SectionHeading } from "../components/PublicShell";

const dataPackages = [
  {
    type: "Diagnostic",
    title: "داده تجمیعی کمپین",
    use: "برای بررسی کیفیت، baseline، هزینه اقدام و امکان طراحی پایلوت؛ خروجی این مرحله علّی نیست.",
    fields: ["segment", "treatment", "users", "conversions", "revenue", "incentive_cost", "gross_margin_rate"],
  },
  {
    type: "Live Pilot",
    title: "assignment و exposure مشتری‌محور",
    use: "برای سنجش اجرای policy، سلامت گروه کنترل و اثر اقدام در دامنه توافق‌شده.",
    fields: ["customer_id_hash", "assigned_group", "treatment", "exposed_at", "channel", "eligibility"],
  },
  {
    type: "Outcome",
    title: "نتیجه و هزینه واقعی",
    use: "برای بستن پنجره اندازه‌گیری، تحلیل ITT و تطبیق خروجی با تعریف مالی.",
    fields: ["customer_id_hash", "converted", "outcome_revenue", "gross_margin", "actual_incentive_cost", "actual_channel_cost"],
  },
];

export function PilotDataRequestPage() {
  return (
    <PublicShell currentPath="/pilot-data-request" ctaLabel="ارزیابی داده">
      <section className="ml-page-hero ml-container">
        <PageLead
          eyebrow="درخواست داده پایلوت"
          title="فقط داده‌ای را درخواست کنید که برای تصمیم لازم است."
          lead="با schema یا نمونه ناشناس شروع کنید. نوع فایل، ستون‌ها، دوره نگهداری و مالک دسترسی باید پیش از انتقال داده واقعی ثبت شوند."
        >
          <div className="ml-page-actions">
            <ActionLink href="#ml-data-packages">مشاهده بسته‌ها</ActionLink>
            <ActionLink href="/security" secondary>مرور کنترل‌های امنیتی</ActionLink>
          </div>
        </PageLead>
        <div className="ml-data-rule">
          <span>قاعده تصمیم</span>
          <strong>بدون گروه کنترل معتبر، خروجی «تحلیل تاریخی» باقی می‌ماند.</strong>
        </div>
      </section>

      <section className="ml-section ml-section-muted" id="ml-data-packages" aria-labelledby="ml-data-package-title">
        <div className="ml-container">
          <SectionHeading
            eyebrow="سه بسته، سه سطح استفاده"
            title="دامنه فایل را با مرحله تصمیم هماهنگ کنید."
            description="ارسال همه داده‌ها یک مزیت نیست. هر بسته فقط ستون‌های لازم برای همان مرحله را نگه می‌دارد."
            id="ml-data-package-title"
          />
          <div className="ml-data-packages">
            {dataPackages.map((dataPackage) => (
              <article key={dataPackage.type}>
                <div>
                  <bdi>{dataPackage.type}</bdi>
                  <h3>{dataPackage.title}</h3>
                  <p>{dataPackage.use}</p>
                </div>
                <ul aria-label={`ستون‌های بسته ${dataPackage.type}`}>
                  {dataPackage.fields.map((field) => <li key={field}><bdi>{field}</bdi></li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ml-section" aria-labelledby="ml-data-safety-title">
        <div className="ml-container ml-data-safety">
          <div>
            <p className="ml-eyebrow">موارد ممنوع</p>
            <h2 id="ml-data-safety-title">این داده‌ها را ارسال نکنید.</h2>
          </div>
          <ul>
            <li>نام، شماره تماس، ایمیل خام و نشانی</li>
            <li>شماره کارت، اطلاعات پرداخت و رمز عبور</li>
            <li>اطلاعات سلامت و دسته‌های حساس شخصی</li>
            <li>متن خام پیام خصوصی و هر شناسه غیرضروری</li>
          </ul>
        </div>
      </section>

      <section className="ml-section ml-section-ink" aria-labelledby="ml-data-checklist-title">
        <div className="ml-container ml-two-column-section">
          <SectionHeading
            eyebrow="پیش از ارسال"
            title="پنج مورد را داخل تیم خود تأیید کنید."
            id="ml-data-checklist-title"
          />
          <ol className="ml-numbered-checklist">
            <li><span>۱</span><p>مالک کسب‌وکار و مالک داده مشخص‌اند.</p></li>
            <li><span>۲</span><p>هدف تصمیم و پنجره outcome تعریف شده‌اند.</p></li>
            <li><span>۳</span><p>شناسه‌های مستقیم حذف یا hash شده‌اند.</p></li>
            <li><span>۴</span><p>مسیر استقرار و اشخاص مجاز ثبت شده‌اند.</p></li>
            <li><span>۵</span><p>مدت نگهداری و روش حذف توافق شده‌اند.</p></li>
          </ol>
        </div>
      </section>

      <section className="ml-final-cta" aria-labelledby="ml-data-request-cta">
        <div>
          <p className="ml-eyebrow">شروع ارزیابی</p>
          <h2 id="ml-data-request-cta">schema را پیش از فایل واقعی بررسی کنید.</h2>
          <p>درخواست ساخت فضای کاری، نقش‌های درگیر و هدف Diagnostic را ثبت می‌کند.</p>
        </div>
        <div className="ml-final-cta-actions">
          <ActionLink href="/signup?intent=data-review">درخواست ارزیابی داده</ActionLink>
          <ActionLink href="/privacy" secondary>مرور حریم خصوصی</ActionLink>
        </div>
      </section>
    </PublicShell>
  );
}

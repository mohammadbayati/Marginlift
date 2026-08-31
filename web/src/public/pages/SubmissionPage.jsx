import { ActionLink, PageLead, PublicShell, SectionHeading } from "../components/PublicShell";

const submissionPaths = [
  {
    href: "/deck",
    type: "روایت محصول",
    title: "Deck تصمیم‌محور",
    copy: "مسئله، محصول، نردبان شواهد و مدل همکاری بدون ادعای نتیجه واقعی.",
  },
  {
    href: "/",
    type: "تجربه محصول",
    title: "صفحه فروش و نمای واقعی",
    copy: "جایگاه MarginLift میان داده، CRM و تصمیم مالی همراه با اسکرین‌شات محصول.",
  },
  {
    href: "/pilot",
    type: "مسیر اجرا",
    title: "پایلوت کنترل‌شده",
    copy: "گیت‌های داده، نقش‌ها، خروجی‌ها و مسیر تبدیل برآورد به شاهد قابل‌حسابرسی.",
  },
  {
    href: "/security",
    type: "اعتماد",
    title: "امنیت و حاکمیت داده",
    copy: "کمینه‌سازی داده، مرز استقرار، کنترل دسترسی و محدودیت تعهدات فعلی.",
  },
];

export function SubmissionPage() {
  return (
    <PublicShell currentPath="/submission">
      <section className="ml-page-hero ml-container">
        <PageLead
          eyebrow="مرکز ارائه MarginLift"
          title="یک مسیر روشن برای بررسی محصول، پایلوت و شواهد."
          lead="این بسته برای بررسی ایده و آمادگی اجراست؛ هیچ لوگوی مشتری، case study یا نتیجه تجاری تأییدنشده‌ای در آن استفاده نشده است."
        >
          <div className="ml-page-actions">
            <ActionLink href="/deck">بازکردن Deck</ActionLink>
            <ActionLink href="/pilot-data-request" secondary>ارزیابی داده</ActionLink>
          </div>
        </PageLead>
        <div className="ml-submission-status">
          <span>وضعیت شواهد</span>
          <strong>محصول عملیاتی با داده نمایشی</strong>
          <p>نتیجه علّی تأییدشده از مشتری واقعی در این بسته ادعا نمی‌شود.</p>
        </div>
      </section>

      <section className="ml-section ml-section-muted" aria-labelledby="ml-submission-paths-title">
        <div className="ml-container">
          <SectionHeading
            eyebrow="مسیرهای بررسی"
            title="از روایت مدیریتی تا جزئیات اجرای پایلوت"
            id="ml-submission-paths-title"
          />
          <div className="ml-submission-grid">
            {submissionPaths.map((item) => (
              <a href={item.href} key={item.href}>
                <span>{item.type}</span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <strong>مشاهده</strong>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="ml-section" aria-labelledby="ml-review-lens-title">
        <div className="ml-container ml-two-column-section">
          <SectionHeading
            eyebrow="لنز بررسی"
            title="سه سؤال برای ارزیابی MarginLift"
            description="پاسخ هر سؤال باید با سند، داده یا خروجی قابل‌مشاهده همراه باشد."
            id="ml-review-lens-title"
          />
          <div className="ml-review-questions">
            <article><span>مسئله</span><h3>آیا تصمیمی تکرارشونده و اقتصادی وجود دارد؟</h3><p>نه صرفاً علاقه به AI یا یک داشبورد جدید.</p></article>
            <article><span>اجرا</span><h3>آیا CRM و تیم داده می‌توانند policy و holdout را اجرا کنند؟</h3><p>با همان eligibility و گاردریل‌های فعلی کسب‌وکار.</p></article>
            <article><span>اثبات</span><h3>آیا مالی می‌تواند outcome را reconcile کند؟</h3><p>بدون این مرحله، نتیجه در سطح برآورد باقی می‌ماند.</p></article>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

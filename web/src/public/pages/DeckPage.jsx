import commandCenterImage from "../assets/marginlift-command-center.png";
import { ActionLink, BrandLockup, PublicShell } from "../components/PublicShell";
import { DecisionLoop, EvidenceLadder } from "../components/ProductNarrative";

const slides = [
  ["ml-deck-problem", "مسئله"],
  ["ml-deck-solution", "راه‌حل"],
  ["ml-deck-product", "محصول"],
  ["ml-deck-evidence", "شواهد"],
  ["ml-deck-commercial", "همکاری"],
  ["ml-deck-ask", "قدم بعدی"],
];

export function DeckPage() {
  return (
    <PublicShell minimal>
      <div className="ml-deck-page">
        <header className="ml-deck-header">
          <BrandLockup />
          <nav aria-label="کنترل ارائه">
            <a href="/submission">مرکز ارائه</a>
            <a href="/">صفحه اصلی</a>
          </nav>
        </header>

        <aside className="ml-deck-index" aria-label="فهرست اسلایدها">
          {slides.map(([href, label], index) => (
            <a href={`#${href}`} key={href}><span>{["۱", "۲", "۳", "۴", "۵", "۶"][index]}</span>{label}</a>
          ))}
        </aside>

        <main id="ml-main-content" tabIndex="-1" className="ml-deck-main">
          <section className="ml-deck-cover" aria-labelledby="ml-deck-title">
            <div>
              <p className="ml-eyebrow">Product Deck</p>
              <h1 id="ml-deck-title"><bdi>MarginLift</bdi></h1>
              <p>CRM اجرا می‌کند؛ MarginLift مشخص می‌کند کدام اقدام واقعاً سود ساخته است.</p>
            </div>
            <span>لایه تصمیم‌گیری سود برای تیم‌های رشد، CRM و مالی</span>
          </section>

          <section className="ml-deck-slide" id="ml-deck-problem">
            <div className="ml-deck-slide-copy">
              <p className="ml-eyebrow">مسئله</p>
              <h2>فروش بعد از کمپین، اثبات اثر کمپین نیست.</h2>
              <p>گزارش‌های عادی نشان می‌دهند چه اتفاقی افتاده است؛ اما نمی‌گویند کدام خرید بدون مشوق هم رخ می‌داد و کدام اقدام حاشیه سود را واقعاً بهتر کرد.</p>
            </div>
            <div className="ml-deck-question">
              <span>سؤال تصمیم</span>
              <strong>برای چه کسی، چه اقدامی، با چه سطحی از اطمینان؟</strong>
            </div>
          </section>

          <section className="ml-deck-slide" id="ml-deck-solution">
            <div className="ml-deck-slide-copy">
              <p className="ml-eyebrow">راه‌حل</p>
              <h2>یک چرخه کوتاه برای تبدیل داده به policy قابل‌اجرا.</h2>
            </div>
            <DecisionLoop />
          </section>

          <section className="ml-deck-slide ml-deck-product" id="ml-deck-product">
            <div className="ml-deck-slide-copy">
              <p className="ml-eyebrow">محصول</p>
              <h2>تصمیم، اثر مالی و سطح شواهد در یک نمای عملیاتی.</h2>
              <p>جزئیات تحلیلی در دسترس‌اند، اما نمای اول برای تصمیم مدیر رشد و مالی ساخته شده است.</p>
            </div>
            <figure>
              <img src={commandCenterImage} alt="اسکرین‌شات واقعی مرکز فرمان MarginLift با داده نمایشی" />
              <figcaption>نمای واقعی محصول؛ داده‌ها نمایشی‌اند و نتیجه مشتری واقعی را نشان نمی‌دهند.</figcaption>
            </figure>
          </section>

          <section className="ml-deck-slide" id="ml-deck-evidence">
            <div className="ml-deck-slide-copy">
              <p className="ml-eyebrow">Evidence Ladder</p>
              <h2>اثبات، یک برچسب تزئینی نیست.</h2>
              <p>مرحله آخر فقط با assignment سالم، گروه کنترل، outcome بسته و تطبیق مالی قابل‌ثبت است.</p>
            </div>
            <EvidenceLadder compact />
          </section>

          <section className="ml-deck-slide" id="ml-deck-commercial">
            <div className="ml-deck-slide-copy">
              <p className="ml-eyebrow">مدل همکاری</p>
              <h2>Diagnostic، Pilot، Subscription</h2>
              <p>همکاری با دامنه محدود و شواهد فعلی شروع می‌شود. قیمت پس از روشن‌شدن داده، امنیت، scope و ظرفیت اجرا تعیین می‌شود.</p>
            </div>
            <ol className="ml-deck-commercial-list">
              <li><span>Diagnostic</span><strong>ممیزی داده و قرارداد تصمیم</strong></li>
              <li><span>Pilot</span><strong>Shadow، holdout و readout مالی</strong></li>
              <li><span>Subscription</span><strong>تصمیم‌سازی دوره‌ای پس از اثبات تکرارپذیری</strong></li>
            </ol>
          </section>

          <section className="ml-deck-slide ml-deck-ask" id="ml-deck-ask">
            <div>
              <p className="ml-eyebrow">قدم بعدی</p>
              <h2>یک جلسه scoping، یک schema ناشناس، یک تصمیم واقعی.</h2>
              <p>خروجی جلسه یا تعریف Diagnostic محدود است، یا تصمیم شفاف برای متوقف‌کردن موضوع.</p>
            </div>
            <ActionLink href="/pilot-data-request">آماده‌سازی ارزیابی داده</ActionLink>
          </section>
        </main>
      </div>
    </PublicShell>
  );
}

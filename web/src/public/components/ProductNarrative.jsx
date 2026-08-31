import { ActionLink, SectionHeading } from "./PublicShell";

export const evidenceLevels = [
  {
    label: "تحلیل تاریخی",
    detail: "الگو و ظرفیت تصمیم را نشان می‌دهد؛ ادعای علّی نیست.",
    state: "estimate",
  },
  {
    label: "نتیجه Shadow",
    detail: "سیاست روی داده تازه سنجیده می‌شود، بدون اثر بر مشتری.",
    state: "observed",
  },
  {
    label: "برآورد پایلوت",
    detail: "assignment و گروه کنترل سالم‌اند؛ outcome هنوز کامل نشده است.",
    state: "pilot",
  },
  {
    label: "اثر افزایشی تأییدشده",
    detail: "پنجره outcome بسته و نتیجه با مالی تطبیق داده شده است.",
    state: "verified",
  },
];

export function DecisionLoop() {
  const steps = [
    {
      number: "۱",
      label: "تشخیص",
      title: "آمادگی داده و محل اتلاف را روشن کنید.",
      copy: "کیفیت داده، policy فعلی، گروه کنترل و تعریف مالی پیش از هر ادعا بررسی می‌شوند.",
    },
    {
      number: "۲",
      label: "تصمیم",
      title: "برای هر گروه، اقدام بعدی را مشخص کنید.",
      copy: "بدون اقدام، پیام کم‌هزینه، مزیت کوچک یا مشوق؛ همراه با دلیل و محدودیت تصمیم.",
    },
    {
      number: "۳",
      label: "اثبات",
      title: "نتیجه را با پایلوت کنترل‌شده بسنجید.",
      copy: "Outcome واقعی، هزینه اجرا و گاردریل مالی به تصمیم توسعه، اصلاح یا توقف تبدیل می‌شوند.",
    },
  ];

  return (
    <ol className="ml-decision-loop">
      {steps.map((step) => (
        <li key={step.label}>
          <span className="ml-step-number" aria-hidden="true">{step.number}</span>
          <div>
            <p>{step.label}</p>
            <h3>{step.title}</h3>
            <span>{step.copy}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function RoleMatrix() {
  const roles = [
    ["CRM و رشد", "policy و audience قابل‌اجرا را دریافت می‌کند و کمپین را در ابزار فعلی اجرا می‌کند."],
    ["داده و BI", "قرارداد داده، lineage، سلامت assignment و تعریف outcome را تأیید می‌کند."],
    ["مالی و CFO", "فرمول سود، هزینه مشوق، گاردریل درآمد و reconciliation نهایی را می‌بندد."],
    ["تحلیل‌گر و مالک کمپین", "محدودیت‌ها را بررسی می‌کند، override را ثبت می‌کند و readout را به تصمیم بعدی می‌رساند."],
  ];

  return (
    <div className="ml-role-matrix">
      {roles.map(([role, responsibility]) => (
        <div className="ml-role-row" key={role}>
          <h3>{role}</h3>
          <p>{responsibility}</p>
        </div>
      ))}
    </div>
  );
}

export function EvidenceLadder({ compact = false }) {
  const displayIndexes = ["۰۱", "۰۲", "۰۳", "۰۴"];

  return (
    <div className={`ml-evidence-ladder${compact ? " is-compact" : ""}`}>
      {evidenceLevels.map((level, index) => (
        <article className={`ml-evidence-level is-${level.state}`} key={level.label}>
          <div>
            <span className="ml-evidence-index">{displayIndexes[index]}</span>
            <span className="ml-evidence-state">{level.state === "verified" ? "قابل‌تأیید" : "دارای محدودیت"}</span>
          </div>
          <h3>{level.label}</h3>
          {!compact && <p>{level.detail}</p>}
        </article>
      ))}
    </div>
  );
}

export function CommercialPath() {
  const stages = [
    {
      name: "Diagnostic",
      title: "تعریف مسئله و ممیزی داده",
      copy: "baseline، policy فعلی، قرارداد متریک و مسیر امن داده در یک دامنه محدود مشخص می‌شوند.",
    },
    {
      name: "Pilot",
      title: "Shadow و آزمایش کنترل‌شده",
      copy: "سیاست پیشنهادی با assignment، holdout، گاردریل و Executive Readout سنجیده می‌شود.",
    },
    {
      name: "Subscription",
      title: "تصمیم‌سازی دوره‌ای",
      copy: "فقط پس از اثبات نتیجه و تکرارپذیری workflow، اتصال دوره‌ای و مدل همکاری تعریف می‌شود.",
    },
  ];

  return (
    <div className="ml-commercial-path">
      {stages.map((stage, index) => (
        <article key={stage.name}>
          <div className="ml-commercial-meta">
            <bdi>{stage.name}</bdi>
            <span>{`مرحله ${["اول", "دوم", "سوم"][index]}`}</span>
          </div>
          <h3>{stage.title}</h3>
          <p>{stage.copy}</p>
        </article>
      ))}
      <p className="ml-commercial-note">
        مبلغ همکاری پس از روشن‌شدن دامنه، کیفیت داده، الزامات امنیتی و ظرفیت اجرا اعلام می‌شود.
      </p>
    </div>
  );
}

export function DataEvaluationCta({ title = "آیا داده برای یک تصمیم قابل‌دفاع آماده است؟" }) {
  return (
    <section className="ml-final-cta" aria-labelledby="ml-final-cta-title">
      <div>
        <p className="ml-eyebrow">قدم بعدی</p>
        <h2 id="ml-final-cta-title">{title}</h2>
        <p>با schema یا نمونه ناشناس شروع می‌کنیم؛ بدون درخواست اتصال کامل یا اطلاعات هویتی مشتری.</p>
      </div>
      <div className="ml-final-cta-actions">
        <ActionLink href="/pilot-data-request">بررسی داده موردنیاز</ActionLink>
        <ActionLink href="/signup?intent=data-review" secondary>درخواست ارزیابی داده</ActionLink>
      </div>
    </section>
  );
}

export function EvidenceSection({ compact = false }) {
  return (
    <section className="ml-section ml-section-muted" id="evidence" aria-labelledby="ml-evidence-title">
      <div className="ml-container">
        <SectionHeading
          eyebrow="Evidence Ladder"
          title="سطح ادعا همراه هر عدد حرکت می‌کند."
          description="MarginLift برآورد تاریخی را با اثر افزایشی تأییدشده یکی نمی‌گیرد. هر مرحله، شرط عبور و محدودیت خودش را دارد."
          id="ml-evidence-title"
        />
        <EvidenceLadder compact={compact} />
      </div>
    </section>
  );
}

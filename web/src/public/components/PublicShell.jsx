import { useState } from "react";

const primaryNavigation = [
  { href: "/#method", label: "روش کار" },
  { href: "/#evidence", label: "شواهد" },
  { href: "/pilot", label: "پایلوت" },
  { href: "/security", label: "امنیت" },
];

export function BrandLockup({ compact = false }) {
  return (
    <a className="ml-brand" href="/" aria-label="MarginLift، صفحه اصلی">
      <span className="ml-brand-mark" aria-hidden="true">M</span>
      <span className="ml-brand-copy">
        <bdi>MarginLift</bdi>
        {!compact && <small>لایه تصمیم‌گیری سود</small>}
      </span>
    </a>
  );
}

export function ActionLink({ children, href, secondary = false, className = "", ...props }) {
  const classes = ["ml-button", secondary ? "ml-button-secondary" : "ml-button-primary", className]
    .filter(Boolean)
    .join(" ");

  return (
    <a className={classes} href={href} {...props}>
      {children}
    </a>
  );
}

export function PublicHeader({ currentPath = "", ctaLabel = "ارزیابی داده" }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="ml-header">
      <div className="ml-header-inner">
        <BrandLockup />
        <button
          className="ml-menu-button"
          type="button"
          aria-controls="ml-primary-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
        >
          فهرست
        </button>
        <nav
          id="ml-primary-navigation"
          className={`ml-navigation${menuOpen ? " is-open" : ""}`}
          aria-label="ناوبری اصلی"
        >
          <div className="ml-navigation-links">
            {primaryNavigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={currentPath === item.href ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="ml-navigation-actions">
            <a className="ml-login-link" href="/login">ورود</a>
            <ActionLink href="/pilot-data-request">{ctaLabel}</ActionLink>
          </div>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="ml-footer">
      <div className="ml-footer-inner">
        <div>
          <BrandLockup compact />
          <p>CRM اجرا می‌کند؛ MarginLift اثر مالی اقدام را قابل‌بررسی می‌کند.</p>
        </div>
        <nav aria-label="پیوندهای محصول">
          <a href="/pilot">پایلوت</a>
          <a href="/deck">معرفی محصول</a>
          <a href="/submission">مرکز ارائه</a>
          <a href="/pilot-data-request">درخواست داده</a>
        </nav>
        <nav aria-label="پیوندهای اعتماد">
          <a href="/security">امنیت</a>
          <a href="/privacy">حریم خصوصی</a>
          <a href="/terms">شرایط استفاده</a>
        </nav>
      </div>
      <div className="ml-footer-note">
        <span>MarginLift جایگزین CRM، CDP، BI یا ابزار اجرای کمپین نیست.</span>
        <span>نتیجه علّی فقط پس از پایلوت کنترل‌شده گزارش می‌شود.</span>
      </div>
    </footer>
  );
}

export function PublicShell({ children, currentPath, ctaLabel, minimal = false }) {
  return (
    <div className="ml-public" dir="rtl" lang="fa">
      <a className="ml-skip-link" href="#ml-main-content">رفتن به محتوای اصلی</a>
      {!minimal && <PublicHeader currentPath={currentPath} ctaLabel={ctaLabel} />}
      {minimal ? children : <main id="ml-main-content" tabIndex="-1">{children}</main>}
      {!minimal && <PublicFooter />}
    </div>
  );
}

export function PageLead({ eyebrow, title, lead, children, compact = false }) {
  return (
    <header className={`ml-page-lead${compact ? " is-compact" : ""}`}>
      <p className="ml-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {lead && <p className="ml-lead">{lead}</p>}
      {children}
    </header>
  );
}

export function SectionHeading({ eyebrow, title, description, id }) {
  return (
    <div className="ml-section-heading">
      {eyebrow && <p className="ml-eyebrow">{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

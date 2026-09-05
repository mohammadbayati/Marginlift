import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck2,
  Database,
  FileCheck2,
  FlaskConical,
  LockKeyhole,
  Menu,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../shared/api/client";
import { LoadingState } from "../shared/ui";
import { personaLabels, usePersona } from "./persona";

const navigation = [
  { to: "/app/today", label: "امروز", icon: CalendarCheck2 },
  { to: "/app/data", label: "داده", icon: Database },
  { to: "/app/decisions", label: "تصمیم‌ها", icon: FileCheck2 },
  { to: "/app/pilot", label: "پایلوت", icon: FlaskConical },
  { to: "/app/evidence", label: "شواهد", icon: BarChart3 },
  { to: "/app/settings", label: "تنظیمات", icon: Settings },
];

const rbacLabels = {
  owner: "مالک فضای کاری",
  admin: "مدیر",
  analyst: "تحلیل‌گر",
  viewer: "مشاهده‌گر",
};

function resolveEnvironment(dataLabel?: string) {
  if (typeof window === "undefined") return { label: "محیط محصول", tone: "production" };
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return { label: `محیط محلی · ${dataLabel || "بدون داده"}`, tone: "local" };
  if (host.includes("staging") || host.includes("preview")) return { label: `محیط آزمایشی · ${dataLabel || "اقدام زنده غیرفعال"}`, tone: "staging" };
  return { label: `محیط عملیاتی · ${dataLabel || "تصمیم انسانی الزامی"}`, tone: "production" };
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { persona, setPersona } = usePersona();
  const location = useLocation();
  const session = useQuery({ queryKey: ["session"], queryFn: api.session, staleTime: 60_000 });
  const retention = useQuery({ queryKey: ["retention-workspace"], queryFn: api.retentionWorkspace, enabled: Boolean(session.data) });
  const environment = resolveEnvironment(retention.data?.dataContext.environmentLabelFa);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  if (session.isLoading) return <LoadingState label="در حال بررسی دسترسی…" />;
  if (!session.data) return <Navigate replace to="/login" />;

  return (
    <div className="app-root" dir="rtl" lang="fa">
      <a className="skip-link" href="#main-content">رفتن به محتوای اصلی</a>
      <div className={`environment-banner environment-${environment.tone}`} role="status">
        <ShieldCheck aria-hidden="true" size={16} />
        <span>{environment.label}</span>
      </div>

      <header className="mobile-header">
        <button className="icon-button" type="button" aria-label="باز کردن ناوبری" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
          <Menu aria-hidden="true" size={22} />
        </button>
        <strong>MarginLift</strong>
        <span className="mobile-persona">{personaLabels[persona]}</span>
      </header>

      {mobileOpen ? <button className="nav-backdrop" type="button" aria-label="بستن ناوبری" onClick={() => setMobileOpen(false)} /> : null}
      <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="ناوبری اصلی">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">M</span>
          <div>
            <strong>MarginLift</strong>
            <small>مرکز کنترل سود</small>
          </div>
          <button className="icon-button mobile-close" type="button" onClick={() => setMobileOpen(false)} aria-label="بستن ناوبری">
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <nav className="primary-nav">
          <span className="nav-section-label">فضای تصمیم</span>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
                <Icon aria-hidden="true" size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-trust-note">
            <LockKeyhole aria-hidden="true" size={16} />
            <span><strong>محیط کنترل‌شده</strong><small>تصمیم نهایی با تأیید انسانی</small></span>
          </div>
          <div className="persona-control" aria-label="نمای شخصی" role="group">
            <span className="control-label">نمای شخصی</span>
            <div className="segmented-control">
              {Object.entries(personaLabels).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={persona === key}
                  className={persona === key ? "is-selected" : ""}
                  onClick={() => setPersona(key as keyof typeof personaLabels)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="identity-row">
            <span className="identity-avatar" aria-hidden="true">{session.data?.user.name?.slice(0, 1) || "م"}</span>
            <div>
              <strong>{session.data?.user.name || "کاربر MarginLift"}</strong>
              <small>{session.data ? rbacLabels[session.data.role] : "در حال دریافت دسترسی"}</small>
            </div>
          </div>
        </div>
      </aside>

      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");
const rootElement = root;
const entry = rootElement.dataset.entry || "sales";

async function mount() {
  let content;
  if (entry === "app") {
    const { MarginLiftApp } = await import("../app/App");
    content = <MarginLiftApp />;
  } else {
    const { PublicSite } = await import("../public");
    const submit = async (endpoint: string, form: FormData) => {
      const payload: Record<string, string> = {};
      form.forEach((value, key) => { if (typeof value === "string") payload[key === "organization" ? "companyName" : key] = value; });
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message || "درخواست انجام نشد.");
      window.location.assign("/app/today");
    };
    content = <PublicSite pathname={window.location.pathname} authHandlers={{ login: (form: FormData) => submit("/api/auth/login", form), signup: (form: FormData) => submit("/api/auth/signup", form) }} />;
  }
  const element = <StrictMode><ErrorBoundary>{content}</ErrorBoundary></StrictMode>;
  if (rootElement.hasChildNodes()) hydrateRoot(rootElement, element);
  else createRoot(rootElement).render(element);
}

mount().catch((error) => {
  rootElement.innerHTML = `<main dir="rtl" lang="fa" style="padding:2rem;font-family:sans-serif"><h1>صفحه آماده نشد</h1><p>${String(error?.message || error)}</p></main>`;
});

import type { ReactElement } from "react";
import { MarginLiftApp } from "../app/App";
import { PublicSite } from "../public";

type AuthPayload = Record<string, string>;

async function submitAuth(endpoint: string, form: FormData) {
  const payload: AuthPayload = {};
  form.forEach((value, key) => { if (typeof value === "string") payload[key === "organization" ? "companyName" : key] = value; });
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || "درخواست انجام نشد.");
  window.location.assign("/app/today");
}

export function entryElement(entry: string, pathname: string): ReactElement {
  if (entry === "app") return <MarginLiftApp />;
  return (
    <PublicSite
      pathname={pathname}
      authHandlers={{
        login: (form: FormData) => submitAuth("/api/auth/login", form),
        signup: (form: FormData) => submitAuth("/api/auth/signup", form),
      }}
    />
  );
}

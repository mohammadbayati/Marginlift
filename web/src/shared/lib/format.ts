import type { EvidenceLevel } from "../api/schemas";

const numberFormatter = new Intl.NumberFormat("fa-IR-u-nu-arabext", { maximumFractionDigits: 1 });
const moneyFormatter = new Intl.NumberFormat("fa-IR-u-nu-arabext", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "IRR",
  currencyDisplay: "code",
});
const dateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "ناموجود" : numberFormatter.format(value);
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "ناموجود";
  return moneyFormatter.format(value * 10).replace("IRR", "ریال");
}

export function formatToman(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "ناموجود" : `${numberFormatter.format(value)} تومان`;
}

export function formatPercent(value: number | null | undefined, fraction = false): string {
  if (value == null || !Number.isFinite(value)) return "ناموجود";
  return `${numberFormatter.format(fraction ? value * 100 : value)}٪`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "ناموجود";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "ناموجود" : dateFormatter.format(date);
}

export function shortId(value: string | null | undefined, length = 18): string {
  if (!value) return "ناموجود";
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export function evidenceLevelFrom(value: string | null | undefined): EvidenceLevel {
  if (value === "verified_incremental") return value;
  if (value === "pilot_estimate" || value === "pilot_observation" || value === "randomized_estimate") return "pilot_estimate";
  if (value === "shadow_result" || value === "observational_shadow") return "shadow_result";
  if (value === "observational_estimate" || value === "offline_observational") return "observational_estimate";
  return "none";
}

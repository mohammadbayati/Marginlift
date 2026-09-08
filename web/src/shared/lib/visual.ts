import { formatNumber, formatPercent } from "./format";

type Point = { key: string; labelFa: string; value: number | null; kind?: string };

// Totals anchor the bridge; deltas span their actual start and end, including negative values.
export function waterfallRanges<T extends Point>(points: T[]) {
  let total = 0;
  return points.map((point) => {
    if (point.value === null || !Number.isFinite(point.value)) return { ...point, range: null };
    const start = point.kind === "delta" ? total : 0;
    const end = start + point.value;
    total = end;
    return { ...point, range: [Math.min(start, end), Math.max(start, end)] as [number, number] };
  });
}

export function axisMoney(value: number): string {
  if (Math.abs(value) >= 1e6) return `${formatNumber(value / 1e6)}م`;
  if (Math.abs(value) >= 1e3) return `${formatNumber(value / 1e3)}هزار`;
  return formatNumber(value);
}

export function probabilityTooltip(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => typeof item === "number" ? formatPercent(item, true) : "ناموجود").join(" تا ");
  return typeof value === "number" ? formatPercent(value, true) : "ناموجود";
}

export const decisionStateLabels: Record<string, string> = {
  awaiting_data: "در انتظار داده", needs_data_fix: "نیازمند اصلاح داده", observational_ready: "آماده بررسی تاریخی",
  shadow_ready: "آماده اجرای سایه", pilot_registered: "پایلوت ثبت‌شده", needs_review: "نیازمند بازبینی", verified: "تأییدشده",
};

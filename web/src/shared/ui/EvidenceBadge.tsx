import { BadgeCheck, CircleDashed, Eye, FlaskConical, History } from "lucide-react";
import type { EvidenceLevel } from "../api/schemas";

const metadata = {
  none: { icon: CircleDashed, fallback: "بدون شواهد" },
  observational_estimate: { icon: History, fallback: "برآورد مشاهده‌ای" },
  shadow_result: { icon: Eye, fallback: "نتیجه Shadow" },
  pilot_estimate: { icon: FlaskConical, fallback: "برآورد پایلوت" },
  verified_incremental: { icon: BadgeCheck, fallback: "اثر افزایشی تأییدشده" },
} satisfies Record<EvidenceLevel, { icon: typeof CircleDashed; fallback: string }>;

export function EvidenceBadge({ level, label }: { level: EvidenceLevel; label?: string }) {
  const item = metadata[level];
  const Icon = item.icon;
  return (
    <span className={`evidence-badge evidence-${level}`}>
      <Icon aria-hidden="true" size={15} />
      {label || item.fallback}
    </span>
  );
}

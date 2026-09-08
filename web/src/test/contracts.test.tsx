import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceLevelSchema } from "../shared/api/schemas";
import { evidenceLevelFrom, formatToman } from "../shared/lib/format";
import { EvidenceBadge } from "../shared/ui";
import { apiPersona, isPresentationView } from "../app/persona";
import { probabilityTooltip, waterfallRanges } from "../shared/lib/visual";

describe("evidence and financial presentation contracts", () => {
  it("keeps unavailable financial values explicit", () => {
    expect(formatToman(null)).toBe("ناموجود");
    expect(formatToman(undefined)).toBe("ناموجود");
    expect(formatToman(0)).toContain("۰");
  });

  it("supports the complete evidence taxonomy", () => {
    expect(EvidenceLevelSchema.parse("shadow_result")).toBe("shadow_result");
    expect(evidenceLevelFrom("observational_shadow")).toBe("shadow_result");
  });

  it("renders a named Shadow evidence badge", () => {
    render(<EvidenceBadge level="shadow_result" />);
    expect(screen.getByText("نتیجه Shadow")).toBeInTheDocument();
  });

  it("keeps CMO as a presentation view on the executive API contract", () => {
    expect(isPresentationView("cmo")).toBe(true);
    expect(apiPersona("cmo")).toBe("executive");
    expect(apiPersona("finance")).toBe("finance");
  });

  it("builds an honest financial bridge with negative deltas", () => {
    expect(waterfallRanges([
      { key: "base", labelFa: "پایه", value: 100, kind: "total" },
      { key: "cost", labelFa: "هزینه", value: -20, kind: "delta" },
      { key: "result", labelFa: "نتیجه", value: 80, kind: "total" },
    ]).map((item) => item.range)).toEqual([[0, 100], [80, 100], [0, 80]]);
  });

  it("formats confidence ranges without coercing arrays to invalid numbers", () => {
    expect(probabilityTooltip([0.72, 0.84])).toContain("تا");
    expect(probabilityTooltip([0.72, 0.84])).not.toContain("ناموجود");
  });
});

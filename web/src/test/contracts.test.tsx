import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceLevelSchema } from "../shared/api/schemas";
import { evidenceLevelFrom, formatToman } from "../shared/lib/format";
import { EvidenceBadge } from "../shared/ui";

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
});

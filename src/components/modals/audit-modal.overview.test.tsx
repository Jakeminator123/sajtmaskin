import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AuditModal } from "./audit-modal";
import type { AuditResult } from "@/types/audit";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/audit/AuditPdfReport", () => ({ AuditPdfReport: () => null }));
vi.mock("@/components/audit/BudgetEstimate", () => ({ default: () => null }));
vi.mock("@/components/audit/ImprovementsList", () => ({ default: () => null }));
vi.mock("@/components/audit/MetricsChart", () => ({ default: () => null }));
vi.mock("@/components/audit/SecurityReport", () => ({ default: () => null }));

// A VANLIG (basic) audit — the schema still returns audience/content/priority
// data, which used to be hidden because those panels were advanced-only.
const basicResult = {
  audit_type: "website_audit",
  audit_mode: "basic",
  domain: "nordlunden.se",
  customer_segments: { primary_segment: "Villaägare i Umeå" },
  target_audience_analysis: { pain_points: "Svårt att få offert" },
  content_strategy: { seo_foundation: "Titeln saknar ort", key_pages: ["Start", "Tjänster"] },
  priority_matrix: { quick_wins: ["Lägg ort i titeln"] },
} as unknown as AuditResult;

afterEach(() => cleanup());

describe("AuditModal overview", () => {
  it("surfaces målgrupp, synlighet och snabba vinster även för en vanlig audit", () => {
    render(<AuditModal result={basicResult} isOpen onClose={() => {}} />);

    expect(screen.getByText("🎯").parentElement?.textContent).toContain("Målgrupp");
    expect(screen.getByText("Villaägare i Umeå")).toBeTruthy();
    expect(screen.getByText("Titeln saknar ort")).toBeTruthy();
    expect(screen.getByText(/Nyckelsidor: Start, Tjänster/)).toBeTruthy();
    expect(screen.getByText("Lägg ort i titeln")).toBeTruthy();
  });

  it("täcker inte rapporten med bygg-overlayen när modalen öppnas", () => {
    render(
      <AuditModal result={basicResult} isOpen onClose={() => {}} onBuildFromAudit={() => {}} />,
    );

    expect(screen.queryByText("Låt oss bygga din sajt")).toBeNull();
    expect(screen.getByText("Bygg förbättrad sida från analysen")).toBeTruthy();
  });

  it("visar inga tomma paneler när modellen inte gav målgruppsdata", () => {
    render(
      <AuditModal
        result={{ audit_type: "website_audit", domain: "x.se" } as unknown as AuditResult}
        isOpen
        onClose={() => {}}
      />,
    );

    expect(screen.queryByText("Målgrupp")).toBeNull();
    expect(screen.queryByText("Snabba vinster")).toBeNull();
  });
});

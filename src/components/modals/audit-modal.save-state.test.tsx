import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AuditModal } from "./audit-modal";
import type { AuditResult } from "@/types/audit";

// next/image + the heavy audit sub-panels are irrelevant to the save-state
// behavior under test; stub them so a minimal result renders deterministically.
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/audit/AuditPdfReport", () => ({ AuditPdfReport: () => null }));
vi.mock("@/components/audit/BudgetEstimate", () => ({ default: () => null }));
vi.mock("@/components/audit/ImprovementsList", () => ({ default: () => null }));
vi.mock("@/components/audit/MetricsChart", () => ({ default: () => null }));
vi.mock("@/components/audit/SecurityReport", () => ({ default: () => null }));

const minimalResult = { domain: "example.com" } as unknown as AuditResult;

afterEach(() => cleanup());

describe("AuditModal save state", () => {
  it("exposes an active Spara action for a fresh (unsaved) audit", () => {
    render(<AuditModal result={minimalResult} isOpen onClose={() => {}} />);
    const btn = screen.getByTitle("Spara till ditt konto") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain("Spara");
  });

  it("starts in the Sparad state when alreadySaved (no duplicate POST)", () => {
    render(<AuditModal result={minimalResult} isOpen alreadySaved onClose={() => {}} />);
    const btn = screen.getByTitle("Sparad i ditt konto") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // The active "Spara till ditt konto" affordance must NOT be present.
    expect(screen.queryByTitle("Spara till ditt konto")).toBeNull();
  });
});

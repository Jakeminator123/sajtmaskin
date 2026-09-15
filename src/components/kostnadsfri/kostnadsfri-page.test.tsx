// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";

const fixtures = vi.hoisted(() => {
  const companyData: KostnadsfriCompanyData = {
    slug: "zax-2-0-ab",
    companyName: "Zax 2.0 AB",
    industry: null,
    website: null,
    contactEmail: "info@zax.example",
    contactName: "Jan Rickard Mandahl",
    openclawConfig: null,
    profile: {
      businessDescription: "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
    },
  };
  const wizardData: MiniWizardData = {
    companyName: "Zax Frisör",
    industry: "health",
    website: "https://zax.example",
    location: "Kista",
    description: "Vi klipper och färgar hår i Kista sedan 2026.",
    purposes: ["booking", "leads"],
    targetAudience: "Boende i Kista och norra Stockholm",
    usp: "Drop-in på kvällar",
    designVibe: "luxury",
    paletteName: "Ocean",
    colorPrimary: "#000000",
    colorSecondary: "#333333",
    colorAccent: "#2dd4bf",
  };
  return { companyData, wizardData };
});

const createProject = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/projects/project-client", () => ({ createProject }));

vi.mock("./password-gate", () => ({
  PasswordGate: ({ onSuccess }: { onSuccess: (data: KostnadsfriCompanyData) => void }) => (
    <button type="button" onClick={() => onSuccess(fixtures.companyData)}>
      verifiera
    </button>
  ),
}));

vi.mock("./mini-wizard", () => ({
  MiniWizard: ({
    onComplete,
    error,
  }: {
    onComplete: (data: MiniWizardData) => void;
    error: string | null;
  }) => (
    <div>
      {error ? <p>{error}</p> : null}
      <button type="button" onClick={() => onComplete(fixtures.wizardData)}>
        skicka wizard
      </button>
    </div>
  ),
}));

vi.mock("./thinking-spinner", () => ({
  ThinkingSpinner: () => <div>Tänker</div>,
}));

import { KostnadsfriPage } from "./kostnadsfri-page";

afterEach(() => {
  cleanup();
  createProject.mockReset();
  delete window.__SITEMASKIN_CONTEXT;
});

describe("KostnadsfriPage", () => {
  it("rensar wizard-underlaget i kontexten när handoffen misslyckas", async () => {
    createProject.mockRejectedValue(new Error("projektfel"));

    render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);

    fireEvent.click(screen.getByRole("button", { name: "verifiera" }));
    fireEvent.click(screen.getByRole("button", { name: "skicka wizard" }));

    await waitFor(() => {
      expect(screen.getByText("Något gick fel. Försök igen.")).toBeTruthy();
    });

    const brief = window.__SITEMASKIN_CONTEXT?.kostnadsfriBrief as {
      stage?: string;
      businessDescription?: string;
      businessDescriptionSource?: string;
      purposeLabels?: string[];
    };

    expect(brief.stage).toBe("wizard");
    expect(brief.businessDescription).toBe(
      "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
    );
    expect(brief.businessDescriptionSource).toBe("register");
    expect(brief.purposeLabels).toBeUndefined();
  });
});

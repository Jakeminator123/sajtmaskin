// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";
import { MiniWizard } from "./mini-wizard";

vi.mock("./intro-video", () => ({ IntroVideo: () => null }));
vi.mock("@/components/modals/location-picker", () => ({ LocationPicker: () => null }));

const COMPANY: KostnadsfriCompanyData = {
  slug: "zax-2-0-ab",
  companyName: "Zax 2.0 AB",
  industry: null,
  website: null,
  contactEmail: null,
  contactName: null,
  openclawConfig: null,
  profile: null,
};

const SAVED: MiniWizardData = {
  companyName: "Zax Café",
  industry: "cafe",
  website: "",
  location: "Kista",
  description: "Kaffe och bullar",
  purposes: ["leads"],
  targetAudience: "",
  usp: "",
  designVibe: "modern",
  paletteName: "Café Brun",
  colorPrimary: "#78350F",
  colorSecondary: "#A16207",
  colorAccent: "#FDE68A",
};

function openDesignStep(initialData: MiniWizardData) {
  const onComplete = vi.fn();
  render(<MiniWizard companyData={COMPANY} initialData={initialData} onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: /Nästa/ }));
  fireEvent.click(screen.getByRole("button", { name: /Nästa/ }));
  return onComplete;
}

afterEach(cleanup);

describe("MiniWizard — återställd palett", () => {
  it("behåller en sparad branschpalett när kunden inte ändrar den", () => {
    const onComplete = openDesignStep(SAVED);
    fireEvent.click(screen.getByRole("button", { name: /Skapa webbplats/ }));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ paletteName: "Café Brun", colorPrimary: "#78350F" }),
    );
  });

  it("låter ett nytt palettval ersätta den återställda paletten", () => {
    const onComplete = openDesignStep(SAVED);
    fireEvent.click(screen.getByRole("button", { name: /Krämvit Café/ }));
    fireEvent.click(screen.getByRole("button", { name: /Skapa webbplats/ }));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        paletteName: "Krämvit Café",
        colorPrimary: "#292524",
        colorSecondary: "#78716C",
        colorAccent: "#FEF3C7",
      }),
    );
  });

  it("visar återställda egna färger i stället för att gömma dem", () => {
    openDesignStep({ ...SAVED, colorPrimary: "#123456" });

    expect(screen.getByLabelText("Primär")).toHaveProperty("value", "#123456");
  });
});

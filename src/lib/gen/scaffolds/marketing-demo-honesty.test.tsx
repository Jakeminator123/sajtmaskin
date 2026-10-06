import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { landingPageManifest } from "./landing-page/manifest";
import { saasLandingManifest } from "./saas-landing/manifest";
import SaasHomePage from "./saas-landing/files/app/page";
import { PricingCard } from "./saas-landing/files/components/pricing-card";
import { MarketingHeader } from "./saas-landing/files/components/marketing-header";
import { buildCompleteProject } from "../export/project-scaffold";
import { collectRequiredUiComponents } from "../export/project-scaffold-ui-reader";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";

afterEach(cleanup);

describe("marketing scaffold truth boundaries", () => {
  it.each([landingPageManifest, saasLandingManifest])(
    "$id requires evidence before social proof claims",
    (manifest) => {
      expect(manifest.promptHints.join(" ")).toContain("provided by the brief or verified sources");
      expect(manifest.qualityChecklist?.join(" ")).not.toContain("realistic names/roles");
      expect(manifest.research?.upgradeTargets?.join(" ")).not.toContain(
        "concrete numbers relevant to the user's industry",
      );
    },
  );

  it("the static SaaS preview and plan surfaces are labelled as demo, not live", () => {
    const page = saasLandingManifest.files.find((file) => file.path === "app/page.tsx")!.content;
    expect(page).toContain("Demodata — inte ansluten");
    expect(page).toContain("Exempelpriser");
    expect(page).not.toMatch(
      /Live förhandsvisning|De flesta team är igång samma dag|Exportera när ni vill|Starta gratis trial/,
    );
  });

  it("a plan card cannot initiate an unconnected subscription", () => {
    const card = saasLandingManifest.files.find(
      (file) => file.path === "components/pricing-card.tsx",
    )!.content;
    expect(card).toContain("disabled");
    expect(card).toContain("inte anslutet");
    expect(card).not.toMatch(/Populärast|Välj plan/);
  });

  it("the header CTA navigates to examples rather than claiming free signup", () => {
    const header = saasLandingManifest.files.find(
      (file) => file.path === "components/marketing-header.tsx",
    )!.content;
    expect(header).toContain('href="#pricing"');
    expect(header).toContain("Se exempelpriser");
    expect(header).not.toContain("Starta gratis");
  });
});

describe("rendered SaaS demo and real navigation", () => {
  it("labels the KPI/pricing surfaces and cannot submit a subscription", () => {
    const { container } = render(<SaasHomePage />);
    expect(
      within(container.querySelector("#demo-preview")!).getByText("Demodata — inte ansluten"),
    ).toBeDefined();
    expect(container.querySelector("#pricing")?.textContent).toContain("Exempelpriser");
    const plans = screen.getAllByRole("button", { name: "Planval (inte anslutet)" });
    expect(plans).toHaveLength(3);
    expect(plans.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole("link", { name: "Se exempelpriser" }).getAttribute("href")).toBe(
      "#pricing",
    );
    expect(screen.getByRole("link", { name: "Se demo-layout" }).getAttribute("href")).toBe(
      "#demo-preview",
    );
    expect(container.querySelector('button:not([disabled])[type="submit"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kan vi börja gratis?" }));
    expect(
      screen.getByText(/Den här mallen har ingen ansluten trial eller fakturering/),
    ).toBeDefined();
  });

  it("the header's example CTA remains a working in-page anchor", () => {
    render(<MarketingHeader />);
    expect(screen.getByRole("link", { name: "Se exempelpriser" }).getAttribute("href")).toBe(
      "#pricing",
    );
    expect(screen.queryByRole("button", { name: /Starta gratis/ })).toBeNull();
  });

  it("supplied plan facts remain rendered without inventing popularity or activating billing", () => {
    render(
      <PricingCard
        name="Verifierad plan"
        price="1 234 kr"
        description="Angiven beskrivning"
        features={["Angiven funktion"]}
        featured
      />,
    );
    for (const fact of ["Verifierad plan", "1 234 kr", "Angiven beskrivning", "Angiven funktion"])
      expect(screen.getByText(fact)).toBeDefined();
    expect(screen.queryByText("Populärast")).toBeNull();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([landingPageManifest, saasLandingManifest])(
    "materializes $id and its complete UI closure without changing routes",
    (manifest) => {
      const generated = manifest.files.map((file) => ({
        ...file,
        language: inferFileLanguage(file.path),
      }));
      const files = buildCompleteProject(generated, collectRequiredUiComponents(generated));
      const byPath = new Map(files.map((file) => [file.path, file.content]));
      expect(byPath.has("app/page.tsx")).toBe(true);
      expect(byPath.has("app/layout.tsx")).toBe(true);
      expect(byPath.has("components/ui/button.tsx")).toBe(true);
      expect(byPath.has("components/ui/card.tsx")).toBe(true);
      if (manifest.id === "saas-landing") {
        expect(byPath.has("components/pricing-card.tsx")).toBe(true);
        expect(byPath.has("components/ui/accordion.tsx")).toBe(true);
      }
      expect(manifest.routeContract?.requiredRoutes).toEqual([]);
      expect(manifest.routeContract?.declaredRoutePaths).toEqual([]);
    },
  );
});

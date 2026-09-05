import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPanelChrome } from "./PreviewPanelChrome";
import type { PreviewRouteInfo } from "../pages/preview-route-helpers";

/**
 * Sidflik-raden reserverar höjd. Den gatades tidigare på laddat innehåll och
 * monterades då från noll höjd när routes kom in, vilket sköt hela
 * preview-kroppen nedåt (uppmätt 0.07 CLS i prod 2026-08-05).
 */

const ROUTE_BAR_SELECTOR = "div.border-b.border-gray-800.bg-black\\/30";

const BASE_PROPS = {
  isOwnEnginePreview: true,
  isTier2LivePreview: false,
  isCodeView: false,
  previewRoutesLoading: false,
  previewRoutes: [] as PreviewRouteInfo[],
  activePreviewRoute: null,
  handleNavigateRoute: vi.fn(),
  showTier2UnifiedStrip: false,
  showBlobWarning: false,
  showBlobConfigWarning: false,
  integrationError: false,
  showImagesDisabledWarning: false,
  showImagesUnsupportedWarning: false,
  showExternalWarning: false,
};

describe("PreviewPanelChrome sidflik-rad", () => {
  it("renderar raden redan innan några routes är kända", () => {
    const { container } = render(<PreviewPanelChrome {...BASE_PROPS} />);

    expect(container.querySelector(ROUTE_BAR_SELECTOR)).not.toBeNull();
  });

  it("reserverar höjd för en chip-rad även när raden är tom", () => {
    const { container } = render(<PreviewPanelChrome {...BASE_PROPS} />);
    const bar = container.querySelector(ROUTE_BAR_SELECTOR);

    // jsdom gör ingen layout, så klassen är det enda testbara beviset för att
    // höjden är reserverad. Utan den kollapsar den tomma raden till 9 px.
    expect(bar?.firstElementChild?.className).toContain("min-h-6");
  });

  it("behåller samma rad när routes kommit in", () => {
    const { container, rerender } = render(<PreviewPanelChrome {...BASE_PROPS} />);
    const before = container.querySelector(ROUTE_BAR_SELECTOR);
    expect(before).not.toBeNull();

    rerender(
      <PreviewPanelChrome
        {...BASE_PROPS}
        previewRoutes={[
          { route: "/", label: "/", navigable: true, dynamic: false, reachable: true },
        ]}
        activePreviewRoute="/"
      />,
    );

    expect(container.querySelector(ROUTE_BAR_SELECTOR)).toBe(before);
  });

  it("visar inte raden i kodvyn", () => {
    const { container } = render(<PreviewPanelChrome {...BASE_PROPS} isCodeView />);

    expect(container.querySelector(ROUTE_BAR_SELECTOR)).toBeNull();
  });
});

describe("PreviewPanelChrome sanningsrad", () => {
  it("renderar ingen status-alert utan build-fel/verdikt (ägarbeslut 2026-09-01)", () => {
    // Sanningsraden ("Preview klar med luckor" m.fl.) är borttagen: den
    // duplicerade versionspanelens badge och frame-bannern som ett stort
    // alert-block ovanför previewn. Endast build-fel och prod-build-verdiktet
    // får rendera alerts här.
    const { container } = render(<PreviewPanelChrome {...BASE_PROPS} />);

    expect(container.querySelector('[data-slot="alert"]')).toBeNull();
  });

  it("behåller alert för tier-2 build-fel med en mänsklig rubrik (aldrig stage-id:t)", () => {
    const { container, getByText, queryByText } = render(
      <PreviewPanelChrome
        {...BASE_PROPS}
        previewBuildError={{ stage: "build", message: "Type error in app/page.tsx" }}
      />,
    );

    const alert = container.querySelector('[data-testid="preview-build-error-banner"]');
    expect(container.querySelectorAll('[data-slot="alert"]')).toHaveLength(1);
    expect(alert?.getAttribute("data-severity")).toBe("error");
    expect(queryByText(/Tier-2 \/ build/)).toBeNull();
    expect(getByText("Type error in app/page.tsx")).toBeTruthy();
  });

  it("visar ett info-kort utan rå logg för en ej verifierbar (klientrenderad) preview", () => {
    // Prod chat 28af0778: det här var en röd "byggfel"-banner med 30 rader
    // `GET / 200 in 3xms`. Nu: lugn notis, loggen bara bakom en knapp.
    const { container, getByText, queryByText, getByRole } = render(
      <PreviewPanelChrome
        {...BASE_PROPS}
        previewBuildError={{
          stage: "preview-unverified",
          severity: "info",
          title: "Förhandsvisningen kunde inte kontrolleras automatiskt",
          message: "Sidan svarar men visar inget innehåll förrän den körts i webbläsaren.",
          detail: "Runtime served HTML with an empty body for 90000ms\nGET / 200 in 35ms",
        }}
      />,
    );

    const alert = container.querySelector('[data-testid="preview-build-error-banner"]');
    expect(alert?.getAttribute("data-severity")).toBe("info");
    expect(getByText("Förhandsvisningen kunde inte kontrolleras automatiskt")).toBeTruthy();
    expect(queryByText(/GET \/ 200/)).toBeNull();
    expect(queryByText(/byggfel/i)).toBeNull();

    fireEvent.click(getByRole("button", { name: "Visa teknisk detalj" }));
    expect(getByText(/GET \/ 200 in 35ms/)).toBeTruthy();
  });
});

import { render } from "@testing-library/react";
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
  previewUrl: "https://vm.example/chat_1",
  isOwnEnginePreview: true,
  isTier2LivePreview: false,
  previewPending: false,
  iframeError: false,
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

describe("PreviewPanelChrome sanningsrad vid iframe-fel", () => {
  it("kallar preview_ready_timeout misstanke (warning), aldrig 'trasig'", () => {
    // Prod 2026-09-01 (chat c2371f9c): "Preview-iframe är trasig" låg över en
    // fullt fungerande sajt medan den icke-blockerande bannern på samma flagga
    // kallade läget misstanke. Samma diagnostikkod ska ge samma sanningsanspråk.
    const { queryByText, getByText } = render(
      <PreviewPanelChrome
        {...BASE_PROPS}
        iframeError
        iframeErrorMessage="Previewn laddade inte klart innan timeout."
        iframeDiagnosticCode="preview_ready_timeout"
      />,
    );

    expect(queryByText("Preview-iframe är trasig")).toBeNull();
    const title = getByText("Previewn laddade inte klart innan timeout");
    expect(title.className).toContain("text-amber-100");
  });

  it("behåller fel-anspråket för andra iframe-fel", () => {
    const { getByText } = render(
      <PreviewPanelChrome
        {...BASE_PROPS}
        iframeError
        iframeErrorMessage="Preview iframe document could not be read."
        iframeDiagnosticCode="preview_document_unavailable"
      />,
    );

    expect(getByText("Preview-iframe är trasig")).toBeTruthy();
  });
});

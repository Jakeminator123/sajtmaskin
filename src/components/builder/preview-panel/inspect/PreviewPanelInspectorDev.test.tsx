import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreviewPanelInspectorDev } from "./PreviewPanelInspectorDev";

describe("PreviewPanelInspectorDev", () => {
  it("keeps inspect clicks disabled until the iframe is truly ready", () => {
    const props = {
      showPlacementOverlay: false,
      showInspectOverlay: true,
      iframeLoading: true,
      externalLoading: false,
      handlePlacementClick: vi.fn(),
      handlePlacementMouseMove: vi.fn(),
      onPlacementMouseLeave: vi.fn(),
      hoveredPlacement: null,
      pendingPlacementItem: null,
      elementMapLoading: false,
      sectionZonesCount: 0,
      isCapturePending: false,
      handleCaptureClick: vi.fn(),
      inspectEngine: "map" as const,
      hoveredMapElement: null,
      inspectPulse: null,
      setInspectEngine: vi.fn(),
      inspectorUnavailable: false,
      elementMapCount: 0,
      totalAiCostUsd: 0,
      lastAiCostDisplay: null,
      inspectStatus: null,
      lastCodeMatch: null,
      onShowLastCodeMatch: vi.fn(),
      handleToggleInspect: vi.fn(),
    };
    const { container, rerender } = render(<PreviewPanelInspectorDev {...props} />);

    const overlay = container.querySelector(".cursor-crosshair");
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain("pointer-events-none");

    rerender(<PreviewPanelInspectorDev {...props} iframeLoading={false} />);
    expect(container.querySelector(".cursor-crosshair")?.className).not.toContain(
      "pointer-events-none",
    );
  });

  it("släpper igenom pekaren och visar banner när elementkartan är död (map)", () => {
    // Prod 2026-08-31: bridge föll ner till map, kartan var 503 i serverless
    // och ytan svalde alla klick med "Hovra över ett element först". En död
    // karta får inte vara en osynlig klickvägg.
    const props = {
      showPlacementOverlay: false,
      showInspectOverlay: true,
      iframeLoading: false,
      externalLoading: false,
      handlePlacementClick: vi.fn(),
      handlePlacementMouseMove: vi.fn(),
      onPlacementMouseLeave: vi.fn(),
      hoveredPlacement: null,
      pendingPlacementItem: null,
      elementMapLoading: false,
      sectionZonesCount: 0,
      isCapturePending: false,
      handleCaptureClick: vi.fn(),
      inspectEngine: "map" as const,
      hoveredMapElement: null,
      inspectPulse: null,
      setInspectEngine: vi.fn(),
      inspectorUnavailable: true,
      elementMapCount: 0,
      totalAiCostUsd: 0,
      lastAiCostDisplay: null,
      inspectStatus: null,
      lastCodeMatch: null,
      onShowLastCodeMatch: vi.fn(),
      handleToggleInspect: vi.fn(),
    };
    const { container, getByTestId, queryByTestId, rerender } = render(
      <PreviewPanelInspectorDev {...props} />,
    );

    expect(container.querySelector(".cursor-crosshair")?.className).toContain(
      "pointer-events-none",
    );
    expect(getByTestId("inspector-map-unavailable-banner").textContent).toContain(
      "Inspektorn kan inte läsa den här previewn",
    );

    // Medan kartan fortfarande laddar är ytan aktiv och bannern borta.
    rerender(
      <PreviewPanelInspectorDev {...props} inspectorUnavailable={false} elementMapCount={12} />,
    );
    expect(container.querySelector(".cursor-crosshair")?.className).not.toContain(
      "pointer-events-none",
    );
    expect(queryByTestId("inspector-map-unavailable-banner")).toBeNull();
  });
});

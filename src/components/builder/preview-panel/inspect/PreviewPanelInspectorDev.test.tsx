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
});

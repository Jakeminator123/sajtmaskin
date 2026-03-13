import { describe, expect, it, vi } from "vitest";

const OPENCLAW = vi.hoisted(() => ({
  enabled: true,
  tokenConfigured: false,
  gatewayToken: "",
  gatewayUrl: "https://gateway.example",
  implementationFlagEnabled: true,
}));

vi.mock("@/lib/config", () => ({
  OPENCLAW,
}));

import { describeOpenClawSurface, getOpenClawSurfaceStatus } from "./status";

describe("OpenClaw surface status", () => {
  it("blocks the surface when the gateway token is missing", () => {
    const surface = describeOpenClawSurface({
      gatewayConfigured: true,
      gatewayTokenConfigured: false,
      implementationFlagEnabled: true,
    });

    expect(surface.surfaceEnabled).toBe(false);
    expect(surface.surfaceStatus).toBe("disabled_missing_token");
    expect(surface.blockers).toContain("OPENCLAW_GATEWAY_TOKEN is not configured");
  });

  it("derives token gating from config in the runtime snapshot", () => {
    const surface = getOpenClawSurfaceStatus();

    expect(surface.surfaceEnabled).toBe(false);
    expect(surface.surfaceStatus).toBe("disabled_missing_token");
  });
});

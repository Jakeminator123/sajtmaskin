import { afterEach, describe, expect, it, vi } from "vitest";

const OPENCLAW = vi.hoisted(() => ({
  enabled: true,
  tokenConfigured: false,
  gatewayToken: "",
  gatewayUrl: "https://gateway.example",
  implementationFlagEnabled: true,
  modelRoutingEnabled: false,
  debugEnabled: false,
  editEnabled: false,
}));

vi.mock("@/lib/config", () => ({
  OPENCLAW,
}));

import {
  checkOpenClawGatewayHealth,
  describeOpenClawSurface,
  getOpenClawSurfaceStatus,
} from "./status";

afterEach(() => {
  OPENCLAW.modelRoutingEnabled = false;
  vi.restoreAllMocks();
});

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

  it("keeps the read gate (OC_DEBUG) and the act gate (OC_EDIT) independent", () => {
    const readOnly = describeOpenClawSurface({
      gatewayConfigured: true,
      gatewayTokenConfigured: true,
      implementationFlagEnabled: true,
      debugEnabled: true,
    });

    expect(readOnly.debugEnabled).toBe(true);
    expect(readOnly.editEnabled).toBe(false);

    const actOnly = describeOpenClawSurface({
      gatewayConfigured: true,
      gatewayTokenConfigured: true,
      implementationFlagEnabled: true,
      editEnabled: true,
    });

    expect(actOnly.debugEnabled).toBe(false);
    expect(actOnly.editEnabled).toBe(true);
  });

  it("defaults both gates to false when omitted", () => {
    const surface = describeOpenClawSurface({
      gatewayConfigured: true,
      gatewayTokenConfigured: true,
      implementationFlagEnabled: true,
    });

    expect(surface.debugEnabled).toBe(false);
    expect(surface.editEnabled).toBe(false);
  });

  it("requires an authenticated model-list readiness check", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const health = await checkOpenClawGatewayHealth();

    expect(health.status).toBe("unhealthy");
    expect(health.readiness).toBe("auth_failed");
  });

  it("checks every routed agent when model routing is enabled", async () => {
    OPENCLAW.modelRoutingEnabled = true;
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "openclaw/sajtagenten" }] }),
      );

    const health = await checkOpenClawGatewayHealth();

    expect(health.readiness).toBe("missing_agents");
    expect(health.missingAgentIds).toEqual([
      "openclaw/sajtagenten-balanced",
      "openclaw/sajtagenten-fast",
    ]);
  });

  it("reports ready when the configured agent targets are present", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "openclaw/sajtagenten" }] }),
      );

    const health = await checkOpenClawGatewayHealth();

    expect(health.status).toBe("ok");
    expect(health.readiness).toBe("ready");
  });
});

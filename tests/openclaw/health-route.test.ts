import { beforeEach, describe, expect, it, vi } from "vitest";

const checkOpenClawGatewayHealth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/openclaw/status", () => ({
  checkOpenClawGatewayHealth,
}));

import { GET } from "@/app/api/openclaw/health/route";

describe("OpenClaw health route", () => {
  beforeEach(() => {
    checkOpenClawGatewayHealth.mockReset();
  });

  it("returns 200 when the gateway is healthy", async () => {
    checkOpenClawGatewayHealth.mockResolvedValue({
      status: "ok",
      gatewayConfigured: true,
      gatewayTokenConfigured: true,
      implementationFlagEnabled: true,
      surfaceEnabled: true,
      surfaceStatus: "enabled",
      blockers: [],
    });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      status: "ok",
      surfaceEnabled: true,
    });
  });

  it("maps unconfigured and unhealthy states to expected status codes", async () => {
    checkOpenClawGatewayHealth.mockResolvedValueOnce({
      status: "unconfigured",
      error: "OPENCLAW_GATEWAY_URL not set",
      gatewayConfigured: false,
      gatewayTokenConfigured: false,
      implementationFlagEnabled: false,
      surfaceEnabled: false,
      surfaceStatus: "disabled_missing_gateway_and_flag",
      blockers: [
        "OPENCLAW_GATEWAY_URL is not configured",
        "IMPLEMENT_UNDERSCORE_CLAW is not enabled",
      ],
    });

    const unconfigured = await GET();
    expect(unconfigured.status).toBe(503);

    checkOpenClawGatewayHealth.mockResolvedValueOnce({
      status: "unhealthy",
      upstream: 500,
      gatewayConfigured: true,
      gatewayTokenConfigured: true,
      implementationFlagEnabled: true,
      surfaceEnabled: true,
      surfaceStatus: "enabled",
      blockers: [],
    });

    const unhealthy = await GET();
    expect(unhealthy.status).toBe(502);
  });
});

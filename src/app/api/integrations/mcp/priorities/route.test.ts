import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("MCP priorities route", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns requirements without projecting server-secret readiness", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "server-secret-must-not-drive-project-readiness");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.priorities[0]).toEqual(
      expect.objectContaining({
        id: "posthog",
        requiredEnv: ["NEXT_PUBLIC_POSTHOG_KEY"],
      }),
    );
    expect(body.priorities[0]).not.toHaveProperty("readiness");
    expect(body.priorities[0]).not.toHaveProperty("missingEnv");
  });
});

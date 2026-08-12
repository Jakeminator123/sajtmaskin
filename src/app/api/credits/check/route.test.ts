import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const isTestUser = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/users", () => ({ isTestUser }));

import { GET } from "./route";

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/credits/check?${query}`);
}

describe("GET /api/credits/check execution mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      diamonds: 0,
      free_generation_available: true,
    });
    isTestUser.mockReturnValue(false);
  });

  it("uses the account entitlement for normal own-engine code generation", async () => {
    const response = await GET(request("action=generate&modelId=pro&executionMode=codegen"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      canProceed: true,
      executionMode: "codegen",
      freeGenerationEligible: true,
      freeGenerationAvailable: true,
      accountFreeGenerationAvailable: true,
      usingFreeGeneration: true,
    });
  });

  it.each(["plan", "repair"])(
    "does not advertise or use the entitlement for %s execution",
    async (executionMode) => {
      const response = await GET(
        request(`action=refine&modelId=pro&executionMode=${executionMode}`),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        canProceed: false,
        executionMode,
        freeGenerationEligible: false,
        freeGenerationAvailable: false,
        accountFreeGenerationAvailable: true,
        usingFreeGeneration: false,
      });
    },
  );

  it("fails closed when execution mode is missing or unknown", async () => {
    const missingResponse = await GET(request("action=refine&modelId=pro"));
    expect(await missingResponse.json()).toMatchObject({
      canProceed: false,
      executionMode: "other",
      freeGenerationEligible: false,
      usingFreeGeneration: false,
    });

    const unknownResponse = await GET(
      request("action=generate&modelId=pro&executionMode=unexpected"),
    );
    expect(await unknownResponse.json()).toMatchObject({
      canProceed: false,
      executionMode: "other",
      freeGenerationEligible: false,
      usingFreeGeneration: false,
    });
  });

  it("does not advertise the free generation to a signed-out repair request", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await GET(request("action=refine&executionMode=repair"));
    const body = await response.json();

    expect(body).toMatchObject({
      canProceed: false,
      authenticated: false,
      executionMode: "repair",
      freeGenerationEligible: false,
      requiresAuth: true,
    });
    expect(body.reason).not.toContain("kostnadsfri");
  });
});

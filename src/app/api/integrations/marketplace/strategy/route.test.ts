import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("marketplace strategy route", () => {
  it("returns the user-owned marketplace contract", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.strategy).toEqual(
      expect.objectContaining({
        key: "user_managed_vercel",
        ownershipModel: "user_vercel_account",
        billingOwner: "user",
        envOwnership: "project_scoped",
      }),
    );
    expect(body.supportedIntegrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "neon",
          installUrl: "https://vercel.com/marketplace/neon",
        }),
      ]),
    );
  });
});

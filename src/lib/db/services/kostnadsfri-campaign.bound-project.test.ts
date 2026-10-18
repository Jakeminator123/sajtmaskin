import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ value: [] as Array<{ projectId: string; ownerId: string | null }> }));

vi.mock("@/lib/db/client", () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => rows.value,
  };
  return { db: { select: () => chain }, dbConfigured: true };
});

const { getKostnadsfriBoundProjectIdForOwner } = await import("./kostnadsfri-campaign");

describe("getKostnadsfriBoundProjectIdForOwner", () => {
  beforeEach(() => {
    rows.value = [];
  });

  it("returns the bound project to the user who owns it", async () => {
    rows.value = [{ projectId: "proj_original", ownerId: "user_campaign" }];
    await expect(getKostnadsfriBoundProjectIdForOwner("zax-2-0-ab", "user_campaign")).resolves.toBe(
      "proj_original",
    );
  });

  it("never reveals another owner's project", async () => {
    rows.value = [{ projectId: "proj_original", ownerId: "user_other" }];
    await expect(getKostnadsfriBoundProjectIdForOwner("zax-2-0-ab", "user_campaign")).resolves.toBeNull();
    rows.value = [{ projectId: "proj_guest", ownerId: null }];
    await expect(getKostnadsfriBoundProjectIdForOwner("zax-2-0-ab", "user_campaign")).resolves.toBeNull();
  });

  it("returns null when the invitation is not bound yet", async () => {
    await expect(getKostnadsfriBoundProjectIdForOwner("zax-2-0-ab", "user_campaign")).resolves.toBeNull();
  });
});

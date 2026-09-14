import { beforeEach, describe, expect, it, vi } from "vitest";

const claimUnclaimedSessionProjects = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  claimUnclaimedSessionProjects,
}));

import { reconnectGuestProjects } from "./guest-claim";

const GUEST = "sess_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("guest project reconnect", () => {
  beforeEach(() => {
    claimUnclaimedSessionProjects.mockReset();
  });

  it("moves only the unclaimed projects of that session onto the user", async () => {
    claimUnclaimedSessionProjects.mockResolvedValue(["proj_1", "proj_2"]);

    await expect(reconnectGuestProjects(GUEST, "user_1")).resolves.toEqual({
      sessionId: GUEST,
      claimedProjectIds: ["proj_1", "proj_2"],
      ok: true,
    });
    expect(claimUnclaimedSessionProjects).toHaveBeenCalledWith(GUEST, "user_1");
  });

  it("reports ok with nothing claimed when the session owns no unclaimed rows", async () => {
    claimUnclaimedSessionProjects.mockResolvedValue([]);

    await expect(reconnectGuestProjects(GUEST, "user_1")).resolves.toEqual({
      sessionId: GUEST,
      claimedProjectIds: [],
      ok: true,
    });
  });

  it("reports not-ok on a database failure so the leftover is kept for a retry", async () => {
    claimUnclaimedSessionProjects.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(reconnectGuestProjects(GUEST, "user_1")).resolves.toEqual({
      sessionId: GUEST,
      claimedProjectIds: [],
      ok: false,
    });

    consoleError.mockRestore();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const deleteMediaLibraryItem = vi.hoisted(() => vi.fn());
const getMediaLibraryItemById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/media", () => ({
  deleteMediaLibraryItem,
  getMediaLibraryItemById,
}));

const { DELETE } = await import("./route");

function request(id: string) {
  return DELETE(new NextRequest(`http://localhost/api/media/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("DELETE /api/media/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getMediaLibraryItemById.mockResolvedValue({ id: 12 });
    deleteMediaLibraryItem.mockResolvedValue(true);
  });

  it.each(["12extra", "0", "-1", "9007199254740992", "1".repeat(10_000)])(
    "rejects the malformed media id %s",
    async (id) => {
      const res = await request(id);

      expect(res.status).toBe(400);
      expect(getMediaLibraryItemById).not.toHaveBeenCalled();
    },
  );

  it("does not expose media-service failures", async () => {
    getMediaLibraryItemById.mockRejectedValue(new Error("database host secret"));

    const res = await request("12");

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Kunde inte ta bort filen",
    });
  });
});

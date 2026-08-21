import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteBlob = vi.hoisted(() => vi.fn(async () => true));
const rows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/vercel/blob-service", () => ({ deleteBlob }));
vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    select: () => ({
      from: () => ({
        where: async () => rows.value,
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => [],
      }),
    }),
    delete: () => ({
      where: async () => [],
    }),
  },
}));

import { deletePreviousLiveReviewBlobs } from "./live-review-runs";

describe("deletePreviousLiveReviewBlobs", () => {
  beforeEach(() => {
    deleteBlob.mockClear();
    rows.value = [
      {
        id: "lr_old",
        chatId: "chat_1",
        versionId: "v0",
        filesRevision: "rev_old",
        userId: "user_1",
        status: "completed",
        skipReason: null,
        result: null,
        desktopUrl: "https://blob.example/old-d.jpg",
        mobileUrl: "https://blob.example/old-m.jpg",
        desktopBlobPath: "user/projects/chat/media/old-d.jpg",
        mobileBlobPath: "user/projects/chat/media/old-m.jpg",
        modelAttempts: 1,
        claimedAt: new Date(),
        completedAt: new Date(),
        expiresAt: new Date(),
      },
    ];
  });

  it("raderar föregående pares URL och path", async () => {
    const deleted = await deletePreviousLiveReviewBlobs({
      chatId: "chat_1",
      keepVersionId: "v1",
      keepFilesRevision: "rev_new",
    });
    expect(deleted).toBe(1);
    expect(deleteBlob).toHaveBeenCalledWith("https://blob.example/old-d.jpg");
    expect(deleteBlob).toHaveBeenCalledWith("https://blob.example/old-m.jpg");
  });
});

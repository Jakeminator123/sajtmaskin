import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteBlob = vi.hoisted(() => vi.fn(async () => true));
const rows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));
const updateWhere = vi.hoisted(() => vi.fn(async () => []));
const deleteWhere = vi.hoisted(() => vi.fn(async () => []));

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
        where: updateWhere,
      }),
    }),
    delete: () => ({
      where: deleteWhere,
    }),
  },
}));

import {
  deletePreviousLiveReviewBlobs,
  purgeExpiredLiveReviewBlobs,
} from "./live-review-runs";

const oldRow = {
  id: "lr_old",
  chatId: "chat_1",
  versionId: "v0",
  filesRevision: "rev_old",
  userId: "user_1",
  status: "completed",
  skipReason: null,
  result: null,
  desktopUrl: "https://abc.blob.vercel-storage.com/old-d.jpg",
  mobileUrl: "https://abc.blob.vercel-storage.com/old-m.jpg",
  desktopBlobPath: "user/projects/chat/media/old-d.jpg",
  mobileBlobPath: "user/projects/chat/media/old-m.jpg",
  modelAttempts: 1,
  claimedAt: new Date(),
  completedAt: new Date(),
  expiresAt: new Date("2020-01-01T00:00:00.000Z"),
};

describe("deletePreviousLiveReviewBlobs", () => {
  beforeEach(() => {
    deleteBlob.mockReset();
    deleteBlob.mockResolvedValue(true);
    updateWhere.mockClear();
    deleteWhere.mockClear();
    rows.value = [{ ...oldRow }];
  });

  it("raderar föregående pares URL och path", async () => {
    const deleted = await deletePreviousLiveReviewBlobs({
      chatId: "chat_1",
      keepVersionId: "v1",
      keepFilesRevision: "rev_new",
    });
    expect(deleted).toBe(1);
    expect(deleteBlob).toHaveBeenCalledWith("https://abc.blob.vercel-storage.com/old-d.jpg");
    expect(deleteBlob).toHaveBeenCalledWith("https://abc.blob.vercel-storage.com/old-m.jpg");
    expect(updateWhere).toHaveBeenCalled();
  });

  it("behåller blob-refs om Blob-delete misslyckas", async () => {
    deleteBlob.mockResolvedValue(false);
    const deleted = await deletePreviousLiveReviewBlobs({
      chatId: "chat_1",
      keepVersionId: "v1",
      keepFilesRevision: "rev_new",
    });
    expect(deleted).toBe(0);
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("låter lokal path-delete misslyckas utan att fälla blob-URL som lyckades", async () => {
    deleteBlob.mockImplementation(async (target?: unknown) =>
      String(target ?? "").includes(".blob.vercel-storage.com"),
    );
    const deleted = await deletePreviousLiveReviewBlobs({
      chatId: "chat_1",
      keepVersionId: "v1",
      keepFilesRevision: "rev_new",
    });
    expect(deleted).toBe(1);
    expect(updateWhere).toHaveBeenCalled();
  });
});

describe("purgeExpiredLiveReviewBlobs", () => {
  beforeEach(() => {
    deleteBlob.mockReset();
    deleteBlob.mockResolvedValue(true);
    updateWhere.mockClear();
    deleteWhere.mockClear();
    rows.value = [{ ...oldRow }];
  });

  it("raderar inte DB-raden om Blob-delete misslyckas", async () => {
    deleteBlob.mockResolvedValue(false);
    const deleted = await purgeExpiredLiveReviewBlobs(new Date("2026-08-22T00:00:00.000Z"));
    expect(deleted).toBe(0);
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("raderar raden först när Blob-delete lyckas", async () => {
    const deleted = await purgeExpiredLiveReviewBlobs(new Date("2026-08-22T00:00:00.000Z"));
    expect(deleted).toBe(1);
    expect(deleteWhere).toHaveBeenCalled();
  });
});

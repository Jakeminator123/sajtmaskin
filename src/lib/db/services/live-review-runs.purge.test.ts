import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const deleteBlob = vi.hoisted(() => vi.fn(async () => true));
const selectQueue = vi.hoisted(() => ({ value: [] as Array<Array<Record<string, unknown>>> }));
const updateReturningQueue = vi.hoisted(() => ({
  value: [] as Array<Array<Record<string, unknown>>>,
}));
const deleteReturningQueue = vi.hoisted(() => ({
  value: [] as Array<Array<Record<string, unknown>>>,
}));
const insertReturningQueue = vi.hoisted(() => ({
  value: [] as Array<Array<Record<string, unknown>>>,
}));
const updateWhere = vi.hoisted(() => ({ value: [] as unknown[] }));
const updateSet = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));
const deleteWhere = vi.hoisted(() => ({ value: [] as unknown[] }));
const selectWhere = vi.hoisted(() => ({ value: [] as unknown[] }));

function rowsResult(rows: Array<Record<string, unknown>>) {
  const promise = Promise.resolve(rows);
  return {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    limit: async () => rows,
    orderBy: () => rowsResult(rows),
  };
}

vi.mock("@/lib/vercel/blob-service", () => ({ deleteBlob }));
vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          selectWhere.value.push(where);
          return rowsResult(selectQueue.value.shift() ?? []);
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateSet.value.push(values);
        return {
          where: (where: unknown) => {
            updateWhere.value.push(where);
            return {
              returning: async () => updateReturningQueue.value.shift() ?? [],
            };
          },
        };
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => insertReturningQueue.value.shift() ?? [],
        }),
      }),
    }),
    delete: () => ({
      where: (where: unknown) => {
        deleteWhere.value.push(where);
        return {
          returning: async () => deleteReturningQueue.value.shift() ?? [],
        };
      },
    }),
  },
}));

import {
  claimLiveReviewRun,
  completeLiveReviewRun,
  deletePreviousLiveReviewBlobs,
  getPreviousLiveReviewScreenshots,
  getLiveReviewRunForVersion,
  purgeExpiredLiveReviewBlobs,
} from "./live-review-runs";

const CLAIMED_AT = new Date("2026-08-20T10:00:00.000Z");
const COMPLETED_AT = new Date("2026-08-20T10:01:00.000Z");

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lr_old",
    chatId: "chat_1",
    versionId: "v1",
    filesRevision: "rev_1",
    userId: "user_1",
    status: "completed",
    skipReason: null,
    result: null,
    desktopUrl: "https://abc.blob.vercel-storage.com/old-d.jpg",
    mobileUrl: "https://abc.blob.vercel-storage.com/old-m.jpg",
    desktopBlobPath: "user/projects/chat/media/old-d.jpg",
    mobileBlobPath: "user/projects/chat/media/old-m.jpg",
    modelAttempts: 1,
    claimedAt: CLAIMED_AT,
    completedAt: COMPLETED_AT,
    expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function renderSql(value: unknown): { sql: string; params: unknown[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = new PgDialect().sqlToQuery(value as any);
  return { sql: query.sql.toLowerCase(), params: query.params };
}

describe("completeLiveReviewRun lease CAS", () => {
  beforeEach(() => {
    updateWhere.value = [];
    updateSet.value = [];
    updateReturningQueue.value = [[{ id: "lr_1" }]];
  });

  it("cannot let an old lease complete after a takeover", async () => {
    await expect(
      completeLiveReviewRun({
        id: "lr_1",
        claimedAt: CLAIMED_AT,
        filesRevision: "rev_2",
        result: { status: "skipped", reason: "review_error" },
      }),
    ).resolves.toBe(true);

    const where = renderSql(updateWhere.value[0]);
    expect(where.params).toEqual(
      expect.arrayContaining(["lr_1", "running", CLAIMED_AT.toISOString(), "rev_2"]),
    );
  });
});

describe("claimLiveReviewRun cleanup-tombstone exclusion", () => {
  beforeEach(() => {
    insertReturningQueue.value = [[]];
    selectQueue.value = [];
    updateWhere.value = [];
    updateReturningQueue.value = [];
  });

  it("blocks takeover while an expired row still owns hidden Blob cleanup", async () => {
    selectQueue.value = [
      [
        runRow({
          status: "skipped",
          skipReason: "review_error",
          result: { status: "skipped", reason: "review_error" },
          desktopUrl: null,
          mobileUrl: null,
          desktopBlobPath: "https://abc.blob.vercel-storage.com/old-d.jpg",
          mobileBlobPath: "https://abc.blob.vercel-storage.com/old-m.jpg",
        }),
      ],
    ];

    await expect(
      claimLiveReviewRun({
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_1",
        userId: "user_1",
      }),
    ).resolves.toMatchObject({ kind: "in_flight" });
    expect(updateWhere.value).toHaveLength(0);
  });

  it("binds takeover CAS to the screenshot references read before a concurrent scrub", async () => {
    const existing = runRow({
      status: "skipped",
      skipReason: "review_error",
      result: { status: "skipped", reason: "review_error" },
    });
    selectQueue.value = [[existing], []];
    updateReturningQueue.value = [[]];

    await claimLiveReviewRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_1",
      userId: "user_1",
    });

    const takeoverWhere = renderSql(updateWhere.value[0]);
    expect(takeoverWhere.params).toEqual(
      expect.arrayContaining([
        existing.desktopUrl,
        existing.mobileUrl,
        existing.desktopBlobPath,
        existing.mobileBlobPath,
      ]),
    );
  });
});

describe("deletePreviousLiveReviewBlobs monotonic cleanup", () => {
  beforeEach(() => {
    deleteBlob.mockReset();
    deleteBlob.mockResolvedValue(true);
    updateWhere.value = [];
    updateSet.value = [];
    updateReturningQueue.value = [];
    selectQueue.value = [];
  });

  it("a late v2 completion deletes v1 but never newer v3 or a running row", async () => {
    selectQueue.value = [
      [{ id: "v2", versionNumber: 2, filesRevision: "rev_2" }],
      [
        runRow({ id: "lr_v3", versionId: "v3", filesRevision: "rev_3" }),
        runRow({ id: "lr_running", versionId: "v0", status: "running" }),
        runRow({ id: "lr_v1", versionId: "v1", filesRevision: "rev_1" }),
      ],
      [
        { id: "v3", versionNumber: 3 },
        { id: "v0", versionNumber: 0 },
        { id: "v1", versionNumber: 1 },
      ],
    ];
    updateReturningQueue.value = [[{ id: "lr_v1" }], [{ id: "lr_v1" }]];

    const deleted = await deletePreviousLiveReviewBlobs({
      chatId: "chat_1",
      keepVersionId: "v2",
      keepFilesRevision: "rev_2",
      keepRunId: "lr_v2",
      keepClaimedAt: new Date("2026-08-21T00:00:00.000Z"),
    });

    expect(deleted).toBe(1);
    expect(deleteBlob).toHaveBeenCalledWith("https://abc.blob.vercel-storage.com/old-d.jpg");
    expect(updateWhere.value).toHaveLength(2);
    expect(renderSql(updateWhere.value[0]).params).toContain("lr_v1");
    expect(renderSql(updateWhere.value[0]).params).not.toContain("lr_v3");
  });

  it("retains a hidden deletion tombstone after Blob failure and retries it later", async () => {
    const keepVersion = [{ id: "v2", versionNumber: 2, filesRevision: "rev_2" }];
    const oldRows = [runRow({ id: "lr_v1", versionId: "v1", filesRevision: "rev_1" })];
    const oldVersions = [{ id: "v1", versionNumber: 1 }];
    selectQueue.value = [
      keepVersion,
      oldRows,
      oldVersions,
      keepVersion,
      [
        runRow({
          id: "lr_v1",
          versionId: "v1",
          filesRevision: "rev_1",
          desktopUrl: null,
          mobileUrl: null,
          desktopBlobPath: "https://abc.blob.vercel-storage.com/old-d.jpg",
          mobileBlobPath: "https://abc.blob.vercel-storage.com/old-m.jpg",
        }),
      ],
      oldVersions,
    ];
    updateReturningQueue.value = [[{ id: "lr_v1" }], [{ id: "lr_v1" }], [{ id: "lr_v1" }]];
    deleteBlob.mockResolvedValue(false);

    await expect(
      deletePreviousLiveReviewBlobs({
        chatId: "chat_1",
        keepVersionId: "v2",
        keepFilesRevision: "rev_2",
        keepRunId: "lr_v2",
        keepClaimedAt: new Date("2026-08-21T00:00:00.000Z"),
      }),
    ).resolves.toBe(0);
    expect(updateSet.value[0]).toMatchObject({
      desktopUrl: null,
      mobileUrl: null,
      desktopBlobPath: "https://abc.blob.vercel-storage.com/old-d.jpg",
      mobileBlobPath: "https://abc.blob.vercel-storage.com/old-m.jpg",
    });

    deleteBlob.mockResolvedValue(true);
    await expect(
      deletePreviousLiveReviewBlobs({
        chatId: "chat_1",
        keepVersionId: "v2",
        keepFilesRevision: "rev_2",
        keepRunId: "lr_v2",
        keepClaimedAt: new Date("2026-08-21T00:00:00.000Z"),
      }),
    ).resolves.toBe(1);
    expect(updateSet.value.at(-1)).toEqual({
      desktopBlobPath: null,
      mobileBlobPath: null,
    });
  });

  it("a stale keep revision has no cleanup authority", async () => {
    selectQueue.value = [[{ id: "v2", versionNumber: 2, filesRevision: "rev_3" }]];
    const deleted = await deletePreviousLiveReviewBlobs({
      chatId: "chat_1",
      keepVersionId: "v2",
      keepFilesRevision: "rev_2",
      keepRunId: "lr_v2_old",
      keepClaimedAt: CLAIMED_AT,
    });
    expect(deleted).toBe(0);
    expect(deleteBlob).not.toHaveBeenCalled();
  });
});

describe("purgeExpiredLiveReviewBlobs takeover CAS", () => {
  beforeEach(() => {
    deleteBlob.mockReset();
    deleteBlob.mockResolvedValue(true);
    updateWhere.value = [];
    updateSet.value = [];
    updateReturningQueue.value = [];
    deleteWhere.value = [];
    deleteReturningQueue.value = [];
    selectQueue.value = [[runRow({ status: "skipped" })]];
  });

  it("does not touch Blob when a retry renewed/took over after SELECT", async () => {
    updateReturningQueue.value = [[]];
    const deleted = await purgeExpiredLiveReviewBlobs(new Date("2026-08-22T00:00:00.000Z"));
    expect(deleted).toBe(0);
    expect(deleteBlob).not.toHaveBeenCalled();
    const where = renderSql(updateWhere.value[0]);
    expect(where.params).toEqual(
      expect.arrayContaining(["lr_old", "skipped", CLAIMED_AT.toISOString(), "rev_1"]),
    );
    expect(where.sql).toContain("expires_at");
  });

  it("deletes a still-expired non-running row after removing its Blob", async () => {
    updateReturningQueue.value = [[{ id: "lr_old" }]];
    deleteReturningQueue.value = [[{ id: "lr_old" }]];
    const deleted = await purgeExpiredLiveReviewBlobs(new Date("2026-08-22T00:00:00.000Z"));
    expect(deleted).toBe(1);
    expect(deleteBlob).toHaveBeenCalled();
  });

  it("keeps an expired cleanup tombstone when Blob delete fails and retries it", async () => {
    const tombstoned = runRow({
      status: "skipped",
      desktopUrl: null,
      mobileUrl: null,
      desktopBlobPath: "https://abc.blob.vercel-storage.com/old-d.jpg",
      mobileBlobPath: "https://abc.blob.vercel-storage.com/old-m.jpg",
    });
    selectQueue.value = [[runRow({ status: "skipped" })], [tombstoned]];
    updateReturningQueue.value = [[{ id: "lr_old" }], [{ id: "lr_old" }]];
    deleteReturningQueue.value = [[{ id: "lr_old" }]];
    deleteBlob.mockResolvedValue(false);

    await expect(purgeExpiredLiveReviewBlobs(new Date("2026-08-22T00:00:00.000Z"))).resolves.toBe(
      0,
    );
    expect(deleteWhere.value).toHaveLength(0);
    expect(updateSet.value[0]).toMatchObject({
      desktopUrl: null,
      desktopBlobPath: "https://abc.blob.vercel-storage.com/old-d.jpg",
    });

    deleteBlob.mockResolvedValue(true);
    await expect(purgeExpiredLiveReviewBlobs(new Date("2026-08-22T00:00:00.000Z"))).resolves.toBe(
      1,
    );
    expect(deleteWhere.value).toHaveLength(1);
  });
});

describe("getPreviousLiveReviewScreenshots revision binding", () => {
  it("queries the exact parent version + files revision, never an older repair JPEG", async () => {
    selectWhere.value = [];
    selectQueue.value = [
      [
        runRow({
          id: "lr_parent_r2",
          versionId: "v_parent",
          filesRevision: "rev_parent_2",
          desktopUrl: "https://blob.example/parent-r2.jpg",
        }),
      ],
    ];

    await expect(
      getPreviousLiveReviewScreenshots({
        chatId: "chat_1",
        versionId: "v_child",
        filesRevision: "rev_child",
        previousVersionId: "v_parent",
        previousFilesRevision: "rev_parent_2",
      }),
    ).resolves.toMatchObject({
      desktopUrl: "https://blob.example/parent-r2.jpg",
      hasStoredRun: true,
    });

    const where = renderSql(selectWhere.value[0]);
    expect(where.params).toEqual(
      expect.arrayContaining(["chat_1", "v_parent", "rev_parent_2", "completed"]),
    );
  });
});

describe("getLiveReviewRunForVersion revision binding", () => {
  it("recovers UI screenshots only from the current revision", async () => {
    selectWhere.value = [];
    selectQueue.value = [
      [
        runRow({
          id: "lr_r2",
          versionId: "v1",
          filesRevision: "rev_2",
          desktopUrl: "https://blob.example/r2.jpg",
        }),
      ],
    ];

    await expect(getLiveReviewRunForVersion("v1", "rev_2")).resolves.toMatchObject({
      id: "lr_r2",
      filesRevision: "rev_2",
    });
    const where = renderSql(selectWhere.value[0]);
    expect(where.params).toEqual(expect.arrayContaining(["v1", "rev_2"]));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectRows: [] as Array<Array<Record<string, unknown>>>,
  updateRows: [] as Array<Array<Record<string, unknown>>>,
  persistedSets: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/vercel/blob-service", () => ({ deleteBlob: vi.fn(async () => true) }));
vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [] }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.selectRows.shift() ?? [],
        }),
      }),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        state.persistedSets.push(value);
        return {
          where: () => ({
            returning: async () => state.updateRows.shift() ?? [],
          }),
        };
      },
    }),
  },
}));

import {
  claimLiveReviewRun,
  completeLiveReviewRun,
  waitForLiveReviewRun,
} from "./live-review-runs";
import type { LiveReviewResult } from "@/lib/gen/verify/live-review-types";

const jsonResult: LiveReviewResult = {
  status: "completed",
  decision: {
    verdict: "pass",
    confidence: 1,
    rationale: "ok",
    reasoning: "",
    issues: [],
  },
  durationMs: 1,
  modelId: "test",
  screenshots: {
    desktopUrl: "https://stale.example/desktop.jpg",
    mobileUrl: "https://stale.example/mobile.jpg",
  },
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "lr_1",
    chatId: "chat_1",
    versionId: "v1",
    filesRevision: "rev_a",
    userId: "user_1",
    status: "completed",
    skipReason: null,
    result: jsonResult,
    desktopUrl: "https://canonical.example/desktop.jpg",
    mobileUrl: null,
    desktopBlobPath: null,
    mobileBlobPath: null,
    modelAttempts: 1,
    claimedAt: new Date("2020-01-01T00:00:00.000Z"),
    completedAt: new Date("2020-01-01T00:01:00.000Z"),
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  state.selectRows = [];
  state.updateRows = [];
  state.persistedSets = [];
});

describe("live-review DB hydration", () => {
  it("hydratiserar cache och cost-cap från URL-kolumnerna", async () => {
    state.selectRows.push([row()]);
    const cached = await claimLiveReviewRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_a",
      userId: "user_1",
    });
    expect(cached?.kind).toBe("cached");
    expect(cached && "result" in cached ? cached.result : null).toMatchObject({
      screenshots: { desktopUrl: "https://canonical.example/desktop.jpg", mobileUrl: null },
    });

    state.selectRows.push([row({ modelAttempts: 2 })]);
    const capped = await claimLiveReviewRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_a",
      userId: "user_1",
    });
    expect(capped?.kind).toBe("cost_capped");
    expect(capped && "result" in capped ? capped.result : null).toMatchObject({
      screenshots: { desktopUrl: "https://canonical.example/desktop.jpg", mobileUrl: null },
    });
  });

  it("hydratiserar vinnaren efter en förlorad takeover-race", async () => {
    state.selectRows.push(
      [row({ status: "running", result: null, modelAttempts: 0 })],
      [row({ desktopUrl: "https://winner.example/desktop.jpg" })],
    );
    state.updateRows.push([]);

    const claimed = await claimLiveReviewRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_a",
      userId: "user_1",
    });

    expect(claimed?.kind).toBe("cached");
    expect(claimed && "result" in claimed ? claimed.result : null).toMatchObject({
      screenshots: { desktopUrl: "https://winner.example/desktop.jpg", mobileUrl: null },
    });
  });

  it("hydratiserar wait-resultatet utan ny betald körning", async () => {
    state.selectRows.push([row({ mobileUrl: "https://canonical.example/mobile.jpg" })]);

    await expect(
      waitForLiveReviewRun({ versionId: "v1", filesRevision: "rev_a", timeoutMs: 50 }),
    ).resolves.toMatchObject({
      screenshots: {
        desktopUrl: "https://canonical.example/desktop.jpg",
        mobileUrl: "https://canonical.example/mobile.jpg",
      },
    });
  });

  it("strippar transient screenshots ur result-JSON vid write", async () => {
    state.updateRows.push([{ id: "lr_1" }]);

    await expect(
      completeLiveReviewRun({
        id: "lr_1",
        result: jsonResult,
        screenshots: {
          desktopUrl: "https://canonical.example/desktop.jpg",
          mobileUrl: null,
        },
      }),
    ).resolves.toBe(true);

    expect(state.persistedSets[0]?.result).toEqual({
      status: "completed",
      decision: jsonResult.status === "completed" ? jsonResult.decision : null,
      durationMs: 1,
      modelId: "test",
    });
    expect(state.persistedSets[0]).toMatchObject({
      desktopUrl: "https://canonical.example/desktop.jpg",
      mobileUrl: null,
    });
  });
});

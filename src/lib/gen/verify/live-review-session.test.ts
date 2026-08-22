import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ dbConfigured: false, db: {} }));
vi.mock("@/lib/db/services/live-review-grants", () => ({
  readLiveReviewGrant: vi.fn(),
  writeLiveReviewGrant: vi.fn(),
}));
vi.mock("@/lib/db/services/live-review-runs", () => ({
  claimLiveReviewRun: vi.fn(),
  completeLiveReviewRun: vi.fn(),
  abandonLiveReviewRun: vi.fn(),
  beginPaidLiveReviewAttempt: vi.fn(),
  incrementLiveReviewModelAttempts: vi.fn(),
  deletePreviousLiveReviewBlobs: vi.fn(),
  deleteLiveReviewScreenshotUrls: vi.fn(),
  purgeExpiredLiveReviewBlobs: vi.fn(),
  waitForLiveReviewRun: vi.fn(),
}));
vi.mock("@/lib/config", () => ({ OPENCLAW: { editEnabled: true } }));

import { skippedLiveReviewResult } from "./live-review-claim";
import { beginLiveReviewSession, finishLiveReviewSession } from "./live-review-session";
import type { ClaimedLiveReview } from "@/lib/db/services/live-review-runs";
import type { LiveReviewResult } from "./live-review-types";

const GRANT = { powersOn: true, granted: ["live_review"] as const };

const completed: LiveReviewResult = {
  status: "completed",
  decision: {
    verdict: "pass",
    confidence: 0.9,
    rationale: "ok",
    reasoning: "",
    issues: [],
  },
  durationMs: 4,
  modelId: "gpt-4o",
};

function acquired(overrides: Partial<ClaimedLiveReview & { row: object }> = {}): ClaimedLiveReview {
  return {
    kind: "acquired",
    row: {
      id: "lr_1",
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_a",
      userId: "user_1",
      status: "running",
      skipReason: null,
      result: null,
      desktopUrl: null,
      mobileUrl: null,
      desktopBlobPath: null,
      mobileBlobPath: null,
      modelAttempts: 0,
      claimedAt: new Date(),
      completedAt: null,
      expiresAt: new Date(),
      ...((overrides as { row?: object }).row ?? {}),
    },
  };
}

describe("beginLiveReviewSession", () => {
  it("flagga av: ingen capture, ingen claim", async () => {
    const claimRun = vi.fn();
    const session = await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
        grant: GRANT,
      },
      { flagEnabled: false, editEnabled: true, claimRun },
    );
    expect(session.captureEnabled).toBe(false);
    expect(session.earlyResult).toEqual(skippedLiveReviewResult("flag_off"));
    expect(claimRun).not.toHaveBeenCalled();
  });

  it("grant av: ingen capture, ingen claim", async () => {
    const claimRun = vi.fn();
    const session = await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
        grant: null,
      },
      { flagEnabled: true, editEnabled: true, claimRun },
    );
    expect(session.earlyResult).toEqual(skippedLiveReviewResult("grant_off"));
    expect(claimRun).not.toHaveBeenCalled();
  });

  it("förfalskad grant i request räknas inte — bara persistad grant", async () => {
    const session = await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
        grant: null,
      },
      { flagEnabled: true, editEnabled: true, claimRun: vi.fn() },
    );
    expect(session.earlyResult).toEqual(skippedLiveReviewResult("grant_off"));
  });

  it("OC_EDIT av: edit_off även med persistad grant", async () => {
    const session = await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
        grant: GRANT,
      },
      { flagEnabled: true, editEnabled: false, claimRun: vi.fn() },
    );
    expect(session.earlyResult).toEqual(skippedLiveReviewResult("edit_off"));
  });

  it("saknad filesRevision är fail-closed", async () => {
    const claimRun = vi.fn();
    const session = await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "  ",
        userId: "user_1",
        grant: GRANT,
      },
      { flagEnabled: true, editEnabled: true, claimRun },
    );
    expect(session.earlyResult).toEqual(skippedLiveReviewResult("missing_revision"));
    expect(claimRun).not.toHaveBeenCalled();
  });

  it("cache och in-flight stänger av ny capture", async () => {
    const cached = await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
        grant: GRANT,
      },
      {
        flagEnabled: true,
        editEnabled: true,
        claimRun: async () => ({ kind: "cached", result: completed, row: acquired().row }),
      },
    );
    expect(cached.captureEnabled).toBe(false);
    expect(cached.earlyResult).toEqual(completed);

    const busy = await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
        grant: GRANT,
      },
      {
        flagEnabled: true,
        editEnabled: true,
        claimRun: async () => ({ kind: "in_flight", row: acquired().row }),
      },
    );
    expect(busy.captureEnabled).toBe(false);
    expect(busy.claim?.kind).toBe("in_flight");
  });

  it("ny filesRevision får en ny claim", async () => {
    const claimRun = vi.fn(async (input: { filesRevision: string }) => {
      expect(input.filesRevision).toBe("rev_b");
      return acquired();
    });
    const session = await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_b",
        userId: "user_1",
        grant: GRANT,
      },
      { flagEnabled: true, editEnabled: true, claimRun },
    );
    expect(session.captureEnabled).toBe(true);
    expect(claimRun).toHaveBeenCalledTimes(1);
  });

  it("claims/renews the current revision before starting TTL purge", async () => {
    const order: string[] = [];
    await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
        grant: GRANT,
      },
      {
        flagEnabled: true,
        editEnabled: true,
        claimRun: async () => {
          order.push("claim");
          return acquired();
        },
        purgeExpired: async () => {
          order.push("purge");
          return 0;
        },
      },
    );
    expect(order).toEqual(["claim", "purge"]);
  });
});

describe("finishLiveReviewSession", () => {
  it("in-flight väntar och startar inte ny review", async () => {
    const attachReview = vi.fn();
    const waitForRun = vi.fn(async () => completed);
    const result = await finishLiveReviewSession(
      {
        captureEnabled: false,
        claim: { kind: "in_flight", row: acquired().row },
        earlyResult: null,
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
      },
      {
        skipped: false,
        findings: [],
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
        domSummary: null,
        filesJson: "[]",
        userRequest: "x",
        briefSummary: "",
      },
      { attachReview, waitForRun },
    );
    expect(result).toEqual(completed);
    expect(attachReview).not.toHaveBeenCalled();
    expect(waitForRun).toHaveBeenCalled();
  });

  it("raderar föregående Blob efter lyckad review", async () => {
    const deletePreviousBlobs = vi.fn(async () => 1);
    const completeRun = vi.fn(async () => true);
    const beginPaidAttempt = vi.fn(async () => 1);
    const result = await finishLiveReviewSession(
      {
        captureEnabled: true,
        claim: acquired(),
        earlyResult: null,
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_b",
        userId: "user_1",
      },
      {
        skipped: false,
        findings: [],
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
        domSummary: null,
        filesJson: "[]",
        userRequest: "x",
        briefSummary: "",
      },
      {
        attachReview: async () => completed,
        completeRun,
        beginPaidAttempt,
        deletePreviousBlobs,
      },
    );
    expect(result.status).toBe("completed");
    expect(deletePreviousBlobs).toHaveBeenCalledWith({
      chatId: "chat_1",
      keepVersionId: "v1",
      keepFilesRevision: "rev_b",
      keepRunId: "lr_1",
      keepClaimedAt: expect.any(Date),
    });
    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "lr_1",
        claimedAt: expect.any(Date),
        filesRevision: "rev_a",
      }),
    );
  });

  it("raderar inte föregående par om complete misslyckas — överger claimen", async () => {
    const deletePreviousBlobs = vi.fn(async () => 1);
    const abandonRun = vi.fn(async () => {});
    const deleteScreenshotUrls = vi.fn(async () => {});
    const screenshots = { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null };
    const result = await finishLiveReviewSession(
      {
        captureEnabled: true,
        claim: acquired(),
        earlyResult: null,
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_b",
        userId: "user_1",
      },
      {
        skipped: false,
        findings: [],
        screenshots,
        domSummary: null,
        filesJson: "[]",
        userRequest: "x",
        briefSummary: "",
      },
      {
        attachReview: async () => completed,
        beginPaidAttempt: async () => 1,
        completeRun: async () => false,
        deletePreviousBlobs,
        abandonRun,
        deleteScreenshotUrls,
      },
    );
    expect(result.status).toBe("completed");
    expect(deletePreviousBlobs).not.toHaveBeenCalled();
    expect(abandonRun).toHaveBeenCalledWith("lr_1", expect.any(Date));
    expect(deleteScreenshotUrls).toHaveBeenCalled();
    expect(screenshots).toEqual({ desktopUrl: null, mobileUrl: null });
  });

  it("raderar redan uppladdade JPEG när claim överges", async () => {
    const deleteScreenshotUrls = vi.fn(async () => {});
    const abandonRun = vi.fn(async () => {});
    const screenshots = {
      desktopUrl: "https://blob.example/d.jpg",
      mobileUrl: "https://blob.example/m.jpg",
    };
    const result = await finishLiveReviewSession(
      {
        captureEnabled: true,
        claim: acquired(),
        earlyResult: null,
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_b",
        userId: "user_1",
      },
      {
        skipped: true,
        findings: [],
        screenshots,
        domSummary: null,
        filesJson: "[]",
        userRequest: "x",
        briefSummary: "",
      },
      {
        attachReview: async () => skippedLiveReviewResult("postcheck_skipped"),
        beginPaidAttempt: async () => 1,
        deleteScreenshotUrls,
        abandonRun,
      },
    );
    expect(result).toEqual(skippedLiveReviewResult("postcheck_skipped"));
    expect(deleteScreenshotUrls).toHaveBeenCalledWith(screenshots);
    expect(abandonRun).toHaveBeenCalledWith("lr_1", expect.any(Date));
    expect(screenshots).toEqual({ desktopUrl: null, mobileUrl: null });
  });

  it("startar inte critic om leasen redan tagits över", async () => {
    const attachReview = vi.fn();
    const waitForRun = vi.fn(async () => completed);
    const deleteScreenshotUrls = vi.fn(async () => {});
    const screenshots = { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null };
    const result = await finishLiveReviewSession(
      {
        captureEnabled: true,
        claim: acquired(),
        earlyResult: null,
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
      },
      {
        skipped: false,
        findings: [],
        screenshots,
        domSummary: null,
        filesJson: "[]",
        userRequest: "x",
        briefSummary: "",
      },
      {
        beginPaidAttempt: async () => null,
        attachReview,
        waitForRun,
        deleteScreenshotUrls,
      },
    );
    expect(result).toEqual(completed);
    expect(attachReview).not.toHaveBeenCalled();
    expect(waitForRun).toHaveBeenCalled();
    expect(deleteScreenshotUrls).toHaveBeenCalledWith(screenshots);
    expect(screenshots).toEqual({ desktopUrl: null, mobileUrl: null });
  });

  it("forwards the exact selected parent to the visual critic", async () => {
    const attachReview = vi.fn(async () => completed);
    await finishLiveReviewSession(
      {
        captureEnabled: true,
        claim: acquired(),
        earlyResult: null,
        chatId: "chat_1",
        versionId: "v3",
        filesRevision: "rev_c",
        userId: "user_1",
      },
      {
        skipped: false,
        findings: [],
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
        domSummary: null,
        versionNumber: 3,
        previousVersionId: "v1",
        filesJson: "[]",
        userRequest: "Redigera v1",
        briefSummary: "blå",
      },
      {
        attachReview,
        beginPaidAttempt: async () => 1,
        completeRun: async () => true,
        deletePreviousBlobs: async () => 0,
      },
    );

    expect(attachReview).toHaveBeenCalledWith(
      expect.objectContaining({ versionId: "v3", previousVersionId: "v1" }),
    );
  });
});

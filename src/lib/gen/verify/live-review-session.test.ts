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
type AcquiredLiveReview = Extract<ClaimedLiveReview, { kind: "acquired" }>;

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
  modelId: "gpt-5.6-terra",
};

function acquired(
  overrides: { row?: Partial<AcquiredLiveReview["row"]> } = {},
): AcquiredLiveReview {
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
      ...(overrides.row ?? {}),
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
    expect(session.allowed).toBe(false);
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
    expect(session.allowed).toBe(false);
    expect(session.earlyResult).toEqual(skippedLiveReviewResult("grant_off"));
    expect(claimRun).not.toHaveBeenCalled();
  });

  it("auto-grant startar review utan en persistad chattgrant", async () => {
    const claimRun = vi.fn(async () => acquired());
    const readGrant = vi.fn();
    const session = await beginLiveReviewSession(
      {
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_a",
        userId: "user_1",
      },
      {
        flagEnabled: true,
        editEnabled: true,
        autoGrantEnabled: true,
        readGrant,
        claimRun,
      },
    );
    expect(session.captureEnabled).toBe(true);
    expect(session.allowed).toBe(true);
    expect(session.claim?.kind).toBe("acquired");
    expect(readGrant).not.toHaveBeenCalled();
    expect(claimRun).toHaveBeenCalledTimes(1);
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
});

describe("finishLiveReviewSession", () => {
  it("cache och cost-cap returnerar hydrerat resultat utan capture eller critic", async () => {
    const hydrated: LiveReviewResult = {
      ...completed,
      screenshots: {
        desktopUrl: "https://blob.example/cached-desktop.jpg",
        mobileUrl: null,
      },
    };

    for (const kind of ["cached", "cost_capped"] as const) {
      const attachReview = vi.fn();
      const session = await beginLiveReviewSession(
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
          claimRun: async () => ({ kind, result: hydrated, row: acquired().row }),
        },
      );

      expect(session.captureEnabled).toBe(false);
      await expect(
        finishLiveReviewSession(
          session,
          {
            skipped: false,
            findings: [],
            screenshots: null,
            domSummary: null,
            filesJson: "[]",
            userRequest: "x",
            briefSummary: "",
          },
          { attachReview },
        ),
      ).resolves.toEqual(hydrated);
      expect(attachReview).not.toHaveBeenCalled();
    }
  });

  it("in-flight väntar och startar inte ny review", async () => {
    const attachReview = vi.fn();
    const waitForRun = vi.fn(async () => completed);
    const result = await finishLiveReviewSession(
      {
        captureEnabled: false,
        allowed: true,
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
        allowed: true,
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
    });
    expect(completeRun).toHaveBeenCalled();
  });

  it("låter inte en långsam critic för N committa eller radera N+1-blobs", async () => {
    let resolveCritic!: (result: LiveReviewResult) => void;
    const critic = new Promise<LiveReviewResult>((resolve) => {
      resolveCritic = resolve;
    });
    let targetCurrent = true;
    const attachReview = vi.fn(async () => critic);
    const completeRun = vi.fn(async () => true);
    const deletePreviousBlobs = vi.fn(async () => 1);
    const deleteScreenshotUrls = vi.fn(async () => {});
    const abandonRun = vi.fn(async () => {});
    const isTargetCurrent = vi.fn(async () => targetCurrent);
    const nScreenshots = {
      desktopUrl: "https://blob.example/n-desktop.jpg",
      mobileUrl: null,
    };

    const finishingN = finishLiveReviewSession(
      {
        captureEnabled: true,
        allowed: true,
        claim: acquired({ row: { filesRevision: "rev_n" } }),
        earlyResult: null,
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_n",
        userId: "user_1",
      },
      {
        skipped: false,
        findings: [],
        screenshots: nScreenshots,
        domSummary: null,
        filesJson: "[]",
        userRequest: "x",
        briefSummary: "",
        isTargetCurrent,
      },
      {
        attachReview,
        beginPaidAttempt: async () => 1,
        completeRun,
        deletePreviousBlobs,
        deleteScreenshotUrls,
        abandonRun,
      },
    );

    await vi.waitFor(() => expect(attachReview).toHaveBeenCalledTimes(1));
    // N+1 commits while N's critic is still running.
    targetCurrent = false;
    resolveCritic(completed);
    const result = await finishingN;

    expect(result).toEqual(skippedLiveReviewResult("preview_superseded"));
    expect(completeRun).not.toHaveBeenCalled();
    expect(deletePreviousBlobs).not.toHaveBeenCalled();
    expect(deleteScreenshotUrls).toHaveBeenCalledWith(nScreenshots);
    expect(deleteScreenshotUrls).not.toHaveBeenCalledWith(
      expect.objectContaining({ desktopUrl: "https://blob.example/n-plus-1.jpg" }),
    );
    expect(abandonRun).not.toHaveBeenCalled();
  });

  it("raderar inte N+1-blobs när målet supersedas direkt efter N:s complete", async () => {
    let targetCurrent = true;
    const deletePreviousBlobs = vi.fn(async () => 1);
    const isTargetCurrent = vi.fn(async () => targetCurrent);
    const completeRun = vi.fn(async () => {
      // Deterministisk modell av N+1 som blir aktivt precis efter att N:s rad
      // har slutförts men innan den supersederande blob-städningen börjar.
      targetCurrent = false;
      return true;
    });

    const result = await finishLiveReviewSession(
      {
        captureEnabled: true,
        allowed: true,
        claim: acquired({ row: { filesRevision: "rev_n" } }),
        earlyResult: null,
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_n",
        userId: "user_1",
      },
      {
        skipped: false,
        findings: [],
        screenshots: { desktopUrl: "https://blob.example/n.jpg", mobileUrl: null },
        domSummary: null,
        filesJson: "[]",
        userRequest: "x",
        briefSummary: "",
        isTargetCurrent,
      },
      {
        attachReview: async () => completed,
        beginPaidAttempt: async () => 1,
        completeRun,
        deletePreviousBlobs,
      },
    );

    expect(result).toEqual(skippedLiveReviewResult("preview_superseded"));
    expect(completeRun).toHaveBeenCalledTimes(1);
    expect(deletePreviousBlobs).not.toHaveBeenCalled();
  });

  it.each(["false", "throw"] as const)("bevarar reservationen när complete misslyckas med %s", async (failure) => {
    const deletePreviousBlobs = vi.fn(async () => 1);
    const abandonRun = vi.fn(async () => {});
    const deleteScreenshotUrls = vi.fn(async () => {});
    const result = await finishLiveReviewSession(
      {
        captureEnabled: true,
        allowed: true,
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
        beginPaidAttempt: async () => 1,
        completeRun: async () => {
          if (failure === "throw") throw new Error("offline persistence failure");
          return false;
        },
        deletePreviousBlobs,
        abandonRun,
        deleteScreenshotUrls,
      },
    );
    expect(result.status).toBe("completed");
    expect(deletePreviousBlobs).not.toHaveBeenCalled();
    expect(abandonRun).not.toHaveBeenCalled();
    expect(deleteScreenshotUrls).toHaveBeenCalled();
  });

  it("raderar egna JPEG men behåller reservationen även vid ett skipped-resultat", async () => {
    const deleteScreenshotUrls = vi.fn(async () => {});
    const abandonRun = vi.fn(async () => {});
    const screenshots = {
      desktopUrl: "https://blob.example/d.jpg",
      mobileUrl: "https://blob.example/m.jpg",
    };
    const result = await finishLiveReviewSession(
      {
        captureEnabled: true,
        allowed: true,
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
    expect(abandonRun).not.toHaveBeenCalled();
  });

  it("startar inte critic om leasen redan tagits över", async () => {
    const attachReview = vi.fn();
    const waitForRun = vi.fn(async () => completed);
    const deleteScreenshotUrls = vi.fn(async () => {});
    const screenshots = { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null };
    const result = await finishLiveReviewSession(
      {
        captureEnabled: true,
        allowed: true,
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
  });
});

describe("LiveReview reservation survives handler restart", () => {
  const input = {
    skipped: false, findings: [],
    screenshots: { desktopUrl: "https://blob.example/current.jpg", mobileUrl: null },
    domSummary: null, filesJson: "[]", userRequest: "x", briefSummary: "",
  };
  const session = (modelAttempts: number) => ({
    captureEnabled: true, allowed: true, claim: acquired({ row: { modelAttempts } }),
    earlyResult: null, chatId: "chat_1", versionId: "v1", filesRevision: "rev_a", userId: "user_1",
  });

  it("allows only the remaining slot after failed completion and then caps a restarted handler", async () => {
    let reserved = 0;
    const beginPaidAttempt = vi.fn(async () => reserved < 2 ? ++reserved : null);
    const attachReview = vi.fn(async () => completed);
    const completeRun = vi.fn(async () => false);
    // A destructive abandon would reproduce the bug by reopening all slots.
    const abandonRun = vi.fn(async () => { reserved = 0; });
    const deps = { beginPaidAttempt, attachReview, completeRun, abandonRun, deleteScreenshotUrls: vi.fn(async () => {}) };

    await finishLiveReviewSession(session(reserved), input, deps);
    expect(reserved).toBe(1);
    await finishLiveReviewSession(session(reserved), input, deps);
    expect(reserved).toBe(2);
    const capped = await finishLiveReviewSession(session(reserved), input, deps);
    expect(capped).toEqual(skippedLiveReviewResult("cost_capped"));
    expect(attachReview).toHaveBeenCalledTimes(2);
    expect(beginPaidAttempt).toHaveBeenCalledTimes(2);
    expect(abandonRun).not.toHaveBeenCalled();
  });

  it.each([0, 1])("abandons a superseded pre-call claim only when its prior reserved count is zero (%s)", async (reserved) => {
    const abandonRun = vi.fn(async () => {});
    const beginPaidAttempt = vi.fn();
    const attachReview = vi.fn();
    const deleteScreenshotUrls = vi.fn(async () => {});
    const result = await finishLiveReviewSession(session(reserved), { ...input, isTargetCurrent: async () => false }, {
      abandonRun, beginPaidAttempt, attachReview, deleteScreenshotUrls,
    });
    expect(result).toEqual(skippedLiveReviewResult("preview_superseded"));
    expect(abandonRun).toHaveBeenCalledTimes(reserved === 0 ? 1 : 0);
    expect(deleteScreenshotUrls).toHaveBeenCalledWith(input.screenshots);
    expect(beginPaidAttempt).not.toHaveBeenCalled();
    expect(attachReview).not.toHaveBeenCalled();
  });

  it("does not start a critic after a thrown reservation failure", async () => {
    const attachReview = vi.fn();
    const abandonRun = vi.fn();
    await expect(finishLiveReviewSession(session(0), input, {
      beginPaidAttempt: vi.fn(async () => { throw new Error("reservation unavailable"); }),
      attachReview, abandonRun,
    })).rejects.toThrow("reservation unavailable");
    expect(attachReview).not.toHaveBeenCalled();
    expect(abandonRun).not.toHaveBeenCalled();
  });
});

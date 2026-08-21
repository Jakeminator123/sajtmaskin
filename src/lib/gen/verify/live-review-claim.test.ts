import { describe, expect, it } from "vitest";
import {
  LIVE_REVIEW_CLAIM_LEASE_MS,
  LIVE_REVIEW_MAX_MODEL_ATTEMPTS,
  decideLiveReviewClaim,
  liveReviewExpiresAt,
  skippedLiveReviewResult,
  type LiveReviewRunRow,
} from "./live-review-claim";

function row(overrides: Partial<LiveReviewRunRow> = {}): LiveReviewRunRow {
  return {
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
    claimedAt: new Date("2026-08-21T00:00:00.000Z"),
    completedAt: null,
    expiresAt: liveReviewExpiresAt(new Date("2026-08-21T00:00:00.000Z")),
    ...overrides,
  };
}

const completed = skippedLiveReviewResult("no_screenshots");

describe("decideLiveReviewClaim", () => {
  it("återanvänder completed och skipped", () => {
    expect(
      decideLiveReviewClaim(
        row({
          status: "completed",
          result: {
            status: "completed",
            decision: {
              verdict: "pass",
              confidence: 1,
              rationale: "ok",
              reasoning: "",
              issues: [],
            },
            durationMs: 1,
            modelId: "gpt-4o",
          },
        }),
      ).kind,
    ).toBe("cached");
    expect(
      decideLiveReviewClaim(row({ status: "skipped", result: completed })).kind,
    ).toBe("cached");
  });

  it("låter simultan körning vänta, stale lease tas över", () => {
    const now = new Date("2026-08-21T00:02:00.000Z");
    expect(decideLiveReviewClaim(row(), now)).toEqual({ kind: "in_flight" });
    expect(
      decideLiveReviewClaim(
        row({
          claimedAt: new Date(now.getTime() - LIVE_REVIEW_CLAIM_LEASE_MS),
        }),
        now,
      ),
    ).toEqual({ kind: "takeover" });
  });

  it("stoppar fler betalda försök när taket är nått", () => {
    expect(
      decideLiveReviewClaim(
        row({
          status: "skipped",
          modelAttempts: LIVE_REVIEW_MAX_MODEL_ATTEMPTS,
          result: skippedLiveReviewResult("review_error"),
        }),
      ),
    ).toEqual({
      kind: "cost_capped",
      result: skippedLiveReviewResult("review_error"),
    });
  });
});

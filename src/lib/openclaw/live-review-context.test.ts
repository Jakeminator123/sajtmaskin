import { describe, expect, it } from "vitest";
import { liveReviewExpiresAt } from "@/lib/gen/verify/live-review-claim";
import { formatOpenClawLiveReviewBlock } from "./live-review-context";

describe("formatOpenClawLiveReviewBlock", () => {
  it("gör completed-resultatet läsbart för Sajtagenten", () => {
    const block = formatOpenClawLiveReviewBlock({
      id: "lr_1",
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_a",
      userId: "user_1",
      status: "completed",
      skipReason: null,
      result: {
        status: "completed",
        decision: {
          verdict: "micro_fix",
          confidence: 0.7,
          rationale: "Hero är för ljus.",
          reasoning: "",
          issues: [
            {
              severity: "high",
              evidence: "Desktop-skärmbilden är vit.",
              target: "app/page.tsx",
            },
          ],
        },
        durationMs: 9,
        modelId: "gpt-4o",
      },
      desktopUrl: "https://blob.example/d.jpg",
      mobileUrl: null,
      desktopBlobPath: null,
      mobileBlobPath: null,
      modelAttempts: 1,
      claimedAt: new Date(),
      completedAt: new Date(),
      expiresAt: liveReviewExpiresAt(),
    });
    expect(block).toContain("[LIVE-REVIEW]");
    expect(block).toContain("verdict: micro_fix");
    expect(block).toContain("Hero är för ljus.");
    expect(block).toContain("app/page.tsx");
    expect(block).toContain("https://blob.example/d.jpg");
  });

  it("tar med skip-orsak så agenten inte låtsas att en review körts", () => {
    const block = formatOpenClawLiveReviewBlock({
      id: "lr_2",
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_a",
      userId: "user_1",
      status: "skipped",
      skipReason: "grant_off",
      result: { status: "skipped", reason: "grant_off" },
      desktopUrl: null,
      mobileUrl: null,
      desktopBlobPath: null,
      mobileBlobPath: null,
      modelAttempts: 0,
      claimedAt: new Date(),
      completedAt: new Date(),
      expiresAt: liveReviewExpiresAt(),
    });
    expect(block).toContain("reason: grant_off");
    expect(block).not.toContain("verdict:");
  });

  it("är null utan resultat", () => {
    expect(formatOpenClawLiveReviewBlock(null)).toBeNull();
  });
});

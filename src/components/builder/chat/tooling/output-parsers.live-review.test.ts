import { describe, expect, it } from "vitest";
import {
  clearPersistedMessages,
  loadPersistedMessages,
  persistMessages,
} from "@/lib/builder/messages-storage";
import {
  extractToolSummaries,
  getLiveReviewResult,
  parseLiveReviewScreenshots,
} from "./output-parsers";

const DESKTOP = "https://abc.public.blob.vercel-storage.com/live-review-desktop-rev.jpg";
const MOBILE = "https://abc.public.blob.vercel-storage.com/live-review-mobile-rev.jpg";

const completedDecision = {
  verdict: "pass" as const,
  confidence: 0.9,
  rationale: "Sajten följer briefen.",
  reasoning: "",
  issues: [],
};

describe("parseLiveReviewScreenshots", () => {
  it("behåller bara http(s)-URL:er för aktuella viewports", () => {
    expect(
      parseLiveReviewScreenshots({
        desktopUrl: DESKTOP,
        mobileUrl: MOBILE,
        previousDesktopUrl: "https://abc.public.blob.vercel-storage.com/old.jpg",
      }),
    ).toEqual({ desktopUrl: DESKTOP, mobileUrl: MOBILE });
    expect(parseLiveReviewScreenshots({ desktopUrl: "javascript:alert(1)", mobileUrl: null })).toBeNull();
    expect(parseLiveReviewScreenshots({ desktopUrl: "/local.jpg", mobileUrl: null })).toBeNull();
  });
});

describe("getLiveReviewResult screenshots", () => {
  it("läser screenshots från den dedikerade tool-live-review-payloaden", () => {
    const result = getLiveReviewResult({
      status: "completed",
      decision: completedDecision,
      durationMs: 12,
      modelId: "test",
      screenshots: { desktopUrl: DESKTOP, mobileUrl: MOBILE },
    });
    expect(result).toMatchObject({
      status: "completed",
      screenshots: { desktopUrl: DESKTOP, mobileUrl: MOBILE },
    });
  });

  it("faller tillbaka till productPostcheck.screenshots när den dedikerade delen saknar dem", () => {
    const result = getLiveReviewResult({
      productPostcheck: {
        screenshots: { desktopUrl: DESKTOP, mobileUrl: null },
        liveReview: {
          status: "completed",
          decision: completedDecision,
          durationMs: 8,
          modelId: "test",
        },
      },
    });
    expect(result?.status).toBe("completed");
    expect(result && result.status === "completed" ? result.screenshots : null).toEqual({
      desktopUrl: DESKTOP,
      mobileUrl: null,
    });
  });

  it("lägger inte screenshots på en skippad review", () => {
    expect(
      getLiveReviewResult({
        status: "skipped",
        reason: "flag_off",
        screenshots: { desktopUrl: DESKTOP, mobileUrl: MOBILE },
      }),
    ).toEqual({ status: "skipped", reason: "flag_off" });
  });
});

describe("extractToolSummaries live-review", () => {
  it("surfar bara verdikten från tool-live-review, inte från tool-post-check", () => {
    const payload = {
      productPostcheck: {
        screenshots: { desktopUrl: DESKTOP, mobileUrl: MOBILE },
        liveReview: {
          status: "completed",
          decision: completedDecision,
          durationMs: 8,
          modelId: "test",
        },
      },
    };
    expect(extractToolSummaries("tool-post-check", payload).liveReview).toBeNull();
    expect(extractToolSummaries("tool-live-review", payload).liveReview?.status).toBe("completed");
  });
});

describe("live-review persist/reload", () => {
  it("behåller screenshots på tool-live-review efter localStorage-omladdning", () => {
    const chatId = "chat_live_review_thumbs";
    clearPersistedMessages(chatId);
    persistMessages(chatId, [
      {
        id: "assistant_1",
        role: "assistant",
        content: "Klar.",
        uiParts: [
          {
            type: "tool:live-review",
            toolName: "Live-granskning",
            state: "output-available",
            output: {
              status: "completed",
              decision: completedDecision,
              durationMs: 12,
              modelId: "test",
              screenshots: { desktopUrl: DESKTOP, mobileUrl: MOBILE },
            },
          },
        ],
      },
    ]);

    const restored = loadPersistedMessages(chatId);
    const parsed = getLiveReviewResult(restored[0]?.uiParts?.[0]?.output);
    expect(parsed).toMatchObject({
      status: "completed",
      screenshots: { desktopUrl: DESKTOP, mobileUrl: MOBILE },
    });
    clearPersistedMessages(chatId);
  });
});

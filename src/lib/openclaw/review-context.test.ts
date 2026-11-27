import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ dbConfigured: true }));
vi.mock("@/lib/db/services/live-review-runs", () => ({
  getLiveReviewRunForVersion: vi.fn(async () => null),
}));
vi.mock("@/lib/db/services/version-errors", () => ({
  getLatestEngineVersionErrorLogs: vi.fn(async () => [
    {
      level: "error",
      category: "preflight:quality-gate",
      message: "Server verify failed.",
      meta: {
        checks: [{ check: "typecheck", passed: false }],
        errorManifest: [
          {
            file: "app/page.tsx",
            diagnostics: [{ source: "tsc", line: 12, message: "TS2322" }],
          },
        ],
        verifyLaneDurationMs: 4200,
      },
      created_at: new Date("2026-06-28T01:00:00.000Z"),
    },
  ]),
}));

import { buildOpenClawReviewContext } from "./review-context";
import { getLiveReviewRunForVersion } from "@/lib/db/services/live-review-runs";
import type { LiveReviewRunRow } from "@/lib/gen/verify/live-review-claim";

function savedReview(changes: Partial<LiveReviewRunRow> = {}): LiveReviewRunRow {
  return {
    id: "review-own",
    chatId: "chat-own", versionId: "v1", filesRevision: "revision-current", userId: "owner",
    status: "skipped", skipReason: "no_screenshots", result: { status: "skipped", reason: "no_screenshots" },
    desktopUrl: null, mobileUrl: null, desktopBlobPath: null, mobileBlobPath: null,
    modelAttempts: 0, claimedAt: new Date(), completedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    ...changes,
  };
}

describe("buildOpenClawReviewContext", () => {
  it("attaches the current owned revision's persisted review", async () => {
    vi.mocked(getLiveReviewRunForVersion).mockResolvedValueOnce(savedReview());
    const ctx = await buildOpenClawReviewContext({ versionId: "v1", chatId: "chat-own", filesRevision: "revision-current" });
    expect(ctx.liveReview).toContain("no_screenshots");
  });

  it.each([
    { filesRevision: "revision-old" },
    { chatId: "chat-other" },
    { versionId: "version-other" },
    { expiresAt: new Date(0) },
  ])("omits unrelated or expired reviews while retaining version diagnostics ($filesRevision $chatId $versionId)", async (changes) => {
    vi.mocked(getLiveReviewRunForVersion).mockResolvedValueOnce(savedReview(changes));
    const ctx = await buildOpenClawReviewContext({ versionId: "v1", chatId: "chat-own", filesRevision: "revision-current" });
    expect(ctx.liveReview).toBeNull();
    expect(ctx.findings).toContain("app/page.tsx");
    expect(ctx.timeline).toContain("[TIDSLINJE]");
  });

  it("returns both findings and timeline from a single read", async () => {
    const ctx = await buildOpenClawReviewContext({ versionId: "v1" });
    expect(ctx.findings).toContain("[BUGGFYND]");
    expect(ctx.findings).toContain("app/page.tsx");
    expect(ctx.timeline).toContain("[TIDSLINJE]");
  });

  it("returns nulls when no versionId is given", async () => {
    const ctx = await buildOpenClawReviewContext({ versionId: "" });
    expect(ctx).toEqual({ findings: null, timeline: null, liveReview: null });
  });
});

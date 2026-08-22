import { beforeEach, describe, it, expect, vi } from "vitest";

const getLiveReviewRunForVersion = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/lib/db/client", () => ({ dbConfigured: true }));
vi.mock("@/lib/db/services/live-review-runs", () => ({
  getLiveReviewRunForVersion,
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

describe("buildOpenClawReviewContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns both findings and timeline from a single read", async () => {
    const ctx = await buildOpenClawReviewContext({
      versionId: "v1",
      filesRevision: "rev-2",
    });
    expect(ctx.findings).toContain("[BUGGFYND]");
    expect(ctx.findings).toContain("app/page.tsx");
    expect(ctx.timeline).toContain("[TIDSLINJE]");
    expect(getLiveReviewRunForVersion).toHaveBeenCalledWith("v1", "rev-2");
  });

  it("does not surface a stale live review when the current revision is unknown", async () => {
    const ctx = await buildOpenClawReviewContext({ versionId: "v1", filesRevision: null });

    expect(ctx.liveReview).toBeNull();
    expect(getLiveReviewRunForVersion).not.toHaveBeenCalled();
  });

  it("returns nulls when no versionId is given", async () => {
    const ctx = await buildOpenClawReviewContext({ versionId: "" });
    expect(ctx).toEqual({ findings: null, timeline: null, liveReview: null });
  });
});

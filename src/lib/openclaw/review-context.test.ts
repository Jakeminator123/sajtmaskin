import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ dbConfigured: true }));
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
  it("returns both findings and timeline from a single read", async () => {
    const ctx = await buildOpenClawReviewContext({ versionId: "v1" });
    expect(ctx.findings).toContain("[BUGGFYND]");
    expect(ctx.findings).toContain("app/page.tsx");
    expect(ctx.timeline).toContain("[TIDSLINJE]");
  });

  it("returns nulls when no versionId is given", async () => {
    const ctx = await buildOpenClawReviewContext({ versionId: "" });
    expect(ctx).toEqual({ findings: null, timeline: null });
  });
});

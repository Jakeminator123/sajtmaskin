import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ dbConfigured: false }));

import {
  formatOpenClawTimelineBlock,
  type OpenClawTimelineRow,
} from "./timeline-context";

describe("formatOpenClawTimelineBlock", () => {
  it("returns null with no lifecycle-relevant rows", () => {
    const rows: OpenClawTimelineRow[] = [
      { createdAt: new Date(), level: "info", category: "unrelated", message: "x", meta: null },
    ];
    expect(formatOpenClawTimelineBlock(rows)).toBeNull();
  });

  it("orders events by time and renders relative offsets + window", () => {
    const base = Date.parse("2026-06-28T01:00:00.000Z");
    const rows: OpenClawTimelineRow[] = [
      {
        createdAt: new Date(base + 10_000),
        level: "warning",
        category: "server-repair",
        message: "Server repair incomplete.",
        meta: { method: "llm", llmPasses: 2, repaired: false, earlyStopReason: "no_improvement" },
      },
      {
        createdAt: new Date(base),
        level: "error",
        category: "preflight:quality-gate",
        message: "Server verify failed.",
        meta: { firstFailureCheck: "typecheck", verifyLaneDurationMs: 4200 },
      },
    ];
    const block = formatOpenClawTimelineBlock(rows)!;
    expect(block).toContain("[TIDSLINJE]");
    expect(block).toContain("Tidsfönster: ~10s");
    // first (offset +0s) must be the quality-gate row, then +10s repair row
    const gateIdx = block.indexOf("Server verify failed.");
    const repairIdx = block.indexOf("Server repair incomplete.");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(repairIdx).toBeGreaterThan(gateIdx);
    expect(block).toContain("+0s");
    expect(block).toContain("+10s");
    expect(block).toContain("pass=2");
    expect(block).toContain("förstafel=typecheck");
    expect(block).toContain("[/TIDSLINJE]");
  });

  it("flags a concurrent edit (stale-base / supersede)", () => {
    const rows: OpenClawTimelineRow[] = [
      {
        createdAt: "2026-06-28T01:00:00.000Z",
        level: "warning",
        category: "server-verify:stale-base-skip",
        message: "files_json advanced (concurrent edit); re-verifying the current files.",
        meta: null,
      },
    ];
    const block = formatOpenClawTimelineBlock(rows)!;
    expect(block).toContain("samtidig redigering");
  });
});

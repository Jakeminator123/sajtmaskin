import { describe, expect, it } from "vitest";

import { checkHistoricalPlanStatuses, extractPlanStatus } from "./check-history-status.mjs";

describe("historical plan status checks", () => {
  it("reads frontmatter and prose status headers case-insensitively", () => {
    expect(extractPlanStatus("---\nstatus: archived\n---\n# Plan")).toBe("archived");
    expect(extractPlanStatus('---\nstatus: "ready" # stale\n---')).toBe("ready");
    expect(extractPlanStatus("# Plan\n\n**Status:** In-progress")).toBe("in-progress");
    expect(extractPlanStatus("# Plan\n\nStatus: Done (merged)")).toBe("done (merged)");
  });

  it("rejects active-looking statuses from historical locations", async () => {
    const files = new Map([
      ["docs/plans/archived/active.md", "---\nstatus: active\n---"],
      ["docs/plans/archived/paused.md", "---\nstatus: paused\n---"],
      ["docs/plans/avklarat/ready.md", "---\nstatus: ready\n---"],
      ["docs/plans/avklarat/done.md", "Status: Done (merged)"],
    ]);

    const failures = await checkHistoricalPlanStatuses({
      trackedPaths: [...files.keys()],
      readTrackedFile: async (path: string) => files.get(path) ?? "",
    });

    expect(failures).toEqual([
      {
        path: "docs/plans/archived/active.md",
        status: "active",
        expectedLocation: "docs/plans/archived/",
      },
      {
        path: "docs/plans/avklarat/ready.md",
        status: "ready",
        expectedLocation: "docs/plans/avklarat/",
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";

import {
  checkArchivedPlanHeaders,
  checkHistoricalPlanStatuses,
  extractPlanStatus,
} from "./check-history-status.mjs";

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

  it("requires complete archive guidance before the first heading", async () => {
    const completeHeader = [
      "---",
      "status: archived",
      "---",
      "> Status: Archived",
      "> Not current architecture.",
      "> Do not use as runtime guidance.",
      "> Replaced by: [Current contract](../../contracts/example.md)",
    ].join("\n");
    const files = new Map([
      ["docs/plans/archived/complete.md", `${completeHeader}\n\n# Plan`],
      [
        "docs/plans/archived/late-example.md",
        `---\nstatus: archived\n---\n# Plan\n\n${completeHeader}`,
      ],
      [
        "docs/plans/archived/missing-replacement.md",
        "---\nstatus: archived\n---\n> Status: Archived\n> Not current architecture.\n> Do not use as runtime guidance.\n\n# Plan",
      ],
      ["docs/plans/avklarat/no-archive-header-needed.md", "---\nstatus: done\n---\n# Plan"],
    ]);

    const failures = await checkArchivedPlanHeaders({
      trackedPaths: [...files.keys()],
      readTrackedFile: async (path: string) => files.get(path) ?? "",
    });

    expect(failures).toEqual([
      {
        path: "docs/plans/archived/late-example.md",
        missingMarkers: [
          "Status: Archived",
          "Not current architecture",
          "Do not use as runtime guidance",
          "Replaced by",
        ],
      },
      {
        path: "docs/plans/archived/missing-replacement.md",
        missingMarkers: ["Replaced by"],
      },
    ]);
  });
});

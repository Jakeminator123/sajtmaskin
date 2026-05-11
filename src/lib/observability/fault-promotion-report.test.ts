import { describe, expect, it } from "vitest";

import type { FaultEvent } from "./fault-events";
import {
  buildFaultPromotionCandidates,
  formatFaultPromotionReport,
} from "./fault-promotion-report";

describe("fault promotion report", () => {
  it("groups repeated faults and recommends a promotion lane", () => {
    const events: FaultEvent[] = [
      {
        faultType: "missing-import",
        phase: "preflight",
        severity: "blocking",
        message: "Cannot find module",
        filePath: "app/page.tsx",
        scaffoldId: "landing-page",
        success: true,
      },
      {
        faultType: "missing-import",
        phase: "preflight",
        severity: "blocking",
        message: "Cannot find module",
        filePath: "components/hero.tsx",
        scaffoldId: "landing-page",
        success: false,
      },
    ];

    const [candidate] = buildFaultPromotionCandidates(events);
    expect(candidate).toMatchObject({
      faultType: "missing-import",
      count: 2,
      successRate: 0.5,
      recommendedPromotion: "mechanical-fixer-or-core-rule",
    });
    expect(candidate?.topScaffolds).toEqual(["landing-page (2)"]);
  });

  it("prints a no-data report", () => {
    expect(formatFaultPromotionReport([])).toContain("No promotion candidates found");
  });
});

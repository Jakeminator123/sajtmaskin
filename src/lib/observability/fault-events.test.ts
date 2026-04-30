import { describe, expect, it } from "vitest";

import {
  faultEventFromErrorLogEvent,
  faultEventFromFixEntry,
  faultEventFromRecurringPattern,
  faultEventFromVerifierFinding,
} from "./fault-events";

describe("fault event adapters", () => {
  it("adapts mechanical FixEntry rows", () => {
    const event = faultEventFromFixEntry({
      fixer: "react-import-fixer",
      category: "mechanical",
      lane: "mechanical",
      description: "Added missing React import",
      file: "app/page.tsx",
      line: 1,
    });

    expect(event).toMatchObject({
      faultType: "react-import-fixer",
      phase: "autofix",
      severity: "info",
      filePath: "app/page.tsx",
      fixerId: "react-import-fixer",
      repairLane: "mechanical",
      success: true,
    });
  });

  it("adapts error-log RAG events", () => {
    const event = faultEventFromErrorLogEvent({
      phase: "post-gen",
      subphase: "preflight",
      creator: "deterministic",
      fixer: "import-validator",
      severity: "error",
      fault: "missing-import",
      faultText: "Cannot find module '@/components/foo'",
      result: "fixed",
      scaffoldId: "landing-page",
    });

    expect(event).toMatchObject({
      faultType: "missing-import",
      phase: "preflight",
      severity: "blocking",
      scaffoldId: "landing-page",
      success: true,
    });
    expect(event.normalizedPattern).toContain("<path>");
  });

  it("adapts verifier findings", () => {
    const event = faultEventFromVerifierFinding({
      id: "a11y-duplicate-id",
      severity: "warning",
      detail: "Duplicate input id",
      filePath: "components/form.tsx",
    });

    expect(event).toMatchObject({
      faultType: "a11y-duplicate-id",
      phase: "verifier",
      severity: "warning",
      filePath: "components/form.tsx",
      success: false,
    });
  });

  it("adapts recurring patterns", () => {
    const event = faultEventFromRecurringPattern({
      pattern: "missing-import",
      occurrences: 3,
      files: [{ file: "app/page.tsx", count: 2 }],
      latestTs: "2026-04-30T10:00:00.000Z",
      example: "Cannot find module",
    });

    expect(event).toMatchObject({
      faultType: "missing-import",
      phase: "repair",
      severity: "warning",
      filePath: "app/page.tsx",
      success: null,
    });
  });
});

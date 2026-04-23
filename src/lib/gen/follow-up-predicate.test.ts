import { describe, expect, it } from "vitest";

import { deriveFollowUpStateFromInputs } from "./follow-up-predicate";

describe("deriveFollowUpStateFromInputs (OMTAG Fas 2·A / E2)", () => {
  it("treats no scaffold + no files as init run", () => {
    const result = deriveFollowUpStateFromInputs({
      persistedScaffoldId: null,
      previousFilesCount: 0,
    });
    expect(result).toEqual({
      hasMergeablePrevious: false,
      isOrchestrationFollowUp: false,
    });
  });

  it("treats persisted scaffold + 0 files as init run (P26 edge case)", () => {
    // Before E2 this was the asymmetric case: orchestrate thought "followUp"
    // because persistedScaffoldId was set, merge thought "init" because no
    // files. Both predicates must now agree on init.
    const result = deriveFollowUpStateFromInputs({
      persistedScaffoldId: "landing-page",
      previousFilesCount: 0,
    });
    expect(result.hasMergeablePrevious).toBe(false);
    expect(result.isOrchestrationFollowUp).toBe(false);
  });

  it("treats any previousFiles > 0 as follow-up regardless of scaffold id", () => {
    const withScaffold = deriveFollowUpStateFromInputs({
      persistedScaffoldId: "landing-page",
      previousFilesCount: 7,
    });
    const withoutScaffold = deriveFollowUpStateFromInputs({
      persistedScaffoldId: null,
      previousFilesCount: 3,
    });
    expect(withScaffold.hasMergeablePrevious).toBe(true);
    expect(withScaffold.isOrchestrationFollowUp).toBe(true);
    expect(withoutScaffold.hasMergeablePrevious).toBe(true);
    expect(withoutScaffold.isOrchestrationFollowUp).toBe(true);
  });

  it("accepts undefined scaffold id", () => {
    const result = deriveFollowUpStateFromInputs({
      persistedScaffoldId: undefined,
      previousFilesCount: 2,
    });
    expect(result).toEqual({
      hasMergeablePrevious: true,
      isOrchestrationFollowUp: true,
    });
  });

  it("clamps negative / NaN / fractional file counts safely", () => {
    expect(
      deriveFollowUpStateFromInputs({
        persistedScaffoldId: null,
        previousFilesCount: -5,
      }).isOrchestrationFollowUp,
    ).toBe(false);
    expect(
      deriveFollowUpStateFromInputs({
        persistedScaffoldId: null,
        previousFilesCount: Number.NaN,
      }).isOrchestrationFollowUp,
    ).toBe(false);
    expect(
      deriveFollowUpStateFromInputs({
        persistedScaffoldId: null,
        previousFilesCount: 2.9,
      }).isOrchestrationFollowUp,
    ).toBe(true);
  });

  it("both predicates agree today (kept separate for future divergence)", () => {
    for (const count of [0, 1, 5, 20]) {
      const { hasMergeablePrevious, isOrchestrationFollowUp } = deriveFollowUpStateFromInputs(
        {
          persistedScaffoldId: null,
          previousFilesCount: count,
        },
      );
      expect(hasMergeablePrevious).toBe(isOrchestrationFollowUp);
    }
  });
});

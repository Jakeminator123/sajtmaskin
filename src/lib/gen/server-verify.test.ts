import { describe, expect, it } from "vitest";
import { resolveServerRepairEarlyStopReason } from "./server-repair-policy";

describe("resolveServerRepairEarlyStopReason", () => {
  it("stops when the fixer produced no output", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: false,
        errorsBefore: 3,
        errorsAfter: 3,
      }),
    ).toBe("fixer_noop");
  });

  it("stops when error count does not improve", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: true,
        errorsBefore: 2,
        errorsAfter: 2,
      }),
    ).toBe("no_improvement");
  });

  it("continues when error count improves", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: true,
        errorsBefore: 3,
        errorsAfter: 1,
      }),
    ).toBe("continue");
  });
});

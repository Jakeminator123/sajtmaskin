import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  warnLog: vi.fn(),
}));

import { finalizeStreamStats, initStreamStats } from "./helpers";

describe("finalizeStreamStats", () => {
  it("does not mark recovered error events as critical anomalies", () => {
    const stats = initStreamStats("send", "assistant_1");
    stats.didReceiveDone = true;
    stats.errorEvents = 1;
    stats.contentEvents = 1;
    stats.contentChars = 24;
    stats.finalContentLength = 24;

    const signal = finalizeStreamStats(stats);

    expect(signal).toEqual({
      hasCriticalAnomaly: false,
      reasons: ["error_event_recovered"],
    });
  });

  it("marks error events without done as critical anomalies", () => {
    const stats = initStreamStats("send", "assistant_1");
    stats.errorEvents = 1;

    const signal = finalizeStreamStats(stats);

    expect(signal.hasCriticalAnomaly).toBe(true);
    expect(signal.reasons).toEqual(["done_event_missing", "error_event_received"]);
  });
});

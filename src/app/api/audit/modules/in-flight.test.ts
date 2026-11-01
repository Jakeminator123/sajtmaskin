import { afterEach, describe, expect, it } from "vitest";
import { cleanupStaleInFlightAudits, inFlightAudits } from "./in-flight";

const TEN_MINUTES_MS = 10 * 60 * 1_000;

afterEach(() => {
  inFlightAudits.clear();
});

describe("cleanupStaleInFlightAudits", () => {
  it("removes only entries older than the safety window", () => {
    const now = 2_000_000;
    inFlightAudits.set("stale", {
      startTime: now - TEN_MINUTES_MS - 1,
    });
    inFlightAudits.set("boundary", {
      startTime: now - TEN_MINUTES_MS,
    });
    inFlightAudits.set("fresh", {
      startTime: now - 1_000,
    });

    cleanupStaleInFlightAudits(now);

    expect([...inFlightAudits.keys()]).toEqual(["boundary", "fresh"]);
  });
});

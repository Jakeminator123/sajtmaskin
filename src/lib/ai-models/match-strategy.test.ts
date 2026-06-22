import { describe, expect, it } from "vitest";
import {
  getMatchStrategy,
  MATCH_POINTS,
  type MatchStrategy,
} from "@/lib/ai-models/load-manifest";

/**
 * Backoffice 2.0 fas 6 — config-level no-op proof.
 *
 * The matchStrategy switch must default every matching point to the method
 * used today. These assertions read the REAL manifest (no mocks) so a future
 * edit that flips a default to "small-llm" without intent will fail here.
 */
describe("getMatchStrategy (manifest matching block)", () => {
  it("defaults every matching point to its current method", () => {
    const expected: Record<(typeof MATCH_POINTS)[number], MatchStrategy> = {
      followUpIntent: "keyword",
      capabilityDetection: "keyword",
      scaffoldSelection: "embedding",
      variantSelection: "embedding",
      domainInference: "keyword",
    };
    for (const point of MATCH_POINTS) {
      expect(getMatchStrategy(point)).toBe(expected[point]);
    }
  });

  it("never silently enables small-llm for any point by default", () => {
    for (const point of MATCH_POINTS) {
      expect(getMatchStrategy(point)).not.toBe("small-llm");
    }
  });
});

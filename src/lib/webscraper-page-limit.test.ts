import { describe, expect, it } from "vitest";
import { resolveScrapePageLimit } from "@/lib/webscraper";

describe("resolveScrapePageLimit", () => {
  it("defaults to the historical 4-page ceiling", () => {
    expect(resolveScrapePageLimit()).toBe(4);
    expect(resolveScrapePageLimit(undefined)).toBe(4);
  });

  it("accepts the paid Vanlig cap of 2", () => {
    expect(resolveScrapePageLimit(2)).toBe(2);
  });

  it("clamps invalid or oversized values to 1–4", () => {
    expect(resolveScrapePageLimit(0)).toBe(1);
    expect(resolveScrapePageLimit(99)).toBe(4);
    expect(resolveScrapePageLimit(1.8)).toBe(1);
  });
});

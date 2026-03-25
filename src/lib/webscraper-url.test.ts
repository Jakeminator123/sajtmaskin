import { describe, expect, it } from "vitest";
import { getCanonicalUrlKey, validateAndNormalizeUrl } from "./webscraper";

describe("validateAndNormalizeUrl", () => {
  it("adds https when protocol is missing", () => {
    expect(validateAndNormalizeUrl("example.com")).toBe("https://example.com/");
  });

  it("lowercases hostname and strips trailing slash on path", () => {
    expect(validateAndNormalizeUrl("https://WWW.Example.COM/about/")).toBe("https://www.example.com/about");
  });

  it("removes tracking query params and sorts the rest", () => {
    expect(
      validateAndNormalizeUrl("https://x.test/page?utm_source=fb&z=1&a=2"),
    ).toBe("https://x.test/page?a=2&z=1");
  });

  it("throws on empty input", () => {
    expect(() => validateAndNormalizeUrl("   ")).toThrow(/tom/i);
  });
});

describe("getCanonicalUrlKey", () => {
  it("strips www for dedupe key", () => {
    const a = getCanonicalUrlKey("https://www.shop.test/");
    const b = getCanonicalUrlKey("https://shop.test");
    expect(a).toBe(b);
  });

  it("falls back to trimmed lowercase when normalization throws", () => {
    expect(getCanonicalUrlKey("   ")).toBe("");
  });
});

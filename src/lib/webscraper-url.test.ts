import { describe, expect, it } from "vitest";
import { getCanonicalUrlKey, isSameSiteHost, validateAndNormalizeUrl } from "./webscraper";

describe("validateAndNormalizeUrl", () => {
  it.each([
    ["Workershotel.se", "https://workershotel.se/"],
    ["workershotel.se", "https://workershotel.se/"],
    ["www.workershotel.se", "https://www.workershotel.se/"],
    ["https://workershotel.se", "https://workershotel.se/"],
    [" HTTPS://Workershotel.se ", "https://workershotel.se/"],
  ])("accepts domain casing, optional www and protocol: %s", (input, expected) => {
    expect(validateAndNormalizeUrl(input)).toBe(expected);
  });

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

  it.each(["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "https://user:secret@example.com"])(
    "rejects unsafe forms instead of rewriting the target: %s",
    (input) => {
      expect(() => validateAndNormalizeUrl(input)).toThrow();
    },
  );
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

describe("isSameSiteHost (U#44)", () => {
  it("treats www and apex as the same site", () => {
    expect(isSameSiteHost("www.example.com", "example.com")).toBe(true);
    expect(isSameSiteHost("example.com", "www.example.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSameSiteHost("WWW.Example.COM", "example.com")).toBe(true);
  });

  it("does not match different subdomains or sites", () => {
    expect(isSameSiteHost("blog.example.com", "example.com")).toBe(false);
    expect(isSameSiteHost("example.com", "other.com")).toBe(false);
  });

  it("returns false for empty hosts", () => {
    expect(isSameSiteHost("", "example.com")).toBe(false);
    expect(isSameSiteHost("   ", "")).toBe(false);
  });
});

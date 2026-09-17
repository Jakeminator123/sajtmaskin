import { describe, expect, it } from "vitest";
import {
  KOSTNADSFRI_INFORMATION_PATH,
  classifyKostnadsfriSlug,
  isInviteSlug,
  isServerOnlyKostnadsfriPath,
  kostnadsfriEventPath,
  kostnadsfriVisitPath,
  parseKostnadsfriAnalyticsPath,
} from "./analytics-paths";

describe("kostnadsfri analytics paths", () => {
  it("round-trips visit and event paths", () => {
    expect(parseKostnadsfriAnalyticsPath(kostnadsfriVisitPath("jakobs-foretag-ab"))).toEqual({
      slug: "jakobs-foretag-ab",
      event: "besok",
    });
    expect(
      parseKostnadsfriAnalyticsPath(kostnadsfriEventPath("jakobs-foretag-ab", "verifierad")),
    ).toEqual({ slug: "jakobs-foretag-ab", event: "verifierad" });
    expect(parseKostnadsfriAnalyticsPath(kostnadsfriEventPath("ikea-ab", "skapad"))).toEqual({
      slug: "ikea-ab",
      event: "skapad",
    });
  });

  it("tolerates a trailing slash on the landing page", () => {
    expect(parseKostnadsfriAnalyticsPath("/kostnadsfri/ikea-ab/")).toEqual({
      slug: "ikea-ab",
      event: "besok",
    });
  });

  it("marks the funnel events as server-only, the landing visit not", () => {
    expect(isServerOnlyKostnadsfriPath(kostnadsfriEventPath("ikea-ab", "verifierad"))).toBe(true);
    expect(isServerOnlyKostnadsfriPath("/kostnadsfri/ikea-ab/verifierad/")).toBe(true);
    expect(isServerOnlyKostnadsfriPath(kostnadsfriEventPath("ikea-ab", "skapad"))).toBe(true);
    expect(isServerOnlyKostnadsfriPath(kostnadsfriVisitPath("ikea-ab"))).toBe(false);
    expect(isServerOnlyKostnadsfriPath("/builder")).toBe(false);
  });

  it("accepts generated company slugs and rejects junk tokens", () => {
    expect(isInviteSlug("growth-embedded-ab")).toBe(true);
    expect(isInviteSlug("ikea-ab")).toBe(true);
    expect(isInviteSlug("zax-2-0-ab")).toBe(true);
    expect(isInviteSlug("Z3Jvd3RoLW")).toBe(false);
    expect(isInviteSlug("Growth-Embedded-AB")).toBe(false);
    expect(isInviteSlug("-leading")).toBe(false);
    expect(isInviteSlug("trailing-")).toBe(false);
    expect(isInviteSlug("a--b")).toBe(false);
    expect(isInviteSlug("")).toBe(false);
    expect(isInviteSlug("a".repeat(121))).toBe(false);
  });

  it("classifies register hits, valid orphans and junk separately", () => {
    expect(classifyKostnadsfriSlug("growth-embedded-ab", true)).toBe("utskick");
    expect(classifyKostnadsfriSlug("growth-embedded-ab", false)).toBe("ej_utskick");
    expect(classifyKostnadsfriSlug("Z3Jvd3RoLW", true)).toBe("skrap");
    expect(classifyKostnadsfriSlug("Z3Jvd3RoLW", false)).toBe("skrap");
  });

  it("ignores unrelated and malformed paths", () => {
    expect(parseKostnadsfriAnalyticsPath("/builder")).toBeNull();
    expect(parseKostnadsfriAnalyticsPath("/kostnadsfri")).toBeNull();
    expect(parseKostnadsfriAnalyticsPath("/kostnadsfri/")).toBeNull();
    expect(parseKostnadsfriAnalyticsPath("/kostnadsfri/ikea-ab/okand")).toBeNull();
    expect(parseKostnadsfriAnalyticsPath("/kostnadsfri/ikea-ab/skapad/mer")).toBeNull();
    expect(parseKostnadsfriAnalyticsPath(KOSTNADSFRI_INFORMATION_PATH)).toBeNull();
  });
});

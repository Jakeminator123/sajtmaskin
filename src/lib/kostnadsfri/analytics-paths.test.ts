import { describe, expect, it } from "vitest";
import {
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

  it("marks only `verifierad` as server-only", () => {
    expect(isServerOnlyKostnadsfriPath(kostnadsfriEventPath("ikea-ab", "verifierad"))).toBe(true);
    expect(isServerOnlyKostnadsfriPath("/kostnadsfri/ikea-ab/verifierad/")).toBe(true);
    expect(isServerOnlyKostnadsfriPath(kostnadsfriEventPath("ikea-ab", "skapad"))).toBe(false);
    expect(isServerOnlyKostnadsfriPath(kostnadsfriVisitPath("ikea-ab"))).toBe(false);
    expect(isServerOnlyKostnadsfriPath("/builder")).toBe(false);
  });

  it("ignores unrelated and malformed paths", () => {
    expect(parseKostnadsfriAnalyticsPath("/builder")).toBeNull();
    expect(parseKostnadsfriAnalyticsPath("/kostnadsfri")).toBeNull();
    expect(parseKostnadsfriAnalyticsPath("/kostnadsfri/")).toBeNull();
    expect(parseKostnadsfriAnalyticsPath("/kostnadsfri/ikea-ab/okand")).toBeNull();
    expect(parseKostnadsfriAnalyticsPath("/kostnadsfri/ikea-ab/skapad/mer")).toBeNull();
  });
});

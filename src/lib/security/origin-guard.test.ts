import { describe, expect, it } from "vitest";

import {
  evaluateMutationOrigin,
  getTrustedPortalOrigins,
  isExternalMachineEndpoint,
  isPortalMutationMethod,
  isTrustedPortalOriginHeader,
} from "./origin-guard";

function decide(
  headers: Record<string, string>,
  trustedOrigins = getTrustedPortalOrigins({ appBaseUrl: "http://localhost:3000" }),
) {
  return evaluateMutationOrigin(new Headers(headers), trustedOrigins);
}

describe("trusted portal origins", () => {
  it("combines stable aliases with the configured app, OAuth, and Vercel preview owners", () => {
    const origins = getTrustedPortalOrigins({
      appBaseUrl: "http://localhost:4173/",
      oauthAllowedOrigins:
        "https://staff.sajtmaskin.test, http://127.0.0.1:3001, https://*.sajtmaskin.se, http://insecure.example, https://sajtmaskin.se/callback",
      vercelUrl: "sajtmaskin-git-origin-guard.vercel.app",
    });

    expect(origins).toEqual(
      expect.objectContaining({
        size: 10,
      }),
    );
    expect([...origins]).toEqual(
      expect.arrayContaining([
        "https://sajtmaskin.se",
        "https://www.sajtmaskin.se",
        "https://sajtmaskin.com",
        "https://www.sajtmaskin.com",
        "https://preview.sajtmaskin.se",
        "https://sajtmaskin.vercel.app",
        "https://sajtmaskin-git-origin-guard.vercel.app",
        "https://staff.sajtmaskin.test",
        "http://localhost:4173",
        "http://127.0.0.1:3001",
      ]),
    );
    expect(origins.has("https://customer.sajtmaskin.se")).toBe(false);
    expect(origins.has("http://insecure.example")).toBe(false);
  });

  it("accepts only canonical exact Origin header values", () => {
    const trusted = new Set(["https://sajtmaskin.se"]);

    expect(isTrustedPortalOriginHeader("https://sajtmaskin.se", trusted)).toBe(true);
    expect(isTrustedPortalOriginHeader("https://sajtmaskin.se/", trusted)).toBe(false);
    expect(isTrustedPortalOriginHeader("https://*.sajtmaskin.se", trusted)).toBe(false);
    expect(isTrustedPortalOriginHeader("https://sajtmaskin.se/path", trusted)).toBe(false);
    expect(isTrustedPortalOriginHeader("null", trusted)).toBe(false);
  });
});

describe("browser mutation origin decision", () => {
  it("allows an exact first-party Origin", () => {
    expect(decide({ origin: "https://preview.sajtmaskin.se", cookie: "session=ok" })).toEqual({
      allowed: true,
      source: "origin",
    });
  });

  it.each([
    "https://customer.sajtmaskin.se",
    "https://customer.sites.sajtmaskin.se",
    "https://sajtmaskin.se.evil.example",
  ])("rejects sibling or lookalike Origin %s", (origin) => {
    expect(decide({ origin, "sec-fetch-site": "same-site", cookie: "session=shadow" })).toEqual({
      allowed: false,
      reason: "origin_not_allowed",
    });
  });

  it.each(["null", "*", "not an origin", "https://sajtmaskin.se/"])(
    "rejects malformed Origin %s",
    (origin) => {
      expect(decide({ origin })).toEqual({
        allowed: false,
        reason: "origin_malformed",
      });
    },
  );

  it("uses a trusted Referer only when Origin is absent", () => {
    expect(decide({ referer: "https://sajtmaskin.se/projects/123", cookie: "session=ok" })).toEqual(
      {
        allowed: true,
        source: "referer",
      },
    );
    expect(
      decide({
        referer: "https://customer.sajtmaskin.se/form",
        "sec-fetch-site": "same-site",
        cookie: "session=shadow",
      }),
    ).toEqual({ allowed: false, reason: "referer_not_allowed" });
  });

  it("allows same-origin fetch metadata but denies other browser contexts without Origin", () => {
    expect(decide({ "sec-fetch-site": "same-origin", cookie: "session=ok" })).toEqual({
      allowed: true,
      source: "same-origin-fetch",
    });

    for (const fetchSite of ["same-site", "cross-site", "none"]) {
      expect(decide({ "sec-fetch-site": fetchSite, cookie: "session=shadow" })).toEqual({
        allowed: false,
        reason: "browser_origin_missing",
      });
    }
  });

  it("rejects an untraceable cookie mutation and leaves a header-authenticated machine request available", () => {
    expect(decide({ cookie: "session=unknown" })).toEqual({
      allowed: false,
      reason: "browser_origin_missing",
    });
    expect(decide({ "x-api-key": "machine-key" })).toEqual({
      allowed: true,
      source: "machine",
    });
  });
});

describe("guard scope", () => {
  it.each(["POST", "put", "PATCH", "delete"])("treats %s as a mutation", (method) => {
    expect(isPortalMutationMethod(method)).toBe(true);
  });

  it("does not treat reads and preflight as mutations", () => {
    expect(isPortalMutationMethod("GET")).toBe(false);
    expect(isPortalMutationMethod("HEAD")).toBe(false);
    expect(isPortalMutationMethod("OPTIONS")).toBe(false);
  });

  it.each([
    "/api/drains/vercel",
    "/api/stripe/webhook",
    "/api/webhooks/openai",
    "/api/webhooks/v0",
    "/api/webhooks/vercel",
  ])("keeps exact machine receiver %s under its route-owned authentication", (pathname) => {
    expect(isExternalMachineEndpoint(pathname)).toBe(true);
    expect(isExternalMachineEndpoint(`${pathname}/extra`)).toBe(false);
  });
});

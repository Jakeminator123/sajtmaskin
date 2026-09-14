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
  it("combines stable aliases with the configured app and OAuth owners", () => {
    const origins = getTrustedPortalOrigins({
      appBaseUrl: "https://portal.sajtmaskin.test/",
      oauthAllowedOrigins:
        "https://staff.sajtmaskin.test, http://127.0.0.1:3001, https://*.sajtmaskin.se, http://insecure.example, https://sajtmaskin.se/callback",
    });

    expect(origins.size).toBe(9);
    expect([...origins]).toEqual(
      expect.arrayContaining([
        "https://sajtmaskin.se",
        "https://www.sajtmaskin.se",
        "https://sajtmaskin.com",
        "https://www.sajtmaskin.com",
        "https://preview.sajtmaskin.se",
        "https://sajtmaskin.vercel.app",
        "https://portal.sajtmaskin.test",
        "https://staff.sajtmaskin.test",
        "http://127.0.0.1:3001",
      ]),
    );
    expect(origins.has("https://customer.sajtmaskin.se")).toBe(false);
    expect(origins.has("http://insecure.example")).toBe(false);
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "derives the three same-port loopback aliases from configured %s in nonproduction",
    (hostname) => {
      const origins = getTrustedPortalOrigins({
        appBaseUrl: `http://${hostname}:4173`,
        nodeEnv: "development",
      });

      expect(origins.has("http://localhost:4173")).toBe(true);
      expect(origins.has("http://127.0.0.1:4173")).toBe(true);
      expect(origins.has("http://[::1]:4173")).toBe(true);
      expect(origins.has("http://127.0.0.1:3000")).toBe(false);
      expect(origins.has("http://team.localhost:4173")).toBe(false);
    },
  );

  it("does not derive loopback aliases in production or from HTTPS", () => {
    const production = getTrustedPortalOrigins({
      appBaseUrl: "http://localhost:4173",
      nodeEnv: "production",
    });
    const https = getTrustedPortalOrigins({
      appBaseUrl: "https://localhost:4173",
      nodeEnv: "development",
    });

    expect(production.has("http://localhost:4173")).toBe(true);
    expect(production.has("http://127.0.0.1:4173")).toBe(false);
    expect(production.has("http://[::1]:4173")).toBe(false);
    expect(https.has("https://localhost:4173")).toBe(true);
    expect(https.has("https://127.0.0.1:4173")).toBe(false);
    expect(https.has("http://127.0.0.1:4173")).toBe(false);
  });

  it("does not derive aliases from arbitrary .localhost or OAuth origins", () => {
    const arbitraryLocalhost = getTrustedPortalOrigins({
      appBaseUrl: "http://team.localhost:4173",
      nodeEnv: "development",
    });
    const oauthOnly = getTrustedPortalOrigins({
      appBaseUrl: "https://sajtmaskin.se",
      nodeEnv: "development",
      oauthAllowedOrigins: "http://127.0.0.1:4444",
    });

    expect(arbitraryLocalhost.has("http://localhost:4173")).toBe(false);
    expect(arbitraryLocalhost.has("http://127.0.0.1:4173")).toBe(false);
    expect(arbitraryLocalhost.has("http://[::1]:4173")).toBe(false);
    expect(oauthOnly.has("http://127.0.0.1:4444")).toBe(true);
    expect(oauthOnly.has("http://localhost:4444")).toBe(false);
    expect(oauthOnly.has("http://[::1]:4444")).toBe(false);
  });

  it("trusts the distinct Vercel deployment and persistent branch origins", () => {
    const uniqueDeployment = "sajtmaskin-a1b2c3-jakeminator123s-projects.vercel.app";
    const previewBranch = "sajtmaskin-git-preview-jakeminator123s-projects.vercel.app";
    const origins = getTrustedPortalOrigins({
      vercelUrl: uniqueDeployment,
      vercelBranchUrl: previewBranch,
    });

    expect(origins.has(`https://${uniqueDeployment}`)).toBe(true);
    expect(origins.has(`https://${previewBranch}`)).toBe(true);
  });

  it("rejects spoofed Vercel system hostnames", () => {
    const origins = getTrustedPortalOrigins({
      vercelUrl: "sajtmaskin.vercel.app.evil.example",
      vercelBranchUrl: "sajtmaskin.vercel.app@evil.example",
    });

    expect(origins.has("https://sajtmaskin.vercel.app.evil.example")).toBe(false);
    expect(origins.has("https://evil.example")).toBe(false);
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

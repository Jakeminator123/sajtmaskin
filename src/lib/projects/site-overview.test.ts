import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { resolveSiteAddress, toPublishState } from "./site-overview";

const ORIGINAL_ENV = { ...process.env };

function enableBrandedGate(domain = "sites.sajtmaskin.se") {
  process.env.SAJTMASKIN_BRANDED_LIVE_URLS = "true";
  process.env.SAJTMASKIN_LIVE_SITE_DOMAIN = domain;
}

beforeEach(() => {
  delete process.env.SAJTMASKIN_BRANDED_LIVE_URLS;
  delete process.env.SAJTMASKIN_LIVE_SITE_DOMAIN;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveSiteAddress", () => {
  it("classifies a verified custom domain as the customer's own", () => {
    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      customDomain: "kundforetag.se",
      customDomainVerifiedAt: new Date("2026-09-01"),
    });

    expect(result).toEqual({ liveUrl: "https://kundforetag.se", kind: "custom" });
  });

  it("classifies a verified branded host as branded when the gate is on", () => {
    enableBrandedGate();

    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      brandedDomain: "kundforetag.sites.sajtmaskin.se",
      brandedDomainVerifiedAt: new Date("2026-09-01"),
    });

    expect(result).toEqual({
      liveUrl: "https://kundforetag.sites.sajtmaskin.se",
      kind: "branded",
    });
  });

  it("falls back to provider and labels it as such when the branded gate is off", () => {
    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      brandedDomain: "kundforetag.sites.sajtmaskin.se",
      brandedDomainVerifiedAt: new Date("2026-09-01"),
    });

    // The gate being off must not present the branded host as live — and the
    // portal must be able to tell that what it got is a technical address.
    expect(result).toEqual({ liveUrl: "https://generated-abc.vercel.app", kind: "provider" });
  });

  it("does not treat an unverified custom domain as live", () => {
    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      customDomain: "kundforetag.se",
      customDomainVerifiedAt: null,
    });

    expect(result).toEqual({ liveUrl: "https://generated-abc.vercel.app", kind: "provider" });
  });

  it("prefers a verified custom domain over a verified branded host", () => {
    enableBrandedGate();

    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      brandedDomain: "kundforetag.sites.sajtmaskin.se",
      brandedDomainVerifiedAt: new Date("2026-09-01"),
      customDomain: "kundforetag.se",
      customDomainVerifiedAt: new Date("2026-09-02"),
    });

    expect(result).toEqual({ liveUrl: "https://kundforetag.se", kind: "custom" });
  });

  it("reports no address when nothing is published", () => {
    expect(resolveSiteAddress({ providerUrl: null })).toEqual({ liveUrl: null, kind: "none" });
  });
});

describe("toPublishState", () => {
  it.each([
    ["ready", "ready"],
    ["READY", "ready"],
    ["error", "error"],
    ["building", "building"],
    ["cancelled", "cancelled"],
    ["canceled", "cancelled"],
  ])("maps %s to %s", (input, expected) => {
    expect(toPublishState(input)).toBe(expected);
  });

  it("treats unknown and missing status as pending rather than ready", () => {
    expect(toPublishState(null)).toBe("pending");
    expect(toPublishState("queued")).toBe("pending");
    expect(toPublishState("something-new")).toBe("pending");
  });
});

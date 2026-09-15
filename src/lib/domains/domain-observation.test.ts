import { describe, expect, it } from "vitest";
import {
  customerHostPair,
  humanDomainStatus,
  normalizeObservedDomain,
} from "./domain-observation";

describe("normalizeObservedDomain", () => {
  it("normalizes ordinary customer hostnames", () => {
    expect(normalizeObservedDomain("  Min-Sajt.SE. ")).toEqual({
      ok: true,
      domain: "min-sajt.se",
    });
    expect(normalizeObservedDomain("notsajtmaskin.se")).toEqual({
      ok: true,
      domain: "notsajtmaskin.se",
    });
  });

  it.each([
    "sajtmaskin.se",
    "kund.sajtmaskin.se",
    "www.sajtmaskin.se",
    "preview.sajtmaskin.se",
    "admin.sajtmaskin.se",
    "api.sites.sajtmaskin.se",
    "sajtmaskin.com",
    "demo.vercel.app",
    "cname.vercel-dns.com",
    "abc.vercel-dns-017.com",
  ])("rejects platform/provider-reserved hostname %s", (domain) => {
    expect(normalizeObservedDomain(domain)).toMatchObject({ ok: false });
  });

  it.each([
    "https://example.com",
    "example.com/path",
    "localhost",
    "127.0.0.1",
    "example",
    "bad_domain.se",
  ])("rejects non-hostname input %s", (domain) => {
    expect(normalizeObservedDomain(domain)).toMatchObject({ ok: false });
  });
});

describe("customerHostPair", () => {
  it("pairs apex and www for a two-label domain", () => {
    expect(customerHostPair("exempel.se")).toEqual({
      entered: "exempel.se",
      apex: "exempel.se",
      www: "www.exempel.se",
    });
  });

  it("keeps www as the entered primary and exposes the apex companion", () => {
    expect(customerHostPair("www.exempel.se")).toEqual({
      entered: "www.exempel.se",
      apex: "exempel.se",
      www: "www.exempel.se",
    });
  });

  it("does not invent www for an arbitrary subdomain", () => {
    expect(customerHostPair("shop.exempel.se")).toEqual({
      entered: "shop.exempel.se",
      apex: "shop.exempel.se",
      www: null,
    });
  });
});

describe("humanDomainStatus", () => {
  const base = {
    connection: "connected" as const,
    ownership: "verified" as const,
    dns: "valid" as const,
    https: "valid" as const,
  };

  it("keeps a transient unknown from becoming Problem", () => {
    expect(
      humanDomainStatus({
        observation: { ...base, dns: "unknown" },
        isLivePrimary: true,
      }),
    ).toBe("unknown");
  });

  it("labels a live primary separately from a merely connected host", () => {
    expect(humanDomainStatus({ observation: base, isLivePrimary: true })).toBe("live");
    expect(humanDomainStatus({ observation: base, isLivePrimary: false })).toBe("connected");
  });

  it("shows HTTPS invalid as Problem even while ownership is still pending", () => {
    expect(
      humanDomainStatus({
        observation: { ...base, ownership: "pending", https: "invalid" },
        isLivePrimary: false,
      }),
    ).toBe("problem");
  });

  it("shows waiting DNS and checking HTTPS as their own states", () => {
    expect(
      humanDomainStatus({
        observation: { ...base, ownership: "pending", https: "not_checked" },
        isLivePrimary: false,
      }),
    ).toBe("waiting_dns");
    expect(
      humanDomainStatus({
        observation: { ...base, https: "unknown" },
        isLivePrimary: false,
      }),
    ).toBe("checking_https");
  });
});

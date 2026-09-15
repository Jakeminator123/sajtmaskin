import { describe, expect, it } from "vitest";
import { normalizeObservedDomain } from "./domain-observation";

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

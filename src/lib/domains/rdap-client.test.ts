import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function lookup(domain = "example.com") {
  const { lookupWhois } = await import("./rdap-client");
  return lookupWhois(domain);
}

describe("lookupWhois", () => {
  it("returns an inconclusive result for a malformed IANA bootstrap", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ services: "invalid" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookup()).resolves.toMatchObject({
      ok: false,
      registered: null,
      rdapSupported: false,
      error: "[RDAP] bootstrap returned an invalid payload",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw when a registry returns malformed collection fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ services: [[["com"], ["https://rdap.example/"]]] }))
      .mockResolvedValueOnce(
        Response.json({
          ldhName: "EXAMPLE.COM",
          events: [null],
          entities: [null],
          nameservers: [null],
          status: "active",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookup()).resolves.toMatchObject({
      ok: true,
      registered: true,
      domain: "example.com",
      status: [],
      nameservers: [],
      error: null,
    });
  });

  it("turns a non-object registry body into a structured lookup error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ services: [[["com"], ["https://rdap.example/"]]] }))
      .mockResolvedValueOnce(Response.json(null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookup()).resolves.toMatchObject({
      ok: false,
      registered: null,
      rdapSupported: true,
      error: "RDAP-svaret har ogiltigt JSON-format",
    });
  });
});

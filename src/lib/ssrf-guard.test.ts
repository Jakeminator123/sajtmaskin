import { lookup } from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAllowedPreviewHost,
  isDisallowedHost,
  isLoopbackHost,
  safeFetch,
  validateSsrfTarget,
} from "./ssrf-guard";

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  return { lookup, default: { lookup } };
});
const mockedLookup = vi.mocked(lookup);

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Default: hostnames resolve to a public IP so the existing fetch/redirect
  // tests are unaffected. DNS-based-SSRF tests override per-case below.
  mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("ssrf-guard", () => {
  it("blocks localhost and private IPv4 addresses", () => {
    expect(isDisallowedHost("localhost")).toBe(true);
    expect(isDisallowedHost("127.0.0.1")).toBe(true);
    expect(isDisallowedHost("10.10.1.1")).toBe(true);
    expect(isDisallowedHost("192.168.0.42")).toBe(true);
    expect(isDisallowedHost("169.254.169.254")).toBe(true);
  });

  it("blocks local IPv6 ranges", () => {
    expect(isDisallowedHost("::1")).toBe(true);
    expect(isDisallowedHost("fd00::1")).toBe(true);
    expect(isDisallowedHost("fe80::1")).toBe(true);
    expect(isDisallowedHost("::ffff:7f00:1")).toBe(true);
    expect(isDisallowedHost("[::ffff:7f00:1]")).toBe(true);
  });

  it("allows IPv4-mapped IPv6 literals that map to public IPv4", () => {
    expect(isDisallowedHost("::ffff:0808:0808")).toBe(false);
  });

  it("allows regular public hosts", () => {
    expect(isDisallowedHost("example.com")).toBe(false);
    expect(isDisallowedHost("api.openai.com")).toBe(false);
  });

  it("rejects non-http protocols", () => {
    const res = validateSsrfTarget(new URL("ftp://example.com/file.txt"));
    expect(res.ok).toBe(false);
  });

  it("rejects internal hosts in validateSsrfTarget", () => {
    const res = validateSsrfTarget(new URL("http://127.0.0.1/admin"));
    expect(res.ok).toBe(false);
  });

  it("enforces allowlist-only mode for preview hosts", () => {
    const disallowed = validateSsrfTarget(new URL("https://example.com"), { allowlistOnly: true });
    expect(disallowed.ok).toBe(false);

    const allowed = validateSsrfTarget(new URL("https://foo.vusercontent.net"), {
      allowlistOnly: true,
    });
    expect(allowed.ok).toBe(true);
    expect(isAllowedPreviewHost(new URL("https://foo.vusercontent.net"))).toBe(true);
  });

  it("blocks unsafe redirect targets in safeFetch", async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1/internal" },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(redirectResponse) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Redirect blocked");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("blocks unsafe initial targets in safeFetch before any fetch happens", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const res = await safeFetch("http://127.0.0.1/internal");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Request blocked");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("follows safe redirects in safeFetch", async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: "https://example.org/next" },
    });
    const finalResponse = new Response("ok", { status: 200 });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse)
      .mockResolvedValueOnce(finalResponse) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("blocks private IP on later redirect hop (chained SSRF)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "https://hop1.example.com" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "https://hop2.example.com" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/metadata" } }),
      ) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Redirect blocked");
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("returns 400 when redirect chain exceeds max hops", async () => {
    const redirect = () =>
      new Response(null, { status: 302, headers: { Location: "https://example.com/next" } });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(redirect())
      .mockResolvedValueOnce(redirect())
      .mockResolvedValueOnce(redirect())
      .mockResolvedValueOnce(redirect())
      .mockResolvedValueOnce(redirect())
      .mockResolvedValueOnce(redirect()) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Too many redirects");
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
  });

  it("returns 400 for invalid URLs", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const res = await safeFetch("not a url");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid URL");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("supports allowlist-only mode from the initial request", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const res = await safeFetch("https://example.com", { allowlistOnly: true });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("allowlist");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("follows multi-hop safe redirect chain to completion", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { Location: "https://a.example.com" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "https://b.example.com" } }),
      )
      .mockResolvedValueOnce(new Response("final", { status: 200 })) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("final");
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  // --- DNS-based SSRF (G#40): public hostname resolving to a private IP -------

  it("blocks a hostname that resolves to a private IP before fetching", async () => {
    mockedLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }] as never);
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const res = await safeFetch("https://metadata.evil.example");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("private/internal IP");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("blocks a hostname resolving to an IPv4-mapped private IPv6", async () => {
    mockedLookup.mockResolvedValue([{ address: "::ffff:127.0.0.1", family: 6 }] as never);
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const res = await safeFetch("https://rebind.example.com");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("private/internal IP");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("allows a hostname that resolves only to public IPs", async () => {
    mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 })) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com");
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not block when DNS resolution fails (the fetch itself will fail)", async () => {
    mockedLookup.mockRejectedValue(new Error("ENOTFOUND"));
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 })) as unknown as typeof fetch;

    const res = await safeFetch("https://nonexistent.example");
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a hostname that resolves to a private IP", async () => {
    mockedLookup.mockImplementation(((host: string) =>
      Promise.resolve(
        host === "hop.example.org"
          ? [{ address: "10.0.0.5", family: 4 }]
          : [{ address: "93.184.216.34", family: 4 }],
      )) as never);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "https://hop.example.org/x" } }),
      ) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("private/internal IP");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("isLoopbackHost", () => {
  it("recognizes the app's own loopback origin (dev preview)", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.5.5.5")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("app.localhost")).toBe(true);
  });

  it("does NOT treat private/metadata targets as loopback", () => {
    // Security regression guard: a forged same-origin pointing at metadata /
    // private ranges must not be exempted from the SSRF guard.
    expect(isLoopbackHost("169.254.169.254")).toBe(false);
    expect(isLoopbackHost("10.0.0.1")).toBe(false);
    expect(isLoopbackHost("192.168.0.1")).toBe(false);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("example.com")).toBe(false);
  });

  it("keeps the element-map guard combination secure", () => {
    // The route allows a target only when it is loopback OR not disallowed.
    // A forged metadata target is loopback=false AND disallowed=true => blocked.
    const metadata = "169.254.169.254";
    const allowed = isLoopbackHost(metadata) || !isDisallowedHost(metadata);
    expect(allowed).toBe(false);

    // The dev preview (loopback) stays allowed.
    const devPreview = "localhost";
    expect(isLoopbackHost(devPreview) || !isDisallowedHost(devPreview)).toBe(true);
  });
});

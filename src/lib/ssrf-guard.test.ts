import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAllowedPreviewHost,
  isDisallowedHost,
  safeFetch,
  validateSsrfTarget,
} from "./ssrf-guard";

const originalFetch = globalThis.fetch;

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
});

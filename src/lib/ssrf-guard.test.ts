import { lookup } from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithPinnedDns = vi.hoisted(() => vi.fn());
const PINNED_ADDRESS_BLOCKED_MESSAGE = vi.hoisted(
  () => "Pinned fetch blocked: hostname resolved to a private/internal address",
);
const PINNED_BODY_LIMIT_PREFIX = vi.hoisted(() => "Pinned fetch aborted: response exceeded");
const PINNED_BODY_LIMIT_CODE = vi.hoisted(() => "ERR_BUFFER_TOO_LARGE");
vi.mock("@/lib/capture/pinned-fetch", () => ({
  fetchWithPinnedDns,
  PINNED_ADDRESS_BLOCKED_MESSAGE,
  PINNED_BODY_LIMIT_PREFIX,
  PINNED_BODY_LIMIT_CODE,
}));
import {
  hostResolvesToPrivate,
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
  fetchWithPinnedDns.mockReset();
  fetchWithPinnedDns.mockImplementation(async (rawUrl: string, init: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | null;
    signal?: AbortSignal;
  } = {}) => {
    const response = await globalThis.fetch(rawUrl, {
      method: init.method,
      headers: init.headers,
      body: init.body ? new Uint8Array(init.body) : null,
      signal: init.signal,
      redirect: "manual",
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: Buffer.from(await response.arrayBuffer()),
    };
  });
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
    expect(isDisallowedHost("100.64.1.1")).toBe(true);
    expect(isDisallowedHost("192.0.2.1")).toBe(true);
    expect(isDisallowedHost("224.0.0.1")).toBe(true);
    expect(isDisallowedHost("255.255.255.255")).toBe(true);
  });

  it("blocks local IPv6 ranges", () => {
    expect(isDisallowedHost("::1")).toBe(true);
    expect(isDisallowedHost("fd00::1")).toBe(true);
    expect(isDisallowedHost("fe80::1")).toBe(true);
    expect(isDisallowedHost("fe90::1")).toBe(true);
    expect(isDisallowedHost("::")).toBe(true);
    expect(isDisallowedHost("ff02::1")).toBe(true);
    expect(isDisallowedHost("::ffff:7f00:1")).toBe(true);
    expect(isDisallowedHost("[::ffff:7f00:1]")).toBe(true);
    expect(isDisallowedHost("64:ff9b::1")).toBe(true);
    expect(isDisallowedHost("2001:db8::1")).toBe(true);
    expect(isDisallowedHost("2001::1")).toBe(true);
    expect(isDisallowedHost("100::1")).toBe(true);
  });

  it("allows IPv4-mapped IPv6 literals that map to public IPv4", () => {
    expect(isDisallowedHost("::ffff:0808:0808")).toBe(false);
  });

  it("blocks deprecated IPv4-compatible IPv6 URL literals via the embedded IPv4", () => {
    expect(isDisallowedHost("::169.254.169.254")).toBe(true);
    expect(isDisallowedHost("::127.0.0.1")).toBe(true);
    expect(isDisallowedHost("::10.0.0.1")).toBe(true);
    expect(validateSsrfTarget(new URL("http://[::169.254.169.254]/")).ok).toBe(false);
    expect(validateSsrfTarget(new URL("http://[::127.0.0.1]/")).ok).toBe(false);
    expect(validateSsrfTarget(new URL("http://[::10.0.0.1]/")).ok).toBe(false);
    expect(validateSsrfTarget(new URL("http://[::8.8.8.8]/")).ok).toBe(true);
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

  it("uses connect-time pinned transport for the initial URL and every redirect", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "https://cdn.example/asset" } }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 })) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com/start");

    expect(res.status).toBe(200);
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(2);
    expect(fetchWithPinnedDns.mock.calls[0]?.[0]).toBe("https://example.com/start");
    expect(fetchWithPinnedDns.mock.calls[1]?.[0]).toBe("https://cdn.example/asset");
  });

  it("fails closed when the connect-time lookup observes a rebound private address", async () => {
    mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    fetchWithPinnedDns.mockRejectedValueOnce(new Error(PINNED_ADDRESS_BLOCKED_MESSAGE));
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const res = await safeFetch("https://rebind.example/start");

    expect(res.status).toBe(403);
    expect(await res.text()).toContain("connect time");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("drops credentials on a cross-origin redirect but keeps ordinary headers", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "https://cdn.example/asset" } }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 })) as unknown as typeof fetch;

    await safeFetch("https://example.com/start", {
      headers: {
        Authorization: "Bearer secret",
        Cookie: "session=secret",
        "X-Request-Id": "trace-1",
      },
    });

    const second = fetchWithPinnedDns.mock.calls[1]?.[1] as {
      headers: Record<string, string>;
    };
    expect(second.headers.authorization).toBeUndefined();
    expect(second.headers.cookie).toBeUndefined();
    expect(second.headers["x-request-id"]).toBe("trace-1");
  });

  it("rewrites POST to GET on 303 and removes body headers", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 303, headers: { Location: "/done" } }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 })) as unknown as typeof fetch;

    await safeFetch("https://example.com/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });

    const second = fetchWithPinnedDns.mock.calls[1]?.[1] as {
      method: string;
      headers: Record<string, string>;
      body: Buffer | null;
    };
    expect(second.method).toBe("GET");
    expect(second.body).toBeNull();
    expect(second.headers["content-type"]).toBeUndefined();
  });

  it("rejects credentials embedded in initial and redirect URLs", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://user:secret@cdn.example/asset" },
        }),
      ) as unknown as typeof fetch;

    const initial = await safeFetch("https://user:secret@example.com/");
    const redirect = await safeFetch("https://example.com/");

    expect(initial.status).toBe(403);
    expect(redirect.status).toBe(403);
    expect(await redirect.text()).toContain("credentials");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(1);
  });

  it("blocks when any A/AAAA record is private even if another is public", async () => {
    mockedLookup.mockResolvedValue([
      { address: "1.1.1.1", family: 4 },
      { address: "2001:db8::1", family: 6 },
    ] as never);
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    await expect(hostResolvesToPrivate("mixed.example")).resolves.toBe(true);
    const res = await safeFetch("https://mixed.example/");
    expect(res.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(fetchWithPinnedDns).not.toHaveBeenCalled();
  });

  it("allows a mixed A/AAAA answer only when every record is public", async () => {
    mockedLookup.mockResolvedValue([
      { address: "1.1.1.1", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ] as never);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 })) as unknown as typeof fetch;

    await expect(hostResolvesToPrivate("dual.example")).resolves.toBe(false);
    const res = await safeFetch("https://dual.example/");
    expect(res.status).toBe(200);
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(1);
  });

  it("blocks a public→private redirect chain after the public hop", async () => {
    mockedLookup.mockImplementation(((host: string) =>
      Promise.resolve(
        host === "private.example"
          ? [
              { address: "8.8.8.8", family: 4 },
              { address: "10.0.0.9", family: 4 },
            ]
          : [{ address: "93.184.216.34", family: 4 }],
      )) as never);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "https://private.example/x" } }),
      ) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("private/internal IP");
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(1);
  });

  it("keeps POST body on 307 but still pins the next hop", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 307, headers: { Location: "https://example.com/next" } }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 })) as unknown as typeof fetch;

    await safeFetch("https://example.com/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keep: true }),
    });

    const second = fetchWithPinnedDns.mock.calls[1]?.[1] as {
      method: string;
      body: Buffer | null;
    };
    expect(second.method).toBe("POST");
    expect(second.body?.toString()).toBe(JSON.stringify({ keep: true }));
  });

  it("för vidare caller-styrd maxBodyBytes och fail-stänger med 413", async () => {
    const limitError = new Error(`${PINNED_BODY_LIMIT_PREFIX} 4 bytes`) as NodeJS.ErrnoException;
    limitError.name = "RangeError";
    limitError.code = PINNED_BODY_LIMIT_CODE;
    fetchWithPinnedDns.mockRejectedValueOnce(limitError);
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const res = await safeFetch("https://example.com/img", { maxBodyBytes: 4 });
    expect(res.status).toBe(413);
    expect(await res.text()).toContain("maxBodyBytes");
    expect(fetchWithPinnedDns.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ maxBodyBytes: 4 }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("mappar rå RangeError ERR_BUFFER_TOO_LARGE till samma 413-utgång", async () => {
    const raw = new RangeError("Cannot create a Buffer larger than 4 bytes") as NodeJS.ErrnoException;
    raw.code = PINNED_BODY_LIMIT_CODE;
    fetchWithPinnedDns.mockRejectedValueOnce(raw);
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const res = await safeFetch("https://example.com/img", { maxBodyBytes: 4 });
    expect(res.status).toBe(413);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("lämnar default-GET utan maxBodyBytes så transportens eget tak gäller", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 })) as unknown as typeof fetch;

    const res = await safeFetch("https://example.com");
    expect(res.status).toBe(200);
    expect((fetchWithPinnedDns.mock.calls[0]?.[1] as { maxBodyBytes?: number }).maxBodyBytes)
      .toBeUndefined();
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

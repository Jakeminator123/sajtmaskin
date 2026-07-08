import { beforeEach, describe, expect, it, vi } from "vitest";

const isDisallowedHost = vi.hoisted(() => vi.fn());
const hostResolvesToPrivate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ssrf-guard", () => ({ isDisallowedHost, hostResolvesToPrivate }));

const { buildCaptureRequestGate, assertFinalUrlAllowed } = await import("./thumbnail-capture");

// Bugbot high (PR #426): the page-level request gate must block redirect/JS
// navigations to internal hosts — the route's pre-check only covers the
// INITIAL URL.
describe("buildCaptureRequestGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDisallowedHost.mockReturnValue(false);
    hostResolvesToPrivate.mockResolvedValue(false);
  });

  it("allows public http(s) hosts", async () => {
    const gate = buildCaptureRequestGate();
    await expect(gate("https://site.fly.dev/page")).resolves.toBe(true);
  });

  it("blocks non-http(s) protocols", async () => {
    const gate = buildCaptureRequestGate();
    await expect(gate("ftp://site.fly.dev/x")).resolves.toBe(false);
    await expect(gate("file:///etc/passwd")).resolves.toBe(false);
    expect(isDisallowedHost).not.toHaveBeenCalled();
  });

  it("blocks hosts the literal guard rejects (e.g. metadata IP)", async () => {
    isDisallowedHost.mockImplementation((host: string) => host === "169.254.169.254");
    const gate = buildCaptureRequestGate();
    await expect(gate("http://169.254.169.254/latest/meta-data")).resolves.toBe(false);
  });

  it("blocks hosts that resolve to private addresses (DNS SSRF)", async () => {
    hostResolvesToPrivate.mockImplementation(async (host: string) => host === "evil.example");
    const gate = buildCaptureRequestGate();
    await expect(gate("https://evil.example/redirect-target")).resolves.toBe(false);
    await expect(gate("https://site.fly.dev/ok")).resolves.toBe(true);
  });

  it("caches the verdict per host within one capture", async () => {
    const gate = buildCaptureRequestGate();
    await gate("https://site.fly.dev/a");
    await gate("https://site.fly.dev/b");
    await gate("https://site.fly.dev/c");
    expect(hostResolvesToPrivate).toHaveBeenCalledTimes(1);
  });

  it("blocks unparseable URLs", async () => {
    const gate = buildCaptureRequestGate();
    await expect(gate("not a url")).resolves.toBe(false);
  });
});

// Audit A#6: the request gate admits any PUBLIC host, so the final main-frame
// URL must still pass the caller's allowlist before the screenshot is taken.
describe("assertFinalUrlAllowed", () => {
  it("passes when the final URL satisfies the allowlist", () => {
    expect(() =>
      assertFinalUrlAllowed("https://site.fly.dev/page", (u) => u.hostname === "site.fly.dev"),
    ).not.toThrow();
  });

  it("throws when a redirect/JS navigation left the allowlist", () => {
    expect(() =>
      assertFinalUrlAllowed("https://evil.example/landing", (u) => u.hostname === "site.fly.dev"),
    ).toThrow(/off the allowlist/);
  });

  it("throws on unparseable final URLs", () => {
    expect(() => assertFinalUrlAllowed("not a url", () => true)).toThrow(/unparseable/);
  });
});

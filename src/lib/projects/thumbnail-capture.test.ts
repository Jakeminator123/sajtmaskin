import { beforeEach, describe, expect, it, vi } from "vitest";

const isDisallowedHost = vi.hoisted(() => vi.fn());
const hostResolvesToPrivate = vi.hoisted(() => vi.fn());
const launchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ssrf-guard", () => ({ isDisallowedHost, hostResolvesToPrivate }));
// Both launch paths (local `playwright`, serverless `playwright-core` +
// `@sparticuz/chromium`) funnel through launchMock so the tests never spawn a
// real browser regardless of the VERCEL flag at import time.
vi.mock("playwright", () => ({ chromium: { launch: launchMock } }));
vi.mock("playwright-core", () => ({ chromium: { launch: launchMock } }));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: [], executablePath: async () => "/tmp/chromium", headless: true },
}));

const { buildCaptureRequestGate, assertFinalUrlAllowed, captureThumbnailScreenshot } = await import(
  "./thumbnail-capture"
);

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

// Codex P1 (PR #593): the new screenshot deadline and the stage-tagged error
// wrapper are prod failure-mode mitigations, so they need coverage — the tests
// above only exercise the pure helpers, not captureThumbnailScreenshot itself.
function makeFakePage(overrides: Record<string, unknown> = {}) {
  return {
    context: () => ({ route: vi.fn().mockResolvedValue(undefined) }),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue("https://site.fly.dev/x"),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("jpeg-bytes")),
    ...overrides,
  };
}

function makeFakeBrowser(page: ReturnType<typeof makeFakePage>) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("captureThumbnailScreenshot", () => {
  beforeEach(() => {
    launchMock.mockReset();
    isDisallowedHost.mockReturnValue(false);
    hostResolvesToPrivate.mockResolvedValue(false);
  });

  it("passes the explicit screenshot timeout and closes the browser", async () => {
    const page = makeFakePage();
    const browser = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const buf = await captureThumbnailScreenshot("https://site.fly.dev/x", {
      isFinalUrlAllowed: () => true,
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(page.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ type: "jpeg", fullPage: false, timeout: 15_000 }),
    );
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("wraps a launch failure with the failing stage and preserves the cause", async () => {
    const cause = new Error("browser did not start");
    launchMock.mockRejectedValue(cause);

    const err = await captureThumbnailScreenshot("https://site.fly.dev/x", {
      isFinalUrlAllowed: () => true,
    }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );

    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/stage "launch"/);
    expect(err?.message).toContain("browser did not start");
    expect(err?.cause).toBe(cause);
  });

  it('wraps a navigation failure with stage "navigate" and still closes the browser', async () => {
    const page = makeFakePage({
      goto: vi.fn().mockRejectedValue(new Error("net::ERR_TIMED_OUT")),
    });
    const browser = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const err = await captureThumbnailScreenshot("https://site.fly.dev/x", {
      isFinalUrlAllowed: () => true,
    }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );

    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/stage "navigate"/);
    expect(err?.message).toContain("net::ERR_TIMED_OUT");
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(page.screenshot).not.toHaveBeenCalled();
  });
});

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

const {
  buildCaptureRequestGate,
  assertFinalUrlAllowed,
  captureThumbnailScreenshot,
  isTransientCaptureAbort,
  PreviewHostBootPageError,
  isPreviewHostBootPageError,
} = await import("./thumbnail-capture");

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

// Ett race mot en kosmetisk bild får inte rapporteras som 5xx. Klassificeringen
// måste skilja "previewen rörde sig" från äkta fel som ska synas som 502.
describe("isTransientCaptureAbort", () => {
  it("känner igen att sidan/kontexten stängdes under captureringen", () => {
    expect(
      isTransientCaptureAbort(
        new Error(
          'Thumbnail capture failed at stage "screenshot": page.screenshot: Target page, context or browser has been closed',
        ),
      ),
    ).toBe(true);
    expect(isTransientCaptureAbort(new Error("Target closed"))).toBe(true);
    expect(isTransientCaptureAbort(new Error("Page has been closed"))).toBe(true);
    expect(
      isTransientCaptureAbort(new Error("Navigation to https://site.fly.dev was interrupted")),
    ).toBe(true);
    expect(isTransientCaptureAbort(new Error("Execution context was destroyed"))).toBe(true);
  });

  it("klassificerar inte äkta fel som övergående", () => {
    expect(isTransientCaptureAbort(new Error("net::ERR_TIMED_OUT"))).toBe(false);
    expect(isTransientCaptureAbort(new Error("browser did not start"))).toBe(false);
    expect(
      isTransientCaptureAbort(new Error("Thumbnail capture navigated off the allowlist: evil.example")),
    ).toBe(false);
    expect(isTransientCaptureAbort(undefined)).toBe(false);
  });
});

// Codex P1 (PR #593): the new screenshot deadline and the stage-tagged error
// wrapper are prod failure-mode mitigations, so they need coverage — the tests
// above only exercise the pure helpers, not captureThumbnailScreenshot itself.
function makeFakePage(overrides: Record<string, unknown> = {}) {
  return {
    // Båda kanalerna måste finnas: `applyCaptureRequestGate` grindar numera
    // WebSockets också, och ett fejk utan `routeWebSocket` failar i
    // "new-page"-steget i stället för i det steg testet handlar om.
    context: () => ({
      route: vi.fn().mockResolvedValue(undefined),
      routeWebSocket: vi.fn().mockResolvedValue(undefined),
    }),
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
  // SM-025: launchCaptureBrowser byter ut `browser.close` mot en wrapper som
  // släpper launch-grinden, så objektets `close` är inte spy:n efteråt.
  // Behåll spy-referensen separat och assertera på den.
  const closeSpy = vi.fn().mockResolvedValue(undefined);
  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: closeSpy,
  };
  return { browser, closeSpy };
}

describe("captureThumbnailScreenshot", () => {
  beforeEach(() => {
    launchMock.mockReset();
    isDisallowedHost.mockReturnValue(false);
    hostResolvesToPrivate.mockResolvedValue(false);
  });

  it("passes the explicit screenshot timeout and closes the browser", async () => {
    const page = makeFakePage();
    const { browser, closeSpy } = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const buf = await captureThumbnailScreenshot("https://site.fly.dev/x", {
      isFinalUrlAllowed: () => true,
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(page.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ type: "jpeg", fullPage: false, timeout: 15_000 }),
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
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

  it("flaggar ett skott som dog av att previewen navigerade om som övergående", async () => {
    // Exakt prod-meddelandet från 2026-07-27, inklusive stage-wrappern.
    const page = makeFakePage({
      screenshot: vi
        .fn()
        .mockRejectedValue(
          new Error("page.screenshot: Target page, context or browser has been closed"),
        ),
    });
    const { browser, closeSpy } = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const err = await captureThumbnailScreenshot("https://site.fly.dev/x", {
      isFinalUrlAllowed: () => true,
    }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );

    expect(err?.message).toMatch(/stage "screenshot"/);
    expect(isTransientCaptureAbort(err)).toBe(true);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('wraps a navigation failure with stage "navigate" and still closes the browser', async () => {
    const page = makeFakePage({
      goto: vi.fn().mockRejectedValue(new Error("net::ERR_TIMED_OUT")),
    });
    const { browser, closeSpy } = makeFakeBrowser(page);
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
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it("skips the screenshot when the preview-host boot placeholder is showing", async () => {
    let evaluateCalls = 0;
    const page = makeFakePage({
      evaluate: vi.fn(async () => {
        evaluateCalls += 1;
        // 1st = fonts settle, 2nd = boot-page probe
        if (evaluateCalls === 1) return undefined;
        return {
          title: "Startar preview",
          h1: "Startar preview",
          bodyText:
            "Preview-host bygger projektet och startar Next.js i bakgrunden.\n" +
            "Chat: 8aeac552-f309-4610-b9c0-6be7309d5c38\n" +
            "Status: warm_project",
        };
      }),
    });
    const { browser, closeSpy } = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const err = await captureThumbnailScreenshot("https://site.fly.dev/x", {
      isFinalUrlAllowed: () => true,
    }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );

    expect(err).toBeInstanceOf(PreviewHostBootPageError);
    expect(isPreviewHostBootPageError(err)).toBe(true);
    expect(page.screenshot).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

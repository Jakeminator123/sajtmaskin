import { beforeEach, describe, expect, it, vi } from "vitest";

const isDisallowedHost = vi.hoisted(() => vi.fn());
const hostResolvesToPrivate = vi.hoisted(() => vi.fn());
const launchMock = vi.hoisted(() => vi.fn());
const fetchWithPinnedDns = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ssrf-guard", () => ({ isDisallowedHost, hostResolvesToPrivate }));
// Both launch paths (local `playwright`, serverless `playwright-core` +
// `@sparticuz/chromium`) funnel through launchMock so the tests never spawn a
// real browser regardless of the VERCEL flag at import time.
vi.mock("playwright", () => ({ chromium: { launch: launchMock } }));
vi.mock("playwright-core", () => ({ chromium: { launch: launchMock } }));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: [], executablePath: async () => "/tmp/chromium", headless: true },
}));
vi.mock("@/lib/capture/pinned-fetch", () => ({ fetchWithPinnedDns }));

const {
  buildCaptureRequestGate,
  assertFinalUrlAllowed,
  captureThumbnailScreenshot,
  isTransientCaptureAbort,
  PreviewHostBootPageError,
  PreviewProbeUnreadableError,
  isPreviewHostBootPageError,
  isPreviewProbeUnreadableError,
  planThumbnailScrollOffsets,
  thumbnailCaptureControlledBudgetMs,
  THUMBNAIL_SCROLL_MAX_STEPS,
  THUMBNAIL_SCROLL_STEP_DELAY_MS,
  THUMBNAIL_POST_SCROLL_SETTLE_MS,
  THUMBNAIL_WARMUP_TIMEOUT_MS,
  THUMBNAIL_VIEWPORT,
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

function classifyEvaluateScript(fn: unknown): "fonts" | "measure" | "scroll" | "raf" | "probe" | "other" {
  const src = String(fn);
  if (src.includes("fonts")) return "fonts";
  if (src.includes("scrollHeight") || src.includes("pageHeight")) return "measure";
  if (src.includes("scrollTo")) return "scroll";
  if (src.includes("requestAnimationFrame")) return "raf";
  if (src.includes("bodyText") || src.includes("document.title")) return "probe";
  return "other";
}

const LIVE_PROBE = {
  title: "Site",
  h1: "Hello",
  bodyText: "Welcome to the site.",
} as const;

function defaultEvaluate(fn: unknown, pageHeight: number = THUMBNAIL_VIEWPORT.height) {
  const kind = classifyEvaluateScript(fn);
  if (kind === "measure") {
    return { viewportHeight: THUMBNAIL_VIEWPORT.height, pageHeight };
  }
  if (kind === "probe") return { ...LIVE_PROBE };
  return undefined;
}

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
    evaluate: vi.fn(async (fn: unknown) => defaultEvaluate(fn)),
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

describe("planThumbnailScrollOffsets", () => {
  it("returns no offsets when the page fits in the viewport", () => {
    expect(
      planThumbnailScrollOffsets({ viewportHeight: 750, pageHeight: 750 }),
    ).toEqual([]);
    expect(
      planThumbnailScrollOffsets({ viewportHeight: 750, pageHeight: 600 }),
    ).toEqual([]);
  });

  it("steps by viewport height and always includes the bottom", () => {
    expect(
      planThumbnailScrollOffsets({ viewportHeight: 750, pageHeight: 800 }),
    ).toEqual([50]);
    expect(
      planThumbnailScrollOffsets({ viewportHeight: 750, pageHeight: 2000 }),
    ).toEqual([750, 1250]);
  });

  it("caps at maxSteps and snaps the last step to the bottom", () => {
    const offsets = planThumbnailScrollOffsets({
      viewportHeight: 750,
      pageHeight: 10_000,
      maxSteps: 10,
    });
    expect(offsets).toHaveLength(10);
    expect(offsets[0]).toBe(750);
    expect(offsets[offsets.length - 1]).toBe(10_000 - 750);
    expect(offsets.slice(0, -1)).toEqual([750, 1500, 2250, 3000, 3750, 4500, 5250, 6000, 6750]);
  });

  it("rejects non-positive geometry", () => {
    expect(planThumbnailScrollOffsets({ viewportHeight: 0, pageHeight: 2000 })).toEqual([]);
    expect(planThumbnailScrollOffsets({ viewportHeight: 750, pageHeight: 0 })).toEqual([]);
    expect(
      planThumbnailScrollOffsets({ viewportHeight: 750, pageHeight: 2000, maxSteps: 0 }),
    ).toEqual([]);
  });
});

describe("thumbnailCaptureControlledBudgetMs", () => {
  it("stays safely under the thumbnail route maxDuration of 60s", () => {
    const budget = thumbnailCaptureControlledBudgetMs();
    expect(budget).toBe(
      25_000 +
        8_000 +
        400 +
        THUMBNAIL_SCROLL_MAX_STEPS * THUMBNAIL_SCROLL_STEP_DELAY_MS +
        THUMBNAIL_POST_SCROLL_SETTLE_MS +
        15_000 +
        THUMBNAIL_WARMUP_TIMEOUT_MS,
    );
    expect(budget).toBe(52_300);
    expect(budget).toBeLessThan(55_000);
  });
});

describe("captureThumbnailScreenshot", () => {
  beforeEach(() => {
    launchMock.mockReset();
    isDisallowedHost.mockReturnValue(false);
    hostResolvesToPrivate.mockResolvedValue(false);
    fetchWithPinnedDns.mockReset();
    fetchWithPinnedDns.mockResolvedValue({
      status: 200,
      headers: {},
      body: Buffer.from(""),
    });
  });

  it("passes the explicit screenshot timeout and closes the browser", async () => {
    const page = makeFakePage();
    const { browser, closeSpy } = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const buf = await captureThumbnailScreenshot("https://site.fly.dev/x", {
      isFinalUrlAllowed: () => true,
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(browser.newPage).toHaveBeenCalledWith(
      expect.objectContaining({
        reducedMotion: "reduce",
        viewport: THUMBNAIL_VIEWPORT,
        serviceWorkers: "block",
      }),
    );
    expect(fetchWithPinnedDns).toHaveBeenCalledWith(
      "https://site.fly.dev/x",
      expect.objectContaining({ method: "GET", timeoutMs: THUMBNAIL_WARMUP_TIMEOUT_MS }),
    );
    expect(page.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ type: "jpeg", fullPage: false, timeout: 15_000 }),
    );
    expect(page.waitForTimeout).toHaveBeenCalledWith(THUMBNAIL_POST_SCROLL_SETTLE_MS);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("scrolls a tall page with the planned offsets, then returns to top", async () => {
    const pageHeight = 2_000;
    let scrollArg: { nextOffsets: number[]; stepDelayMs: number } | undefined;
    const page = makeFakePage({
      evaluate: vi.fn(async (fn: unknown, arg?: { nextOffsets: number[]; stepDelayMs: number }) => {
        const kind = classifyEvaluateScript(fn);
        if (kind === "scroll") scrollArg = arg;
        return defaultEvaluate(fn, pageHeight);
      }),
    });
    const { browser } = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    await captureThumbnailScreenshot("https://site.fly.dev/x", {
      isFinalUrlAllowed: () => true,
    });

    expect(scrollArg).toEqual({
      nextOffsets: planThumbnailScrollOffsets({
        viewportHeight: THUMBNAIL_VIEWPORT.height,
        pageHeight,
      }),
      stepDelayMs: THUMBNAIL_SCROLL_STEP_DELAY_MS,
    });
    expect(page.screenshot).toHaveBeenCalledTimes(1);
  });

  it("still screenshots when visual settle throws", async () => {
    const page = makeFakePage({
      evaluate: vi.fn(async (fn: unknown) => {
        const kind = classifyEvaluateScript(fn);
        if (kind === "measure" || kind === "scroll" || kind === "raf") {
          throw new Error("scroll exploded");
        }
        return defaultEvaluate(fn);
      }),
    });
    const { browser, closeSpy } = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const buf = await captureThumbnailScreenshot("https://site.fly.dev/x", {
      isFinalUrlAllowed: () => true,
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(page.screenshot).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not fail capture when the warmup GET throws", async () => {
    fetchWithPinnedDns.mockRejectedValue(new Error("warmup timeout"));
    const page = makeFakePage();
    const { browser } = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    await expect(
      captureThumbnailScreenshot("https://site.fly.dev/x", {
        isFinalUrlAllowed: () => true,
      }),
    ).resolves.toBeInstanceOf(Buffer);
    expect(page.screenshot).toHaveBeenCalledTimes(1);
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
    const page = makeFakePage({
      evaluate: vi.fn(async (fn: unknown) => {
        if (classifyEvaluateScript(fn) === "probe") {
          return {
            title: "Startar preview",
            h1: "Startar preview",
            bodyText:
              "Preview-host bygger projektet och startar Next.js i bakgrunden.\n" +
              "Chat: 8aeac552-f309-4610-b9c0-6be7309d5c38\n" +
              "Status: warm_project",
          };
        }
        return defaultEvaluate(fn);
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
    // Boot-page skip happens before visual settle — no scroll on a placeholder.
    expect(
      (page.evaluate as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => classifyEvaluateScript(call[0]) === "scroll",
      ),
    ).toBe(false);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("skips the screenshot when the page probe is empty, without blaming preview-host", async () => {
    const page = makeFakePage({
      evaluate: vi.fn(async (fn: unknown) => {
        if (classifyEvaluateScript(fn) === "probe") {
          return { title: "", h1: null, bodyText: "" };
        }
        return defaultEvaluate(fn);
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

    expect(err).toBeInstanceOf(PreviewProbeUnreadableError);
    expect(isPreviewProbeUnreadableError(err)).toBe(true);
    expect(isPreviewHostBootPageError(err)).toBe(false);
    expect(err?.message).not.toMatch(/preview-host|Startar preview|boot placeholder/i);
    expect(page.screenshot).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

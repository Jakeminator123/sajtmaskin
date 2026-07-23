/**
 * Full-viewport screenshot of a (public) preview/live URL, used as the
 * project thumbnail in "Mina projekt".
 *
 * Two launch paths:
 *  - Serverless (Vercel): `playwright-core` + `@sparticuz/chromium` (bundled
 *    Lambda-compatible Chromium). The regular `playwright` package cannot run
 *    there (no browser binary in the function).
 *  - Local/dev: the repo's `playwright` devDependency (same engine the
 *    inspector-capture route uses).
 *
 * SSRF: the route pre-checks the INITIAL URL, but headless Chromium follows
 * redirects and honors JS/meta-refresh navigations to hosts that were never
 * checked. Every request the page makes is therefore intercepted here and
 * aborted unless its host passes the same public-host guard (Bugbot high,
 * PR #426). That guard alone still admits arbitrary PUBLIC sites, so the
 * final main-frame URL must additionally pass the caller's allowlist before
 * the screenshot is taken (audit A#6).
 */
import type { Browser } from "playwright-core";
import { hostResolvesToPrivate, isDisallowedHost } from "@/lib/ssrf-guard";

const IS_SERVERLESS = Boolean(process.env.VERCEL);

const NAVIGATION_TIMEOUT_MS = 25_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;
/**
 * Explicit screenshot deadline. Without it Playwright's default (30s) plus
 * navigation/settle time can push the total past the route's `maxDuration`
 * (60s) — the function is then killed mid-shot and surfaces as the opaque
 * "page.screenshot: Target page, context or browser has been closed".
 */
const SCREENSHOT_TIMEOUT_MS = 15_000;

export const THUMBNAIL_VIEWPORT = { width: 1200, height: 750 } as const;

async function launchBrowser(): Promise<Browser> {
  if (IS_SERVERLESS) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: pw } = await import("playwright-core");
    return pw.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local dev: full playwright (devDependency) ships its own Chromium.
  const { chromium: pw } = await import("playwright");
  return pw.launch({ headless: true }) as unknown as Browser;
}

/**
 * Per-capture request gate: allows only http(s) requests to hosts that pass
 * the public-host SSRF guard. Verdicts are cached per host so each host is
 * DNS-checked once per capture.
 * @internal exported for tests.
 */
export function buildCaptureRequestGate(): (requestUrl: string) => Promise<boolean> {
  const hostVerdicts = new Map<string, boolean>();
  return async (requestUrl: string): Promise<boolean> => {
    try {
      const parsed = new URL(requestUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) return false;
      const cached = hostVerdicts.get(parsed.hostname);
      if (cached !== undefined) return cached;
      const allowed =
        !isDisallowedHost(parsed.hostname) && !(await hostResolvesToPrivate(parsed.hostname));
      hostVerdicts.set(parsed.hostname, allowed);
      return allowed;
    } catch {
      return false;
    }
  };
}

/**
 * Throws unless the final main-frame URL passes the caller's allowlist. The
 * per-request gate only enforces the public-host SSRF guard, so a redirect or
 * JS navigation could still land on an arbitrary public site — the URL that
 * actually gets photographed must satisfy the same allowlist as the initial
 * URL (audit A#6).
 * @internal exported for tests.
 */
export function assertFinalUrlAllowed(
  finalUrl: string,
  isAllowed: (url: URL) => boolean,
): void {
  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    throw new Error(`Thumbnail capture ended on an unparseable URL: ${finalUrl}`);
  }
  if (!isAllowed(parsed)) {
    throw new Error(
      `Thumbnail capture navigated off the allowlist: ${parsed.hostname || finalUrl}`,
    );
  }
}

/**
 * JPEG screenshot buffer of the page at `url`, or throws on navigation failure
 * or when the page ends up outside `isFinalUrlAllowed`.
 */
export async function captureThumbnailScreenshot(
  url: string,
  opts: { isFinalUrlAllowed: (finalUrl: URL) => boolean },
): Promise<Buffer> {
  let browser: Browser | null = null;
  // Stage tracking: "page.screenshot: Target page, context or browser has
  // been closed" alone says nothing about WHERE the capture died. Every
  // failure is rethrown with the stage so the route log pinpoints it.
  let stage = "launch";
  try {
    browser = await launchBrowser();
    stage = "new-page";
    const page = await browser.newPage({
      viewport: { ...THUMBNAIL_VIEWPORT },
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      // VADE (PR #426): service-worker requests bypass route interception —
      // block SWs outright (a thumbnail never needs them).
      serviceWorkers: "block",
    });

    // Abort every request whose host fails the public-host guard — Chromium
    // must never reach cloud metadata or other internal endpoints from the
    // serverless runtime. Details (VADE findings, PR #426):
    //  - CONTEXT-level routing so popup windows are covered too, not only the
    //    main page.
    //  - `route.fetch({ maxRedirects: 0 })` + fulfill: Playwright does NOT
    //    re-intercept internal redirect hops, so redirects must not be
    //    followed inside one interception. Fulfilling the raw 3xx makes the
    //    browser issue the next hop as a NEW request, which goes through this
    //    handler (and the host gate) again.
    const gate = buildCaptureRequestGate();
    await page.context().route("**/*", async (route) => {
      try {
        if (!(await gate(route.request().url()))) {
          return await route.abort("blockedbyclient");
        }
        const response = await route.fetch({ maxRedirects: 0 });
        return await route.fulfill({ response });
      } catch {
        return route.abort("failed").catch(() => undefined);
      }
    });

    stage = "navigate";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    // Best-effort settle: network idle + fonts, same pattern as inspector-capture.
    stage = "settle";
    await page
      .waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS })
      .catch(() => undefined);
    await page
      .evaluate(async () => {
        const fontsApi = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
        if (!fontsApi?.ready) return;
        try {
          await fontsApi.ready;
        } catch {
          // Fonts failing to load must not fail the thumbnail.
        }
      })
      .catch(() => undefined);
    await page.waitForTimeout(400).catch(() => undefined);

    // Re-check right before the shot: redirects/JS/meta-refresh may have moved
    // the main frame anywhere public during navigation or the settle waits.
    stage = "final-url-check";
    assertFinalUrlAllowed(page.url(), opts.isFinalUrlAllowed);

    stage = "screenshot";
    return await page.screenshot({
      type: "jpeg",
      quality: 70,
      fullPage: false,
      timeout: SCREENSHOT_TIMEOUT_MS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Thumbnail capture failed at stage "${stage}": ${message}`, {
      cause: error,
    });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

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
 * PR #426).
 */
import type { Browser } from "playwright-core";
import { hostResolvesToPrivate, isDisallowedHost } from "@/lib/ssrf-guard";

const IS_SERVERLESS = Boolean(process.env.VERCEL);

const NAVIGATION_TIMEOUT_MS = 25_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;

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

/** JPEG screenshot buffer of the page at `url`, or throws on navigation failure. */
export async function captureThumbnailScreenshot(url: string): Promise<Buffer> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
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

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    // Best-effort settle: network idle + fonts, same pattern as inspector-capture.
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

    return await page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

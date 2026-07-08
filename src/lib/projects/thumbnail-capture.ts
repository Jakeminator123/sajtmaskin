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
 * Callers are responsible for SSRF-guarding the URL BEFORE calling this.
 */
import type { Browser } from "playwright-core";

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

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
import type { Browser, Page } from "playwright-core";
import {
  applyCaptureRequestGate,
  assertFinalUrlAllowed as assertCaptureFinalUrlAllowed,
  buildCaptureRequestGate,
  launchCaptureBrowser,
} from "@/lib/capture/browser";
import { fetchWithPinnedDns } from "@/lib/capture/pinned-fetch";
import {
  PreviewHostBootPageError,
  PreviewProbeUnreadableError,
  classifyPreviewPageProbe,
  isPreviewHostBootPageError,
  isPreviewProbeUnreadableError,
} from "@/lib/capture/preview-boot-page";

// Startpunkten och SSRF-grinden bor numera i `@/lib/capture/browser` så
// inspector-capture kan använda exakt samma. Re-exporten håller den här
// modulens befintliga API intakt.
export { buildCaptureRequestGate };
export {
  isPreviewHostBootPageError,
  isPreviewProbeUnreadableError,
  PreviewHostBootPageError,
  PreviewProbeUnreadableError,
};

const NAVIGATION_TIMEOUT_MS = 25_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;
/**
 * Explicit screenshot deadline. Without it Playwright's default (30s) plus
 * navigation/settle time can push the total past the route's `maxDuration`
 * (60s) — the function is then killed mid-shot and surfaces as the opaque
 * "page.screenshot: Target page, context or browser has been closed".
 */
const SCREENSHOT_TIMEOUT_MS = 15_000;
/** Existing pause after fonts so the boot-page probe sees real content. */
const PRE_PROBE_SETTLE_MS = 400;
/**
 * Viewport-height steps through the page to trip `whileInView` / lazy sections.
 * Capped so the extra wait stays inside the route's 60s `maxDuration`.
 */
export const THUMBNAIL_SCROLL_MAX_STEPS = 10;
export const THUMBNAIL_SCROLL_STEP_DELAY_MS = 150;
/** Pause after returning to top, before the shot. Host-side only — no page rAF. */
export const THUMBNAIL_POST_SCROLL_SETTLE_MS = 500;
/**
 * Host-side cap for a single `page.evaluate` during visual settle. A generated
 * page that never yields (or patches timers) must not hang the route.
 */
export const THUMBNAIL_EVALUATE_DEADLINE_MS = 2_000;
/**
 * Best-effort GET that overlaps browser launch. Warms a cold preview so the
 * later navigation is less likely to photograph a shell. Not a second capture.
 */
export const THUMBNAIL_WARMUP_TIMEOUT_MS = 2_000;
const THUMBNAIL_WARMUP_MAX_BODY_BYTES = 64 * 1024;

export const THUMBNAIL_VIEWPORT = { width: 1200, height: 750 } as const;

/**
 * Controlled worst-case waits inside `captureThumbnailScreenshot` (no launch,
 * fonts, or blob upload). Must stay safely under the thumbnail route's 60s
 * `maxDuration` — see `thumbnailCaptureControlledBudgetMs`.
 */
export function thumbnailCaptureControlledBudgetMs(): number {
  return (
    NAVIGATION_TIMEOUT_MS +
    NETWORK_IDLE_TIMEOUT_MS +
    PRE_PROBE_SETTLE_MS +
    THUMBNAIL_SCROLL_MAX_STEPS * THUMBNAIL_SCROLL_STEP_DELAY_MS +
    THUMBNAIL_POST_SCROLL_SETTLE_MS +
    SCREENSHOT_TIMEOUT_MS +
    THUMBNAIL_WARMUP_TIMEOUT_MS
  );
}

/**
 * Race a promise against a host timer. Resolves `null` on timeout or rejection
 * — never throws. The losing promise is left running; the caller moves on.
 * @internal exported for tests.
 */
export async function withHostDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value) => value, () => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Scroll Y offsets from just below the fold down to the bottom, in viewport
 * steps. Empty when the page already fits in the viewport. If the page is
 * taller than `maxSteps` viewports the last step is snapped to the bottom so
 * footer `whileInView` sections still fire.
 * @internal exported for tests.
 */
export function planThumbnailScrollOffsets(args: {
  viewportHeight: number;
  pageHeight: number;
  maxSteps?: number;
}): number[] {
  const viewportHeight = Math.max(0, Math.floor(args.viewportHeight));
  const pageHeight = Math.max(0, Math.floor(args.pageHeight));
  const maxSteps = args.maxSteps ?? THUMBNAIL_SCROLL_MAX_STEPS;
  if (viewportHeight <= 0 || pageHeight <= 0 || maxSteps <= 0) return [];

  const maxScroll = Math.max(0, pageHeight - viewportHeight);
  if (maxScroll === 0) return [];

  const offsets: number[] = [];
  let y = viewportHeight;
  while (y < maxScroll && offsets.length < maxSteps) {
    offsets.push(y);
    y += viewportHeight;
  }
  if (offsets.length < maxSteps) {
    offsets.push(maxScroll);
  } else if (offsets[offsets.length - 1] !== maxScroll) {
    offsets[offsets.length - 1] = maxScroll;
  }
  return offsets;
}

async function warmupPreviewUrlBestEffort(url: string): Promise<void> {
  try {
    await fetchWithPinnedDns(url, {
      method: "GET",
      timeoutMs: THUMBNAIL_WARMUP_TIMEOUT_MS,
      maxBodyBytes: THUMBNAIL_WARMUP_MAX_BODY_BYTES,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });
  } catch {
    // Warmup must never change capture error semantics.
  }
}

/**
 * Trip lazy / `whileInView` content, return to top, then a short host-side
 * settle. All waits are host timers — a page that patches `setTimeout` / rAF
 * cannot hang this step. Entirely best-effort: a broken page still gets shot.
 */
async function settleThumbnailAnimationsBestEffort(page: Page): Promise<void> {
  const measured = await withHostDeadline(
    page.evaluate(() => {
      const doc = document.documentElement;
      return {
        viewportHeight: window.innerHeight || 0,
        pageHeight: Math.max(doc?.scrollHeight ?? 0, document.body?.scrollHeight ?? 0),
      };
    }),
    THUMBNAIL_EVALUATE_DEADLINE_MS,
  );

  const offsets =
    measured && typeof measured.viewportHeight === "number"
      ? planThumbnailScrollOffsets({
          viewportHeight: measured.viewportHeight || THUMBNAIL_VIEWPORT.height,
          pageHeight: measured.pageHeight,
        })
      : [];

  for (const y of offsets) {
    const scrolled = await withHostDeadline(
      page.evaluate((offset) => {
        window.scrollTo(0, offset);
        return true;
      }, y),
      THUMBNAIL_EVALUATE_DEADLINE_MS,
    );
    // Page never yielded: further offsets would each burn another deadline.
    if (scrolled !== true) break;
    await page.waitForTimeout(THUMBNAIL_SCROLL_STEP_DELAY_MS).catch(() => undefined);
  }

  await withHostDeadline(
    page.evaluate(() => {
      window.scrollTo(0, 0);
    }),
    THUMBNAIL_EVALUATE_DEADLINE_MS,
  );
  await page.waitForTimeout(THUMBNAIL_POST_SCROLL_SETTLE_MS).catch(() => undefined);
}

/**
 * Playwright-meddelanden som betyder att sidan, kontexten eller browsern
 * försvann under captureringen — previewen navigerade om mitt i skottet, eller
 * funktionens deadline dödade processen. Det är ett race mot en kosmetisk
 * bild, inte ett serverfel, och ska därför inte rapporteras som 5xx.
 */
const TRANSIENT_ABORT_PATTERNS: readonly RegExp[] = [
  /target (?:page, context or browser|closed)/i,
  /(?:page|context|browser) has been closed/i,
  /navigation (?:to [^\s]+ )?(?:is |was )?interrupted/i,
  /execution context was destroyed/i,
];

/**
 * Sant för avbrott som beror på att previewen rörde sig under captureringen.
 * Matchar mot hela meddelandet, så den stage-taggade wrappern nedan fungerar.
 */
export function isTransientCaptureAbort(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_ABORT_PATTERNS.some((pattern) => pattern.test(message));
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
  assertCaptureFinalUrlAllowed(finalUrl, isAllowed, "Thumbnail capture");
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
    const [, launchedBrowser] = await Promise.all([
      warmupPreviewUrlBestEffort(url),
      launchCaptureBrowser(),
    ]);
    browser = launchedBrowser;
    stage = "new-page";
    const page = await browser.newPage({
      viewport: { ...THUMBNAIL_VIEWPORT },
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      // VADE (PR #426): service-worker requests bypass route interception —
      // block SWs outright (a thumbnail never needs them).
      serviceWorkers: "block",
      // Skip intros on sites that honor prefers-reduced-motion (framer-motion,
      // CSS fade-ins). Sites that ignore the media query still get the scroll
      // settle below.
      reducedMotion: "reduce",
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
    await applyCaptureRequestGate(page);

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
    await page.waitForTimeout(PRE_PROBE_SETTLE_MS).catch(() => undefined);

    // Same detector as F2 product postcheck. A real start page must not be
    // frozen into "Mina projekt". An empty/failed probe is a different skip —
    // it must not be phrased as the host still showing its placeholder.
    stage = "boot-page-check";
    const bootProbe = await page
      .evaluate(() => ({
        title: document.title || "",
        h1: document.querySelector("h1")?.textContent?.trim() || null,
        bodyText: (document.body?.innerText || "").slice(0, 800),
      }))
      .catch(() => null);
    const probeKind = classifyPreviewPageProbe(bootProbe);
    if (probeKind === "boot_page") {
      throw new PreviewHostBootPageError(
        "Preview-host boot placeholder is still showing; thumbnail skipped.",
      );
    }
    if (probeKind === "unreadable") {
      throw new PreviewProbeUnreadableError(
        "Page probe returned no readable content; thumbnail skipped.",
      );
    }

    // After a live page is confirmed: scroll to trip whileInView / lazy
    // sections, return to top, then a short host-side settle. Best-effort so
    // a broken page still uses today's error semantics.
    stage = "visual-settle";
    await settleThumbnailAnimationsBestEffort(page);

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
    if (isPreviewHostBootPageError(error)) {
      // Keep the typed boot-page error so the route can skip without a 502.
      throw error instanceof PreviewHostBootPageError
        ? error
        : new PreviewHostBootPageError(
            error instanceof Error ? error.message : "Preview-host boot placeholder is still showing.",
          );
    }
    if (isPreviewProbeUnreadableError(error)) {
      throw error instanceof PreviewProbeUnreadableError
        ? error
        : new PreviewProbeUnreadableError(
            error instanceof Error ? error.message : "Page probe returned no readable content.",
          );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Thumbnail capture failed at stage "${stage}": ${message}`, {
      cause: error,
    });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

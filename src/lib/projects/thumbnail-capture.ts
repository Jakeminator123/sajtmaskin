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
 *
 * 12s (was 15s): a 1200×750 JPEG never needs the extra 3s. Those milliseconds
 * now sit on `document.fonts.ready` + the boot-page probe so launch + blob
 * upload keep the same ~5.6s cushion inside the 60s route.
 */
export const SCREENSHOT_TIMEOUT_MS = 12_000;
/**
 * Host-side cap for `document.fonts.ready`. A dead `@font-face` URL must
 * degrade the JPEG, not hang the route until the platform kills it.
 */
export const THUMBNAIL_FONT_READY_TIMEOUT_MS = 2_000;
/**
 * Host-side cap for the boot-page probe evaluate. A page that never yields
 * is the existing unreadable-skip, not an unbounded wait.
 */
export const THUMBNAIL_BOOT_PROBE_TIMEOUT_MS = 1_000;
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
 * Host-side cap for the height-measure `page.evaluate` during visual settle. A
 * generated page that never yields (or patches timers) must not hang the route.
 */
export const THUMBNAIL_EVALUATE_DEADLINE_MS = 2_000;
/**
 * Tighter cap for scroll/top `page.evaluate`s: a `scrollTo` either runs in
 * milliseconds or the page is too busy to bother. Keeping this small is what
 * lets a slow-but-alive page still get scroll steps after a worst-case 2s
 * measure — with a 2s cap here the reserve exceeded what a 6s phase budget
 * left, and tall slow pages (the feature's whole target) got zero steps
 * (bugbot medium, 2026-08-19).
 */
export const THUMBNAIL_SCROLL_EVALUATE_DEADLINE_MS = 800;
/**
 * Hard cap for the whole visual-settle phase (measure + scroll steps + reserved
 * top-scroll + post-settle). Enforced with host `Date.now()` checks — not an
 * outer Promise.race, which would leave evaluates running and able to scroll
 * during the screenshot.
 */
export const THUMBNAIL_SETTLE_PHASE_BUDGET_MS = 6_000;
/**
 * Best-effort GET that overlaps browser launch. Warms a cold preview so the
 * later navigation is less likely to photograph a shell. Not a second capture.
 */
export const THUMBNAIL_WARMUP_TIMEOUT_MS = 2_000;
const THUMBNAIL_WARMUP_MAX_BODY_BYTES = 64 * 1024;

export const THUMBNAIL_VIEWPORT = { width: 1200, height: 750 } as const;

/**
 * Playwright's `page.screenshot` awaits `document.fonts.ready` again in
 * `_preparePageForScreenshot` unless this env flag is set. We already spent
 * `THUMBNAIL_FONT_READY_TIMEOUT_MS` above; skip the second wait so a dead
 * `@font-face` degrades the JPEG instead of burning the screenshot timeout.
 * @internal exported for tests.
 */
export const THUMBNAIL_SCREENSHOT_SKIP_FONTS_READY_ENV =
  "PW_TEST_SCREENSHOT_NO_FONTS_READY";

/**
 * Controlled worst-case waits inside `captureThumbnailScreenshot`.
 * Still outside this sum, and only these: browser launch (overlapped by the
 * warmup GET) and the route-owned blob upload. Must stay safely under the
 * thumbnail route's 60s `maxDuration`.
 */
export function thumbnailCaptureControlledBudgetMs(): number {
  return (
    NAVIGATION_TIMEOUT_MS +
    NETWORK_IDLE_TIMEOUT_MS +
    THUMBNAIL_FONT_READY_TIMEOUT_MS +
    PRE_PROBE_SETTLE_MS +
    THUMBNAIL_BOOT_PROBE_TIMEOUT_MS +
    // Includes measure, scroll steps, reserved top-scroll and post-settle.
    THUMBNAIL_SETTLE_PHASE_BUDGET_MS +
    SCREENSHOT_TIMEOUT_MS
    // Warmup is omitted: it runs in parallel with `launchCaptureBrowser`,
    // and launch + blob upload stay outside this sum (~5.6s of the 60s route).
  );
}

/**
 * Time that must remain before starting another scroll step: the step's own
 * evaluate, the reserved top-scroll, and the post-settle. Scroll deadlines are
 * deliberately short (see THUMBNAIL_SCROLL_EVALUATE_DEADLINE_MS) so a
 * worst-case 2s measure still leaves room for several steps.
 */
export function settlePhaseStepReserveMs(): number {
  return (
    THUMBNAIL_SCROLL_EVALUATE_DEADLINE_MS +
    THUMBNAIL_SCROLL_EVALUATE_DEADLINE_MS +
    THUMBNAIL_POST_SCROLL_SETTLE_MS
  );
}

export function remainingSettlePhaseMs(startedAt: number, now: number): number {
  return Math.max(0, THUMBNAIL_SETTLE_PHASE_BUDGET_MS - (now - startedAt));
}

/** True when a scroll evaluate can finish and still leave top+post. */
export function canAffordSettleEvaluate(remainingMs: number): boolean {
  return remainingMs >= settlePhaseStepReserveMs();
}

/**
 * True when the height measure (2s cap) can finish and still leave the
 * reserved top-scroll + post-settle.
 */
export function canAffordSettleMeasure(remainingMs: number): boolean {
  return (
    remainingMs >=
    THUMBNAIL_EVALUATE_DEADLINE_MS +
      THUMBNAIL_SCROLL_EVALUATE_DEADLINE_MS +
      THUMBNAIL_POST_SCROLL_SETTLE_MS
  );
}

export function settleEvaluateDeadlineMs(remainingMs: number): number {
  return Math.min(THUMBNAIL_EVALUATE_DEADLINE_MS, Math.max(0, remainingMs));
}

/** Deadline for scroll/top evaluates — short by design, see the constant. */
export function settleScrollEvaluateDeadlineMs(remainingMs: number): number {
  return Math.min(THUMBNAIL_SCROLL_EVALUATE_DEADLINE_MS, Math.max(0, remainingMs));
}

/**
 * Which scroll offsets the phase budget still allows, assuming each completed
 * step costs `stepCostMs` (worst case: full scroll-evaluate deadline + step
 * delay).
 * @internal exported for tests.
 */
export function selectSettleScrollOffsets(args: {
  offsets: number[];
  remainingMs: number;
  stepCostMs?: number;
}): number[] {
  const stepCostMs =
    args.stepCostMs ?? THUMBNAIL_SCROLL_EVALUATE_DEADLINE_MS + THUMBNAIL_SCROLL_STEP_DELAY_MS;
  let remainingMs = args.remainingMs;
  const chosen: number[] = [];
  for (const y of args.offsets) {
    if (!canAffordSettleEvaluate(remainingMs)) break;
    chosen.push(y);
    remainingMs -= stepCostMs;
  }
  return chosen;
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
 *
 * A timed-out `page.evaluate` may still run later (orphan `scrollTo`). That is
 * an accepted best-effort risk; the top-scroll runs last to minimize it.
 */
async function settleThumbnailAnimationsBestEffort(page: Page): Promise<void> {
  const startedAt = Date.now();
  const remaining = () => remainingSettlePhaseMs(startedAt, Date.now());

  let offsets: number[] = [];
  if (canAffordSettleMeasure(remaining())) {
    const measured = await withHostDeadline(
      page.evaluate(() => {
        const doc = document.documentElement;
        return {
          viewportHeight: window.innerHeight || 0,
          pageHeight: Math.max(doc?.scrollHeight ?? 0, document.body?.scrollHeight ?? 0),
        };
      }),
      settleEvaluateDeadlineMs(remaining()),
    );
    if (measured && typeof measured.viewportHeight === "number") {
      offsets = planThumbnailScrollOffsets({
        viewportHeight: measured.viewportHeight || THUMBNAIL_VIEWPORT.height,
        pageHeight: measured.pageHeight,
      });
    }
  }

  // A scroll evaluate that TIMED OUT may still execute later as an orphan and
  // leave the page scrolled — so the top-scroll must run whenever a scroll was
  // ATTEMPTED, not only when one confirmably succeeded (bugbot medium).
  let attemptedScroll = false;
  for (const y of offsets) {
    if (!canAffordSettleEvaluate(remaining())) break;
    attemptedScroll = true;
    const scrolled = await withHostDeadline(
      page.evaluate((offset) => {
        window.scrollTo(0, offset);
        return true;
      }, y),
      settleScrollEvaluateDeadlineMs(remaining()),
    );
    // Page never yielded: further offsets would each burn another deadline.
    if (scrolled !== true) break;
    const reservedAfterStep =
      THUMBNAIL_SCROLL_EVALUATE_DEADLINE_MS + THUMBNAIL_POST_SCROLL_SETTLE_MS;
    const delayMs = Math.min(
      THUMBNAIL_SCROLL_STEP_DELAY_MS,
      Math.max(0, remaining() - reservedAfterStep),
    );
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs).catch(() => undefined);
    }
  }

  if (attemptedScroll) {
    // Verify the top-scroll landed; one cheap retry on timeout/failure. Still
    // best-effort — after the retry the shot proceeds regardless.
    const scrollToTop = () =>
      withHostDeadline(
        page.evaluate(() => {
          window.scrollTo(0, 0);
          return true;
        }),
        settleScrollEvaluateDeadlineMs(remaining()),
      );
    const topped = await scrollToTop();
    if (topped !== true) {
      await scrollToTop();
    }
  }
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

async function screenshotThumbnailJpeg(page: Page): Promise<Buffer> {
  const previous = process.env[THUMBNAIL_SCREENSHOT_SKIP_FONTS_READY_ENV];
  process.env[THUMBNAIL_SCREENSHOT_SKIP_FONTS_READY_ENV] = "1";
  try {
    return await page.screenshot({
      type: "jpeg",
      quality: 70,
      fullPage: false,
      timeout: SCREENSHOT_TIMEOUT_MS,
      // Playwright's default caret:"hide" mutates every editable element's
      // inline style for the shot; mid-hydration that fabricates a React
      // hydration mismatch + Next dev overlay in the captured page (see
      // capturePostcheckJpeg in product-postcheck.ts). No element is focused
      // in a thumbnail, so the caret cannot be visible anyway.
      caret: "initial",
    });
  } finally {
    if (previous === undefined) {
      delete process.env[THUMBNAIL_SCREENSHOT_SKIP_FONTS_READY_ENV];
    } else {
      process.env[THUMBNAIL_SCREENSHOT_SKIP_FONTS_READY_ENV] = previous;
    }
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
    await withHostDeadline(
      page.evaluate(async () => {
        const fontsApi = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
        if (!fontsApi?.ready) return;
        try {
          await fontsApi.ready;
        } catch {
          // Fonts failing to load must not fail the thumbnail.
        }
      }),
      THUMBNAIL_FONT_READY_TIMEOUT_MS,
    );
    await page.waitForTimeout(PRE_PROBE_SETTLE_MS).catch(() => undefined);

    // Same detector as F2 product postcheck. A real start page must not be
    // frozen into "Mina projekt". An empty/failed probe is a different skip —
    // it must not be phrased as the host still showing its placeholder.
    stage = "boot-page-check";
    const bootProbe = await withHostDeadline(
      page.evaluate(() => ({
        title: document.title || "",
        h1: document.querySelector("h1")?.textContent?.trim() || null,
        bodyText: (document.body?.innerText || "").slice(0, 800),
      })),
      THUMBNAIL_BOOT_PROBE_TIMEOUT_MS,
    );
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
    return await screenshotThumbnailJpeg(page);
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

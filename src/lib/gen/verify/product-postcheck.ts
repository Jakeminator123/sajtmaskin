import type { Browser, Page, Response as PlaywrightResponse } from "playwright-core";
import { load } from "cheerio";
import { applyCaptureRequestGate, launchCaptureBrowser } from "@/lib/capture/browser";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import {
  classifyPreviewPageProbe,
  type PreviewHostBootPageProbe,
} from "@/lib/capture/preview-boot-page";
import {
  fetchPreviewHostReadinessVerdict,
  type PreviewHostReadinessVerdict,
} from "@/lib/gen/preview/preview-host-client";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";
import {
  persistLiveReviewJpeg,
  type LiveReviewResult,
  type LiveReviewScreenshotSet,
  type ProductDomSummary,
} from "@/lib/gen/verify/live-review";

export type ProductPostcheckWarningCode =
  | "broken_anchor"
  | "broken_image"
  | "cta_no_handler"
  | "mobile_menu_failed"
  | "fake_form"
  | "runtime_crash"
  | "preview_boot_page"
  | "preview_probe_unreadable"
  | "hydration_mismatch"
  | "hydration_dom_loss"
  | "console_error"
  | "request_failed"
  | "http_error";

// Re-export so existing verify/postcheck callers keep a stable import path.
export {
  classifyPreviewPageProbe,
  isPreviewHostBootPage,
  type PreviewHostBootPageProbe,
} from "@/lib/capture/preview-boot-page";

export type ProductPostcheckSkipReason =
  | "feature_disabled"
  | "missing_preview_url"
  | "url_not_allowed"
  | "navigation_failed"
  | "playwright_unavailable"
  | "timeout"
  | "preview_superseded"
  | "preview_not_running"
  /**
   * Preview was still `starting`, `httpReady: false`, or the wait budget
   * ended. Retryable pending — must never carry an attestation.
   */
  | "preview_not_ready"
  | "capture_failed"
  /**
   * Chromium startade men dog innan navigeringen kom igång — `Target page,
   * context or browser has been closed`. Egen orsak sedan `SM-072`, skild från
   * catch-all-`runtime_error`: bara det här fallet är bevisad infrastruktur och
   * får därför den icke-anklagande ytan i buildern.
   */
  | "browser_crashed"
  | "runtime_error"
  /**
   * Another POST already holds the L6 single-flight claim for this
   * revision tuple. Non-final / retryable — not a product verdict.
   */
  | "claim_busy";

export type ProductPostcheckWarning = {
  code: ProductPostcheckWarningCode;
  message: string;
  selector?: string | null;
  text?: string | null;
  href?: string | null;
  src?: string | null;
  alt?: string | null;
  formId?: string | null;
  /** Pathname for the page being visited when the issue was captured. */
  route?: string | null;
  /**
   * Hur fyndet togs fram (t.ex. `rendered-dom+react-props`). Gör varje rad
   * granskningsbar i efterhand — OpenClaw-genomgång 2026-09-01.
   */
  detection?: string | null;
  /**
   * `high` när sonden kunde läsa Reacts props-expando och inte hittade någon
   * handler; `medium` när expandon inte gick att läsa (icke-React-sida eller
   * blockerad probe) och fyndet vilar på attribut-heuristik ensam.
   */
  confidence?: "high" | "medium" | null;
};

export type ProductPostcheckAttestation = {
  previewSessionId: string;
  lifecycleToken: string | null;
  filesRevision: string;
};

/**
 * A receipt is only a receipt when it names a real preview session.
 * `unbound` was a route-minted sentinel for "we never bound" — persist
 * already 409s it, but clients that only check object-presence treated it
 * as attested and continued into the quality gate.
 */
export function isProductPostcheckAttestation(
  value: unknown,
): value is ProductPostcheckAttestation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const previewSessionId =
    typeof input.previewSessionId === "string" ? input.previewSessionId.trim() : "";
  const filesRevision =
    typeof input.filesRevision === "string" ? input.filesRevision.trim() : "";
  if (!previewSessionId || previewSessionId === "unbound") return false;
  if (!filesRevision) return false;
  return input.lifecycleToken === null || typeof input.lifecycleToken === "string";
}

/**
 * A CTA href is meaningful only when it can actually navigate.
 * Placeholders (`#`, `#0`, `#!`, `#/`, `javascript:void(0)`) are dead
 * without a rendered handler — same class as an empty href.
 */
export function isMeaningfulCtaHref(href: string | null | undefined): boolean {
  const value = (href ?? "").trim();
  if (!value) return false;
  if (/^javascript:/i.test(value)) return false;
  if (value === "#") return false;
  if (/^#([/!?]*|\d+)$/.test(value)) return false;
  return true;
}

/** Raw browser-runtime signal collected during Playwright navigation. */
export type BrowserRuntimeIssue = {
  kind: "console" | "requestfailed" | "http";
  route: string;
  message: string;
  viewport?: "desktop" | "mobile";
  url?: string;
  status?: number;
};

export type ProductPostcheckResult = {
  ok: true;
  skipped: boolean;
  skippedReason: ProductPostcheckSkipReason | null;
  warnings: ProductPostcheckWarning[];
  warningCount: number;
  productBlocked: boolean;
  durationMs: number;
  checkedUrl: string | null;
  /** How many routes were actually visited (start URL + successful crawl hops). */
  routesChecked: number;
  /** Best-effort JPEG URLs. Missing/failed shots never become findings. */
  screenshots?: LiveReviewScreenshotSet | null;
  /** Compact start-page DOM facts for the live-review bundle. */
  domSummary?: ProductDomSummary | null;
  /** Critic verdict. Absent when the flag is off or the review was not eligible. */
  liveReview?: LiveReviewResult | null;
  /** Exact preview lifecycle/revision this result attests, set by the route. */
  attestation?: ProductPostcheckAttestation | null;
  /**
   * Unikt id för exakt DENNA verifieringskörning, myntat av API-routen.
   * Binder summary-, warning- och live-review-rader till samma körning så
   * "9 rapporterade / 7 persisterade"-klassen går att utreda i efterhand
   * (OpenClaw-genomgång 2026-09-01).
   */
  verificationRunId?: string | null;
};

type DomSnapshot = {
  anchors: Array<{ href: string; text: string | null; targetExists: boolean }>;
  images: Array<{ src: string; alt: string | null; naturalWidth: number; complete: boolean }>;
  ctas: Array<{
    tag: string;
    text: string | null;
    href: string | null;
    disabled: boolean;
    ariaDisabled: boolean;
    ariaControls: string | null;
    ariaExpanded: string | null;
    type: string | null;
    inForm: boolean;
    formAction: string | null;
    demoOnly: boolean;
    /** Kort CSS-aktig selektor (tag + id/klasser) för granskningsbara fynd. */
    selector?: string | null;
    /**
     * React fäster `__reactProps$<hash>` på host-noder (dev + prod). En
     * onClick/onPointerDown där — på elementet eller nära förälder — är en
     * riktig handler som DOM-attribut aldrig visar (SM: 7 falska
     * `cta_no_handler` på fungerande knappar, OpenClaw 2026-09-01).
     */
    hasReactHandler?: boolean;
    /** Om props-expandon alls gick att läsa — styr fyndets confidence. */
    reactPropsProbed?: boolean;
    /**
     * Knappen ligger i eller innehåller en länk med meningsfull destination
     * (inte tom, inte `#`). Elementets eget ankare räknas inte.
     */
    anchorWrapped?: boolean;
    ariaHasPopup?: string | null;
    onclickAttr?: boolean;
  }>;
  /** All CTA candidates in <main>, including responsive/hidden duplicates. */
  hydrationCtaLabels?: string[];
  forms: Array<{
    id: string | null;
    action: string | null;
    method: string | null;
    hasSubmitControl: boolean;
    disabled: boolean;
    ariaDisabled: boolean;
    demoOnly: boolean;
    text: string | null;
  }>;
};

export type ServerCtaBaseline = { labels: string[] };

type MobileMenuCheck =
  | { status: "not_applicable" }
  | { status: "passed" }
  | { status: "failed"; reason: string };

export type ProductDomEvaluation = {
  warnings: ProductPostcheckWarning[];
  productBlocked: boolean;
};

const DEFAULT_TIMEOUT_MS = 30_000;
/**
 * Fallback only: used when preview-host `/status` cannot be reached.
 * Do not raise this — a slow install has taken 44s; a longer guess just
 * moves the coin flip. The primary path asks `readinessState` / `httpReady`.
 */
const PREVIEW_BOOT_MAX_WAIT_MS = 20_000;
const PREVIEW_BOOT_RETRY_INTERVAL_MS = 2_000;
/** Soft deadline for extra crawl hops — API route maxDuration is 60s and Next
 *  dev compiles each route on demand. Checked before each additional route. */
export const CRAWL_DEADLINE_MS = 25_000;

/** Extend the crawl window by time spent on the start-page JPEG so capture
 *  cannot starve same-origin hops when live review is on. */
export function resolveCrawlDeadlineMs(baseDeadlineMs: number, captureDurationMs: number): number {
  return baseDeadlineMs + Math.max(0, captureDurationMs);
}
const MAX_CRAWL_ROUTES = 5;
/** Cap per advisory code so one broken loop cannot flood the log. */
const MAX_WARNINGS_PER_RUNTIME_CODE = 3;
const DEFAULT_ALLOWED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "vm-fly-jakem.fly.dev",
]);

const PREVIEW_BOOT_PAGE_MESSAGE =
  "Preview-host visar fortfarande start-/omstartssidan — sajten är inte ready än.";
const PREVIEW_PROBE_UNREADABLE_MESSAGE =
  "Produktkontrollen fick inget läsbart sidinnehåll och kan inte avgöra om sajten är klar.";

async function readPageProbe(page: Page): Promise<PreviewHostBootPageProbe | null> {
  return page
    .evaluate(() => ({
      title: document.title || "",
      h1: document.querySelector("h1")?.textContent?.trim() || null,
      bodyText: (document.body?.innerText || "").slice(0, 800),
    }))
    .catch(() => null);
}

function isHostRuntimeReady(verdict: PreviewHostReadinessVerdict): boolean {
  // `httpReady` is the host traffic gate (`publicRunning && ready`). An
  // explicit `false` means the runtime is not accepting traffic — never
  // override that with `readinessState === "ready"` (false-green).
  if (verdict.httpReady === false) return false;
  if (verdict.httpReady === true) return true;
  // Host omitted `httpReady` (older deploy). Fall back to the fields it did send.
  if (verdict.readinessState === "ready") return true;
  return verdict.readinessState === null && verdict.running;
}

/**
 * Ask the already-deployed `GET /preview/session/:id/status` until the host
 * knows (`ready` / `failed`) or the overall check deadline hits. This replaces
 * the HTML 20s guess — the host is the one that logs `Runtime ready`.
 */
async function askPreviewHostReadiness(params: {
  chatId: string;
  versionId: string;
  previewSessionId?: string | null;
  lifecycleToken?: string | null;
  filesRevision?: string | null;
  page: Page;
  deadlineAt: number;
}): Promise<PreviewHostReadinessVerdict | null> {
  const session = await getActivePreviewSessionAsync(params.chatId);
  if (!matchesExpectedPreviewTarget(session, params)) {
    throw new PreviewTargetSupersededError();
  }
  const previewSessionId = params.previewSessionId?.trim() || session?.previewSessionId?.trim() || "";
  // No session id: nothing to ask. Distinct from a transient fetch miss.
  if (!previewSessionId) return null;

  let last: PreviewHostReadinessVerdict | null = null;
  while (true) {
    const expected = expectedPreviewTarget(params);
    const verdict = await fetchPreviewHostReadinessVerdict(previewSessionId, {
      expectedVersionId: params.versionId,
      ...(expected ? { expectedLifecycleToken: expected.lifecycleToken } : {}),
    });
    if (verdict) {
      last = verdict;
      if (isHostRuntimeReady(verdict) || verdict.readinessState === "failed") {
        return verdict;
      }
    }
    // Transient miss (network / 5xx / host mid-restart) or still starting:
    // retry until the overall deadline. Do not abort the poll on the first miss.
    const remainingMs = params.deadlineAt - Date.now();
    if (remainingMs <= 0) return last;
    await params.page.waitForTimeout(
      Math.min(PREVIEW_BOOT_RETRY_INTERVAL_MS, remainingMs),
    );
  }
}

type ExpectedPreviewTarget = {
  previewSessionId?: string | null;
  lifecycleToken?: string | null;
  filesRevision?: string | null;
  versionId: string;
};

type ActivePreviewTarget = {
  previewSessionId?: string | null;
  lifecycleToken?: string | null;
  filesRevision?: string | null;
  versionId?: string | null;
} | null;

class PreviewTargetSupersededError extends Error {
  constructor() {
    super("Product Postcheck preview target was superseded");
    this.name = "PreviewTargetSupersededError";
  }
}

function expectedPreviewTarget(params: ExpectedPreviewTarget): {
  previewSessionId: string;
  lifecycleToken: string | null;
  filesRevision: string;
} | null {
  const previewSessionId = params.previewSessionId?.trim() || "";
  const filesRevision = params.filesRevision?.trim() || "";
  const hasLifecycleExpectation = Object.prototype.hasOwnProperty.call(
    params,
    "lifecycleToken",
  );
  if (!previewSessionId || !filesRevision || !hasLifecycleExpectation) return null;
  return {
    previewSessionId,
    lifecycleToken: params.lifecycleToken?.trim() || null,
    filesRevision,
  };
}

function matchesExpectedPreviewTarget(
  session: ActivePreviewTarget,
  params: ExpectedPreviewTarget,
): boolean {
  const expected = expectedPreviewTarget(params);
  // Direct helper consumers/tests without a preview-host fence keep the
  // legacy behavior. The HTTP route always supplies the complete tuple.
  if (!expected) return true;
  return Boolean(
    session &&
      session.versionId === params.versionId &&
      session.previewSessionId === expected.previewSessionId &&
      (session.lifecycleToken?.trim() || null) === expected.lifecycleToken &&
      session.filesRevision === expected.filesRevision,
  );
}

async function isExpectedPreviewTargetCurrent(
  chatId: string,
  params: ExpectedPreviewTarget,
): Promise<boolean> {
  if (!expectedPreviewTarget(params)) return true;
  const session = await getActivePreviewSessionAsync(chatId);
  return matchesExpectedPreviewTarget(session, params);
}

/**
 * HTML poll kept only for when `/status` cannot be fetched. Outcome is
 * classified by the caller as `preview_probe_unreadable` (not blocking) —
 * we must not pretend the host showed its start page.
 */
async function waitForPreviewPageToBecomeLive(params: {
  page: Page;
  startedAt: number;
  timeoutMs: number;
}): Promise<PreviewHostBootPageProbe | null> {
  const waitBudgetMs = Math.min(
    PREVIEW_BOOT_MAX_WAIT_MS,
    Math.max(0, params.timeoutMs),
  );
  const bootPollingStartedAt = Date.now();
  const deadlineAt = Math.min(
    bootPollingStartedAt + waitBudgetMs,
    params.startedAt + Math.max(0, params.timeoutMs),
  );
  const maxProbes = Math.max(
    1,
    Math.ceil(waitBudgetMs / PREVIEW_BOOT_RETRY_INTERVAL_MS) + 1,
  );
  let latestProbe: PreviewHostBootPageProbe | null = null;

  for (let probeIndex = 0; probeIndex < maxProbes; probeIndex += 1) {
    const probe = await readPageProbe(params.page);
    if (probe) {
      latestProbe = probe;
      if (classifyPreviewPageProbe(probe) === "live") return probe;
    }

    const remainingMs = deadlineAt - Date.now();
    if (probeIndex === maxProbes - 1 || remainingMs <= 0) break;
    await params.page.waitForTimeout(
      Math.min(PREVIEW_BOOT_RETRY_INTERVAL_MS, remainingMs),
    );
  }

  return latestProbe;
}

type PreviewReadinessDecision =
  | { action: "continue" }
  | {
      action: "warn";
      code: "preview_boot_page" | "preview_probe_unreadable";
      productBlocked: boolean;
    };

function decidePreviewReadiness(params: {
  probe: PreviewHostBootPageProbe | null;
  readiness: PreviewHostReadinessVerdict | null;
}): PreviewReadinessDecision {
  const kind = classifyPreviewPageProbe(params.probe);
  const hostReady = Boolean(params.readiness && isHostRuntimeReady(params.readiness));

  // A boot placeholder is a product defect only after the host says it is
  // ready — or that startup failed. `starting` / not-ready is timing
  // (cold VM / npm install) and must not block.
  if (kind === "boot_page") {
    if (hostReady || params.readiness?.readinessState === "failed") {
      return { action: "warn", code: "preview_boot_page", productBlocked: true };
    }
    if (params.readiness) {
      return { action: "warn", code: "preview_boot_page", productBlocked: false };
    }
    return {
      action: "warn",
      code: "preview_probe_unreadable",
      productBlocked: false,
    };
  }

  if (hostReady) {
    return { action: "continue" };
  }
  if (params.readiness) {
    if (kind === "unreadable") {
      return {
        action: "warn",
        code: "preview_probe_unreadable",
        productBlocked: false,
      };
    }
    return { action: "continue" };
  }
  if (kind === "live") return { action: "continue" };
  return {
    action: "warn",
    code: "preview_probe_unreadable",
    productBlocked: false,
  };
}

function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function allowedPreviewHosts(): Set<string> {
  const out = new Set(DEFAULT_ALLOWED_HOSTS);
  const configuredPreviewHost = normalizeHost(getPreviewHostBaseUrl());
  if (configuredPreviewHost) out.add(configuredPreviewHost);
  const appHost = normalizeHost(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL);
  if (appHost && (appHost === "localhost" || appHost.endsWith(".localhost"))) {
    out.add(appHost);
  }
  return out;
}

export function isAllowedProductPostcheckUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (allowedPreviewHosts().has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  // Local IPv6 hosts are normalized by URL as `[::1]` in some runtimes.
  if (host === "[::1]") return true;
  return false;
}

function textPreview(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return trimmed ? trimmed.slice(0, 120) : null;
}

const CTA_TEXT_PATTERN =
  /^(få|utforska|starta|kom igång|bygg|boka|kontakta|skicka|köp|läs mer|begär|offert|learn more|get started|contact|submit|send|book|request|quote)/i;
const CTA_CLASS_PATTERN = /(cta|button|btn|primary|action)/i;

function normalizedCtaLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE") || "";
  return normalized || null;
}

/** Parse the unhydrated document response, scoped to product content in <main>. */
export function extractServerCtaBaseline(html: string): ServerCtaBaseline {
  if (!html.trim()) return { labels: [] };
  const $ = load(html);
  const root = $("main").first();
  if (root.length === 0) return { labels: [] };
  const labels: string[] = [];
  root.find("a,button").each((_index, element) => {
    const node = $(element);
    if (node.is("[data-demo-only]") || node.closest("[data-demo-only]").length > 0) return;
    const text = node.text().trim().replace(/\s+/g, " ").slice(0, 160);
    const className = node.attr("class") || "";
    if (!CTA_TEXT_PATTERN.test(text) && !CTA_CLASS_PATTERN.test(className)) return;
    const label = normalizedCtaLabel(text);
    if (label) labels.push(label);
  });
  return { labels };
}

export function evaluateHydrationDomLoss(
  baseline: ServerCtaBaseline,
  snapshot: Pick<DomSnapshot, "hydrationCtaLabels">,
  issues: readonly BrowserRuntimeIssue[],
  startRoute: string,
): ProductDomEvaluation {
  const hydrationSeen = issues.some(
    (issue) =>
      issue.kind === "console" &&
      issue.route === startRoute &&
      isHydrationConsoleError(issue.message),
  );
  if (!hydrationSeen || baseline.labels.length === 0) {
    return { warnings: [], productBlocked: false };
  }

  const clientLabels = (snapshot.hydrationCtaLabels ?? [])
    .map(normalizedCtaLabel)
    .filter((label): label is string => Boolean(label));

  const remaining = new Map<string, number>();
  for (const label of clientLabels) remaining.set(label, (remaining.get(label) ?? 0) + 1);
  const missing = baseline.labels.filter((label) => {
    const count = remaining.get(label) ?? 0;
    if (count <= 0) return true;
    remaining.set(label, count - 1);
    return false;
  });
  if (missing.length === 0) {
    return { warnings: [], productBlocked: false };
  }
  return {
    warnings: [
      warning(
        "hydration_dom_loss",
        `Hydreringen tog bort ${missing.length} serverrenderad CTA från sidan.`,
        { route: startRoute, text: missing.slice(0, 3).join(" | ") || null },
      ),
    ],
    productBlocked: true,
  };
}

export function evaluateHydrationDomLossForViewports(params: {
  desktopBaseline: ServerCtaBaseline;
  desktopSnapshot: Pick<DomSnapshot, "hydrationCtaLabels">;
  mobileBaseline: ServerCtaBaseline;
  mobileSnapshot: Pick<DomSnapshot, "hydrationCtaLabels">;
  issues: readonly BrowserRuntimeIssue[];
  startRoute: string;
}): ProductDomEvaluation {
  const desktop = evaluateHydrationDomLoss(
    params.desktopBaseline,
    params.desktopSnapshot,
    params.issues.filter((issue) => issue.viewport === "desktop"),
    params.startRoute,
  );
  const mobile = evaluateHydrationDomLoss(
    params.mobileBaseline,
    params.mobileSnapshot,
    params.issues.filter((issue) => issue.viewport === "mobile"),
    params.startRoute,
  );
  return {
    warnings: [
      ...desktop.warnings.map((item) => ({
        ...item,
        message: `${item.message} (desktop)`,
      })),
      ...mobile.warnings.map((item) => ({
        ...item,
        message: `${item.message} (mobil)`,
      })),
    ],
    productBlocked: desktop.productBlocked || mobile.productBlocked,
  };
}

/** Browser-serializable CTA multiset capture shared by both viewport passes. */
function captureHydrationCtaLabelsInBrowser(): string[] {
  const root = document.querySelector("main");
  if (!root) return [];
  const ctaText =
    /^(få|utforska|starta|kom igång|bygg|boka|kontakta|skicka|köp|läs mer|begär|offert|learn more|get started|contact|submit|send|book|request|quote)/i;
  const ctaClass = /(cta|button|btn|primary|action)/i;
  return Array.from(root.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a,button"))
    .filter((element) => {
      if (
        element.hasAttribute("data-demo-only") ||
        element.closest("[data-demo-only]") !== null
      ) {
        return false;
      }
      const text = (element.innerText || element.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 160);
      const className = element.className?.toString?.() || "";
      return ctaText.test(text) || ctaClass.test(className);
    })
    .map((element) =>
      (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
    )
    .filter(Boolean);
}

async function serverCtaBaselineFromResponse(
  response: PlaywrightResponse | null,
): Promise<ServerCtaBaseline> {
  if (!response) return { labels: [] };
  const html = await response.text().catch(() => "");
  return extractServerCtaBaseline(html);
}

function warning(
  code: ProductPostcheckWarningCode,
  message: string,
  extra: Omit<ProductPostcheckWarning, "code" | "message"> = {},
): ProductPostcheckWarning {
  return { code, message, ...extra };
}

export function evaluateProductDomSnapshot(
  snapshot: DomSnapshot,
  mobileMenu: MobileMenuCheck,
): ProductDomEvaluation {
  const warnings: ProductPostcheckWarning[] = [];

  for (const anchor of snapshot.anchors) {
    if (!anchor.targetExists) {
      warnings.push(
        warning("broken_anchor", `Anchor target saknas för ${anchor.href}`, {
          href: anchor.href,
          text: textPreview(anchor.text),
        }),
      );
    }
  }

  for (const img of snapshot.images) {
    if (img.complete && img.naturalWidth <= 0) {
      warnings.push(
        warning("broken_image", `Bilden laddade inte: ${img.src}`, {
          src: img.src,
          alt: textPreview(img.alt),
        }),
      );
    }
  }

  for (const cta of snapshot.ctas) {
    if (cta.disabled || cta.ariaDisabled || cta.demoOnly) continue;
    // Renderade handler-signaler (OpenClaw 2026-09-01): en React-onClick i
    // props-expandon, en riktig länk runt/inuti knappen, ett popup-attribut
    // eller ett rått onclick-attribut är alla verkliga handlingar som de
    // gamla attribut-heuristikerna missade → 7 falska cta_no_handler på en
    // fullt fungerande sajt (chat 63d0992f).
    //
    // `anchorWrapped` är bara knappsignalen från den fixen. Ett `<a>` som
    // närmast matchar sig självt (closest börjar på elementet) får inte
    // räkna en tom/`#`-href som handler — det är den klassiska döda CTA:n.
    const wrappedByRealLink =
      cta.tag.toLowerCase() !== "a" && cta.anchorWrapped === true;
    const hasRenderedHandler =
      cta.hasReactHandler === true ||
      wrappedByRealLink ||
      cta.onclickAttr === true ||
      Boolean(cta.ariaHasPopup?.trim());
    const ctaConfidence: "high" | "medium" =
      cta.reactPropsProbed === true ? "high" : "medium";
    const ctaDetection =
      cta.reactPropsProbed === true ? "rendered-dom+react-props" : "rendered-dom";
    if (cta.tag === "a") {
      const href = cta.href?.trim() || "";
      if (!isMeaningfulCtaHref(href) && !hasRenderedHandler) {
        warnings.push(
          warning("cta_no_handler", "CTA-länk saknar mål.", {
            text: textPreview(cta.text),
            href: cta.href,
            selector: cta.selector ?? "a",
            detection: ctaDetection,
            confidence: ctaConfidence,
          }),
        );
      }
      continue;
    }

    const hasAction =
      hasRenderedHandler ||
      cta.inForm ||
      cta.type === "submit" ||
      Boolean(cta.ariaControls?.trim()) ||
      typeof cta.ariaExpanded === "string";
    if (!hasAction) {
      warnings.push(
        warning("cta_no_handler", "CTA-knapp saknar tydlig handling.", {
          text: textPreview(cta.text),
          selector: cta.selector ?? "button",
          detection: ctaDetection,
          confidence: ctaConfidence,
        }),
      );
    }
  }

  for (const form of snapshot.forms) {
    if (form.disabled || form.ariaDisabled || form.demoOnly) continue;
    if (form.action?.trim()) continue;
    if (form.hasSubmitControl) {
      warnings.push(
        warning("fake_form", "Formulär ser aktivt ut men saknar action/integration.", {
          formId: form.id,
          text: textPreview(form.text),
        }),
      );
    }
  }

  if (mobileMenu.status === "failed") {
    warnings.push(
      warning("mobile_menu_failed", `Mobilmeny kunde inte verifieras: ${mobileMenu.reason}`),
    );
  }

  const brokenAnchorCount = warnings.filter((item) => item.code === "broken_anchor").length;
  const productBlocked =
    warnings.some((item) => item.code === "mobile_menu_failed") ||
    brokenAnchorCount >= 2;

  return { warnings, productBlocked };
}

/**
 * Render-fatal browser-runtime error patterns. An uncaught `pageerror`
 * matching one of these tears down the React tree → guaranteed white screen,
 * even though the dev-server booted and the build/typecheck passed. This is
 * the F2 false-green that M#f2et describes (e.g. a JSX element passed where a
 * React component was expected → "Element type is invalid ... got: object").
 * Matching errors block the product check so the version can never read as
 * solid green.
 *
 * Deliberately scoped to the React-STRUCTURAL class only. These messages are
 * unambiguous tree-fatal crashes and do not appear in benign third-party
 * throws, so they can block WITHOUT a fragile, timing-sensitive blank-screen
 * probe and without over-blocking F2 (Bugbot #321 — the earlier
 * ambiguous-error + render-health gating was racy across viewports/hydration).
 * Generic JS throws (`is not a function`, `Cannot read properties of
 * undefined`, hydration warnings, ...) can be non-fatal/third-party and are
 * intentionally NOT blocked here; catching that class safely needs a robust
 * runtime render-health signal and is tracked as a follow-up.
 */
const RENDER_FATAL_ERROR_PATTERNS: readonly RegExp[] = [
  /Element type is invalid/i,
  /Minified React error/i,
  /Objects are not valid as a React child/i,
  /Rendered (?:more|fewer) hooks than/i,
  /Maximum update depth exceeded/i,
];

export function isRenderFatalError(message: string): boolean {
  if (!message) return false;
  return RENDER_FATAL_ERROR_PATTERNS.some((re) => re.test(message));
}

/**
 * Runs in the BROWSER (serialized via `page.evaluate`). Detects the Next.js dev
 * error overlay, which Next renders into `nextjs-portal`'s open shadow root
 * whenever a render/runtime error fires — INCLUDING the ambiguous class the
 * structural pattern list deliberately skips (e.g. "Cannot read properties of
 * undefined" during render → Next shows its overlay). The overlay lives in a
 * separate portal, not in the app content, so its presence is an unambiguous
 * "preview crashed" signal that does not over-block a normally-rendered page
 * (Codex #321 P1). Degrades to `false` if Next changes its markers — no
 * over-block.
 */
function detectNextErrorOverlayInBrowser(): boolean {
  const portal = document.querySelector("nextjs-portal");
  const shadow = portal ? portal.shadowRoot : null;
  if (!shadow) return false;
  return Boolean(
    shadow.querySelector(
      "[data-nextjs-dialog], [data-nextjs-dialog-overlay], [data-nextjs-error-overlay], #nextjs__container_errors_label",
    ),
  );
}

/**
 * Classify the runtime health of the loaded preview (desktop AND mobile
 * viewports). Two block signals, both meaning "the preview is dead":
 *   1. a render-fatal `pageerror` (the unambiguous structural class), or
 *   2. the Next.js dev error overlay is present (`options.nextErrorOverlay`) —
 *      this also covers the ambiguous render crashes the pattern list skips.
 * Benign/ambiguous throws on a page that still renders are ignored, so F2 stays
 * fast and is not over-blocked. Pure + deterministic — unit-testable.
 */
export function evaluateRuntimeErrors(
  pageErrors: readonly string[],
  options: { nextErrorOverlay?: boolean } = {},
): ProductDomEvaluation {
  const warnings: ProductPostcheckWarning[] = [];
  const seen = new Set<string>();
  let productBlocked = false;
  if (options.nextErrorOverlay) {
    productBlocked = true;
    warnings.push(
      warning(
        "runtime_crash",
        "Next.js-felöverlägg visas — previewen kraschade vid körning.",
      ),
    );
  }
  for (const raw of pageErrors) {
    const message = typeof raw === "string" ? raw.trim() : "";
    if (!message || !isRenderFatalError(message)) continue;
    const key = message.slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    productBlocked = true;
    warnings.push(
      warning(
        "runtime_crash",
        `Preview kraschade vid körning: ${textPreview(message) ?? message.slice(0, 120)}`,
      ),
    );
    if (warnings.length >= 5) break;
  }
  return { warnings, productBlocked };
}

/** Next-dev / React-devtools console noise that is never a site defect. */
export function shouldIgnoreConsoleError(text: string): boolean {
  if (!text || !text.trim()) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("download the react devtools") ||
    lower.includes("fast refresh") ||
    lower.includes("[hmr]") ||
    lower.includes("webpack-hmr") ||
    lower.includes("turbopack-hmr") ||
    lower.includes("_next/hmr")
  );
}

/**
 * Next-dev HMR-socketen, oavsett vilket namn den bär.
 *
 * Next 16.3 döpte om `/_next/webpack-hmr` till `/_next/hmr`; Turbopack har
 * sitt eget namn, och genererade sajter kan ligga kvar på en äldre Next.
 * Handskakningen misslyckas ofta på Fly, där edge-proxyn inte alltid klarar
 * WS genom chatId-prefixet — och en HMR-socket som inte kommer upp är brus,
 * inte en produktdefekt. Missar den här listan det aktuella namnet räknas
 * bruset som fel mot användarens sajt (`SM-062`).
 */
export function isHmrUrl(url: string): boolean {
  return /\/_next\/(?:webpack-hmr|turbopack-hmr|hmr)(?:\/|$|\?)/.test((url || "").toLowerCase());
}

/**
 * Failed-request noise from the Next-dev proxy and from our own SSRF gate.
 * `applyCaptureRequestGate` aborts disallowed requests with exactly
 * `blockedbyclient` — without that filter our guard would be reported as a
 * defect in the user's site.
 *
 * `ERR_ABORTED` sväljs medvetet trots att det kan dölja ett äkta avbrott:
 * crawlens `page.goto` avbryter allt som fortfarande är i luften från
 * föregående route, så alternativet är att rapportera vår egen navigering som
 * fel i användarens sajt. För rådgivande diagnostik är den falska positiven
 * dyrare än den missade signalen.
 */
export function shouldIgnoreFailedRequest(url: string, errorText: string): boolean {
  const err = (errorText || "").toLowerCase();
  if (
    err.includes("err_blocked_by_client") ||
    err.includes("blockedbyclient") ||
    err.includes("err_aborted")
  ) {
    return true;
  }
  const u = (url || "").toLowerCase();
  if (isHmrUrl(u)) return true;
  if (u.endsWith(".map")) return true;
  return false;
}

/**
 * HTTP status noise from favicon/source-map/HMR and 4xx probes of `/_next/`
 * assets. Document-level 4xx/5xx are never ignored.
 */
export function shouldIgnoreHttpStatus(url: string, status: number): boolean {
  const u = (url || "").toLowerCase();
  if (u.includes("/favicon.ico")) return true;
  if (u.endsWith(".map")) return true;
  if (isHmrUrl(u)) return true;
  if (status >= 400 && status < 500) {
    try {
      const path = new URL(url).pathname;
      if (path.startsWith("/_next/")) return true;
    } catch {
      if (u.includes("/_next/")) return true;
    }
  }
  return false;
}

/**
 * React hydration mismatch wording. Deliberately does NOT match the bare
 * word "mismatch" — that is too broad and catches unrelated errors.
 */
export function isHydrationConsoleError(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("hydration failed") ||
    lower.includes("hydrating") ||
    lower.includes("server rendered html didn't match") ||
    lower.includes("didn't match the client") ||
    lower.includes("text content does not match") ||
    // React 18 wording uses "did not match"; keep both so we do not miss
    // the common console string while still avoiding bare "mismatch".
    lower.includes("text content did not match") ||
    lower.includes("server-rendered")
  );
}

/**
 * Classify collected browser-runtime issues into advisory warnings.
 * Always returns `productBlocked: false` — advisory-only is deliberate;
 * flipping these to blockers is a separate owner decision (parked plan
 * `docs/plans/archived/2026-08-05-hydration-reparationskedja.md` —
 * step 4 is blocked on measuring this data first).
 */
export function evaluateBrowserRuntimeIssues(
  issues: readonly BrowserRuntimeIssue[],
): ProductDomEvaluation {
  const warnings: ProductPostcheckWarning[] = [];
  const seen = new Set<string>();
  const perCode = new Map<ProductPostcheckWarningCode, number>();

  for (const issue of issues) {
    let code: ProductPostcheckWarningCode;
    if (issue.kind === "console") {
      if (shouldIgnoreConsoleError(issue.message)) continue;
      code = isHydrationConsoleError(issue.message)
        ? "hydration_mismatch"
        : "console_error";
    } else if (issue.kind === "requestfailed") {
      if (shouldIgnoreFailedRequest(issue.url ?? "", issue.message)) continue;
      code = "request_failed";
    } else {
      if (shouldIgnoreHttpStatus(issue.url ?? "", issue.status ?? 0)) continue;
      code = "http_error";
    }

    const count = perCode.get(code) ?? 0;
    if (count >= MAX_WARNINGS_PER_RUNTIME_CODE) continue;

    const dedupeKey = `${code}|${issue.route}|${issue.message.slice(0, 200)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    perCode.set(code, count + 1);

    warnings.push(
      warning(code, `[${issue.route}] ${issue.message}`, {
        route: issue.route,
        href: issue.url ?? null,
      }),
    );
  }

  return {
    warnings: dropDerivedScriptTagWarnings(warnings),
    productBlocked: false,
  };
}

/**
 * React's "Encountered a script tag while rendering React component" warning
 * is a consequence of a hydration remount in our prod data — it never appears
 * without a hydration mismatch on the same route. Drop it only then, so a
 * component that itself renders `<script>` (broken analytics/init) still
 * surfaces as a console_error.
 */
function isScriptTagWhileRenderingWarning(text: string): boolean {
  return text
    .toLowerCase()
    .includes("encountered a script tag while rendering react component");
}

function dropDerivedScriptTagWarnings(
  warnings: ProductPostcheckWarning[],
): ProductPostcheckWarning[] {
  const hydrationRoutes = new Set(
    warnings
      .filter((w) => w.code === "hydration_mismatch")
      .map((w) => w.route ?? ""),
  );
  if (hydrationRoutes.size === 0) return warnings;
  return warnings.filter(
    (w) =>
      w.code !== "console_error" ||
      !isScriptTagWhileRenderingWarning(w.message) ||
      !hydrationRoutes.has(w.route ?? ""),
  );
}

/**
 * Pick same-origin in-app routes to crawl after the start URL.
 * Stable document order; at most `max` entries; start URL / hash-only /
 * cross-origin / outside the preview pathname prefix are dropped.
 */
export function selectCrawlRoutes(
  hrefs: readonly string[],
  startUrl: string,
  max: number,
): string[] {
  if (max <= 0 || hrefs.length === 0) return [];
  let start: URL;
  try {
    start = new URL(startUrl);
  } catch {
    return [];
  }
  const prefixRaw = start.pathname.replace(/\/$/, "") || "/";
  const seen = new Set<string>();
  const startKey = (() => {
    const u = new URL(startUrl);
    u.hash = "";
    u.search = "";
    return u.href;
  })();
  seen.add(startKey);

  const out: string[] = [];
  for (const href of hrefs) {
    if (typeof href !== "string" || !href || href.startsWith("#")) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, startUrl);
    } catch {
      continue;
    }
    if (resolved.origin !== start.origin) continue;
    resolved.hash = "";
    resolved.search = "";
    const pathNorm = resolved.pathname.replace(/\/$/, "") || "/";
    if (pathNorm === prefixRaw) continue;
    // Previewen ligger normalt under `/{chatId}`, och prefixet hindrar att
    // crawlen vandrar ut ur chattens egen sajt. Ligger den i roten (lokal
    // dev) är varje same-origin-path innanför sajten — utan det här
    // undantaget blir `${prefixRaw}/` = "//" och ingenting matchar alls.
    if (prefixRaw !== "/" && !pathNorm.startsWith(`${prefixRaw}/`)) continue;
    if (seen.has(resolved.href)) continue;
    seen.add(resolved.href);
    out.push(resolved.href);
    if (out.length >= max) break;
  }
  return out;
}

function pathnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname || "/";
  } catch {
    return "/";
  }
}

/**
 * Navigation must be tested BEFORE the browser family. Playwright's
 * navigation errors mention the browser in their own text — prod 2026-08-08
 * produced `page.goto: Target page, context or browser has been closed` while
 * navigating to the Fly preview, which the old order labelled
 * `playwright_unavailable`. That reads as "Chromium was never installed", so
 * three consecutive runs looked like a known infra gap instead of the preview
 * navigation failure they were.
 */
const NAVIGATION_ERROR_PATTERN = /page\.goto|navigating\s+to|navigation|net::|err_/i;
/** Browser launched, but its first page/context died before navigation began. */
const POST_LAUNCH_TARGET_CLOSED_PATTERN =
  /(?:browser\.)?newpage.*target page, context or browser has been closed/i;
/** Genuine launch failures: the binary is missing or the launch itself threw. */
const BROWSER_UNAVAILABLE_PATTERN =
  /playwright|browsertype\.launch|failed\s+to\s+launch|executable\s+doesn'?t\s+exist|browser/i;
/** JPEG/screenshot persist or page.screenshot blew up after the preview was up. */
const CAPTURE_ERROR_PATTERN = /screenshot|capturejpeg|capture failed|persist.*jpeg/i;

export function productPostcheckSkipReasonFromError(err: unknown): ProductPostcheckSkipReason {
  if (!(err instanceof Error)) return "runtime_error";
  if (CAPTURE_ERROR_PATTERN.test(err.message)) return "capture_failed";
  if (/timeout/i.test(err.message)) return "timeout";
  if (NAVIGATION_ERROR_PATTERN.test(err.message)) return "navigation_failed";
  if (POST_LAUNCH_TARGET_CLOSED_PATTERN.test(err.message)) return "browser_crashed";
  if (BROWSER_UNAVAILABLE_PATTERN.test(err.message)) return "playwright_unavailable";
  return "runtime_error";
}

function skippedResult(
  reason: ProductPostcheckSkipReason,
  durationMs: number,
  checkedUrl: string | null = null,
  routesCheckedCount = 0,
): ProductPostcheckResult {
  return {
    ok: true,
    skipped: true,
    skippedReason: reason,
    warnings: [],
    warningCount: 0,
    productBlocked: false,
    durationMs,
    checkedUrl,
    routesChecked: routesCheckedCount,
  };
}

const SCREENSHOT_TIMEOUT_MS = 15_000;

/**
 * Best-effort viewport JPEG. A throw here must never become a postcheck finding.
 *
 * `caret: "initial"` is load-bearing: Playwright's default (`"hide"`) sets
 * inline `caret-color: transparent !important` on every input/textarea/
 * contenteditable for the duration of the shot. A screenshot taken while React
 * is still hydrating (the mobile pass shoots BEFORE its overlay probe) makes
 * hydration see attributes the server never rendered → hydration mismatch →
 * Next dev error overlay → our overlay probe reports `runtime_crash` on a
 * healthy site (prod chat 660bfe4b v1, 2026-08-31: every form field flagged
 * with exactly this style). Nothing is ever focused in these captures, so a
 * visible caret cannot occur anyway.
 */
export async function capturePostcheckJpeg(page: Page): Promise<Buffer | null> {
  try {
    return await page.screenshot({
      type: "jpeg",
      quality: 70,
      fullPage: false,
      timeout: SCREENSHOT_TIMEOUT_MS,
      caret: "initial",
    });
  } catch {
    return null;
  }
}

function buildDomSummary(
  snapshot: DomSnapshot,
  probe: PreviewHostBootPageProbe | null,
): ProductDomSummary {
  return {
    title: probe?.title?.trim() || null,
    headings: probe?.h1 ? [probe.h1] : [],
    ctaLabels: snapshot.ctas
      .map((cta) => cta.text)
      .filter((text): text is string => Boolean(text))
      .slice(0, 12),
    imageCount: snapshot.images.length,
    formCount: snapshot.forms.length,
  };
}

async function persistCapturedScreenshots(params: {
  chatId: string;
  versionId: string;
  userId?: string;
  filesRevision?: string | null;
  desktop: Buffer | null;
  mobile: Buffer | null;
}): Promise<LiveReviewScreenshotSet | null> {
  if (!params.desktop && !params.mobile) return null;
  const [desktopUrl, mobileUrl] = await Promise.all([
    params.desktop
      ? persistLiveReviewJpeg({
          buffer: params.desktop,
          chatId: params.chatId,
          versionId: params.versionId,
          viewport: "desktop",
          userId: params.userId,
          filesRevision: params.filesRevision,
        })
      : Promise.resolve(null),
    params.mobile
      ? persistLiveReviewJpeg({
          buffer: params.mobile,
          chatId: params.chatId,
          versionId: params.versionId,
          viewport: "mobile",
          userId: params.userId,
          filesRevision: params.filesRevision,
        })
      : Promise.resolve(null),
  ]);
  return { desktopUrl, mobileUrl };
}

export async function runProductPostcheck(params: {
  previewUrl: string;
  chatId: string;
  versionId: string;
  timeoutMs?: number;
  captureEnabled?: boolean;
  captureUserId?: string;
  filesRevision?: string | null;
  previewSessionId?: string | null;
  lifecycleToken?: string | null;
}): Promise<ProductPostcheckResult> {
  const startedAt = Date.now();
  const previewUrl = params.previewUrl.trim();
  if (!previewUrl) return skippedResult("missing_preview_url", 0, null);
  if (!isAllowedProductPostcheckUrl(previewUrl)) {
    return skippedResult("url_not_allowed", Date.now() - startedAt, previewUrl);
  }
  if (!(await isExpectedPreviewTargetCurrent(params.chatId, params))) {
    return skippedResult("preview_superseded", Date.now() - startedAt, previewUrl);
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let mobilePage: Page | null = null;
  // Uncaught runtime exceptions captured across BOTH viewports. Hoisted to
  // function scope so the catch below can still surface a render-fatal crash
  // that was captured before a later phase (mobile nav / menu probe) threw —
  // otherwise that crash would be silently downgraded to a skip (Bugbot #321).
  const pageErrors: string[] = [];
  // Console / network issues — same hoist so a later-phase throw still classifies
  // whatever was already captured on earlier routes.
  const browserRuntimeIssues: BrowserRuntimeIssue[] = [];
  // Route-etiketten är best-effort: lyssnarna är asynkrona, så ett svar som
  // fortfarande är i luften när crawlen navigerar vidare kan hamna på nästa
  // route. Raderna är rådgivande diagnostik, inte grund för beslut per sida.
  let currentRoute = pathnameOf(previewUrl);
  let routesChecked = 0;
  // Startsidans overlay-utfall, plus om crawlen hunnit navigera bort
  // desktop-sidan. `catch`-blocket nedan omprövar overlayn, och efter en
  // crawl-navigering står `page` inte längre på startsidan: utan de här
  // två skulle omprövningen både kunna MISSA en död startsida (grönt fast
  // previewen är trasig) och blockera på en undersida som happy-pathen
  // medvetet bara varnar för.
  let startPageOverlaySeen = false;
  let desktopLeftStartUrl = false;
  let desktopServerCtaBaseline: ServerCtaBaseline = { labels: [] };
  let mobileServerCtaBaseline: ServerCtaBaseline = { labels: [] };

  const attachRuntimeListeners = (target: Page, viewport: "desktop" | "mobile") => {
    // Listeners MUST be registered before page.goto — a post-nav listener
    // misses everything that fired during navigation/boot.
    target.on("pageerror", (error) => {
      pageErrors.push(error?.message ?? String(error));
    });
    target.on("console", (msg) => {
      if (msg.type() !== "error") return;
      browserRuntimeIssues.push({
        kind: "console",
        route: currentRoute,
        message: msg.text(),
        viewport,
      });
    });
    target.on("requestfailed", (request) => {
      const errorText = request.failure()?.errorText ?? "unknown";
      browserRuntimeIssues.push({
        kind: "requestfailed",
        route: currentRoute,
        message: `${request.method()} ${request.url()}: ${errorText}`,
        viewport,
        url: request.url(),
      });
    });
    target.on("response", (response) => {
      const status = response.status();
      if (status < 400) return;
      browserRuntimeIssues.push({
        kind: "http",
        route: currentRoute,
        message: `${status} ${response.url()}`,
        viewport,
        url: response.url(),
        status,
      });
    });
  };

  try {
    // Samma startpunkt som miniatyrer och inspector-capture. Ett rakt
    // `import("playwright")` såg ut att fungera — men `playwright` är en
    // devDependency vars Chromium aldrig installeras på Vercel, så launchen
    // kastade i prod, fångades av catchen nedan och blev `playwright_unavailable`
    // → `skipped: true, productBlocked: false`. Kontrollen har alltså aldrig
    // kört i produktion och rapporterade tyst grönt. Exakt den fällan som
    // `@/lib/capture/browser` skapades för att stänga.
    browser = await launchCaptureBrowser();
    page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      // Service-worker-requests går förbi route-interception (PR #426).
      serviceWorkers: "block",
    });
    await applyCaptureRequestGate(page);

    // Capture uncaught runtime exceptions while the preview boots. A
    // render-fatal crash (e.g. "Element type is invalid") blanks the page even
    // though the dev-server is up and the build passed — without this the F2
    // design preview reads as solid green (M#f2et). Classified by
    // `evaluateRuntimeErrors` below; only render-fatal crashes block.
    // Also console/network listeners (advisory) — before goto.
    attachRuntimeListeners(page, "desktop");

    currentRoute = pathnameOf(previewUrl);
    const initialResponse = await page.goto(previewUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    desktopServerCtaBaseline = await serverCtaBaselineFromResponse(initialResponse);
    await page.waitForLoadState("networkidle", { timeout: Math.min(8_000, timeoutMs) }).catch(() => {});
    routesChecked = 1;

    // Ask the host before concluding the site is not ready. HTML alone lied
    // in prod 2026-08-14: empty Chromium (`/tmp` 6 MB free) was logged as
    // preview_boot_page, and the 20s HTML guess missed Runtime ready by 0.9s.
    const firstProbe = await readPageProbe(page);
    let readinessDecision: PreviewReadinessDecision;
    if (classifyPreviewPageProbe(firstProbe) === "live") {
      readinessDecision = { action: "continue" };
    } else {
      const readiness = await askPreviewHostReadiness({
        chatId: params.chatId,
        versionId: params.versionId,
        previewSessionId: params.previewSessionId,
        lifecycleToken: params.lifecycleToken,
        filesRevision: params.filesRevision,
        page,
        deadlineAt: startedAt + timeoutMs,
      });
      if (readiness) {
        // Reload only after the host is ready so Chromium is not still sitting
        // on the placeholder HTML from goto. A boot page may block only then.
        // Keep `firstProbe` for the live fast-path above — it is stale after
        // the status wait (empty → boot page was the 2026-08-14 case).
        if (isHostRuntimeReady(readiness)) {
          const readyResponse = await page
            .reload({
              waitUntil: "domcontentloaded",
              timeout: Math.min(8_000, timeoutMs),
            })
            .catch(() => null);
          desktopServerCtaBaseline = await serverCtaBaselineFromResponse(readyResponse);
          await page
            .waitForLoadState("networkidle", { timeout: Math.min(8_000, timeoutMs) })
            .catch(() => {});
        }
        const freshProbe = await readPageProbe(page);
        readinessDecision = decidePreviewReadiness({
          probe: freshProbe,
          readiness,
        });
      } else {
        const afterPoll = await waitForPreviewPageToBecomeLive({
          page,
          startedAt,
          timeoutMs,
        });
        if (classifyPreviewPageProbe(afterPoll) === "live") {
          // The host's boot page can refresh itself to the live app while the
          // status endpoint is unavailable. Reload once so the unhydrated HTML
          // baseline belongs to that live app rather than the old boot shell.
          const liveResponse = await page
            .reload({
              waitUntil: "domcontentloaded",
              timeout: Math.min(8_000, timeoutMs),
            })
            .catch(() => null);
          desktopServerCtaBaseline = await serverCtaBaselineFromResponse(liveResponse);
          await page
            .waitForLoadState("networkidle", { timeout: Math.min(8_000, timeoutMs) })
            .catch(() => {});
          readinessDecision = decidePreviewReadiness({
            probe: await readPageProbe(page),
            readiness: null,
          });
        } else {
          readinessDecision = decidePreviewReadiness({
            probe: afterPoll,
            readiness: null,
          });
        }
      }
    }
    if (readinessDecision.action === "warn") {
      if (!(await isExpectedPreviewTargetCurrent(params.chatId, params))) {
        return skippedResult(
          "preview_superseded",
          Date.now() - startedAt,
          previewUrl,
          routesChecked,
        );
      }
      const message =
        readinessDecision.code === "preview_boot_page"
          ? PREVIEW_BOOT_PAGE_MESSAGE
          : PREVIEW_PROBE_UNREADABLE_MESSAGE;
      return {
        ok: true,
        skipped: false,
        skippedReason: null,
        warnings: [warning(readinessDecision.code, message)],
        warningCount: 1,
        productBlocked: readinessDecision.productBlocked,
        durationMs: Date.now() - startedAt,
        checkedUrl: previewUrl,
        routesChecked,
      };
    }

    const snapshot = await page.evaluate<DomSnapshot, string>(
      (meaningfulHrefSource) => {
      const isMeaningfulCtaHref = new Function(
        `return (${meaningfulHrefSource});`,
      )() as (href: string | null | undefined) => boolean;
      const visible = (el: Element): boolean => {
        const html = el as HTMLElement;
        const rect = html.getBoundingClientRect();
        const style = window.getComputedStyle(html);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const text = (el: Element): string | null =>
        ((el as HTMLElement).innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160) || null;
      const isDemoOnly = (el: Element): boolean =>
        el.hasAttribute("data-demo-only") ||
        el.closest("[data-demo-only]") !== null ||
        /demo only|demo-läge|ej aktivt|disabled/i.test(text(el) || "");
      const ctaText = /^(få|utforska|starta|kom igång|bygg|boka|kontakta|skicka|köp|läs mer|begär|offert|learn more|get started|contact|submit|send|book|request|quote)/i;
      const ctaClass = /(cta|button|btn|primary|action)/i;

      const ctaCandidates = Array.from(
        document.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a,button"),
      ).filter((el) => {
        const t = text(el) || "";
        const cls = (el as HTMLElement).className?.toString?.() || "";
        return ctaText.test(t) || ctaClass.test(cls);
      });
      const hydrationRoot = document.querySelector("main");

      const shortSelector = (el: Element): string => {
        const tag = el.tagName.toLowerCase();
        const id = (el as HTMLElement).id;
        if (id) return `${tag}#${id}`;
        const classes = ((el as HTMLElement).className?.toString?.() || "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join(".");
        return classes ? `${tag}.${classes}` : tag;
      };
      // React fäster `__reactProps$<hash>` på host-noder i både dev och prod.
      // En onClick där är en riktig handler även när DOM-attributen är tomma.
      // Vandra några föräldrar uppåt: handlern kan sitta på ett kort/wrapper.
      const probeReactHandler = (
        el: Element,
      ): { probed: boolean; handler: boolean } => {
        let node: Element | null = el;
        let probed = false;
        for (let depth = 0; node && depth < 4; depth += 1) {
          const key = Object.keys(node).find(
            (candidate) => candidate.indexOf("__reactProps$") === 0,
          );
          if (key) {
            probed = true;
            const props = (node as unknown as Record<string, unknown>)[key] as
              | Record<string, unknown>
              | null
              | undefined;
            if (
              props &&
              (typeof props.onClick === "function" ||
                typeof props.onMouseDown === "function" ||
                typeof props.onPointerDown === "function")
            ) {
              return { probed: true, handler: true };
            }
          }
          node = node.parentElement;
        }
        return { probed, handler: false };
      };

      // closest("a[href]") matchar elementet självt, så en `<a href="#">`
      // såg ut som "inlänkad". Kräv en *annan* länk med riktig destination.
      const hasMeaningfulHref = (anchor: Element | null | undefined): boolean => {
        if (!anchor) return false;
        return isMeaningfulCtaHref(anchor.getAttribute("href"));
      };

      return {
        // `href="#"` ägs av cta_no_handler (död CTA), inte broken_anchor
        // (saknad sektions-id). Lämna filtret så fyndet inte dubbelrapporteras.
        anchors: Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
          .map((a) => {
            const href = a.getAttribute("href") || "";
            const target = href.slice(1);
            return { href, text: text(a), targetExists: href === "#" || Boolean(target && document.getElementById(target)) };
          })
          .filter((a) => a.href !== "#"),
        images: Array.from(document.querySelectorAll<HTMLImageElement>("img"))
          .filter(visible)
          .map((img) => ({
            src: img.currentSrc || img.src,
            alt: img.alt || null,
            naturalWidth: img.naturalWidth || 0,
            complete: img.complete,
          })),
        ctas: ctaCandidates
          .filter(visible)
          .map((el) => {
            const reactProbe = probeReactHandler(el);
            return {
              tag: el.tagName.toLowerCase(),
              text: text(el),
              href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
              disabled: el instanceof HTMLButtonElement ? el.disabled : false,
              ariaDisabled: el.getAttribute("aria-disabled") === "true",
              ariaControls: el.getAttribute("aria-controls"),
              ariaExpanded: el.getAttribute("aria-expanded"),
              type: el instanceof HTMLButtonElement ? el.type || null : null,
              inForm: Boolean(el.closest("form")),
              formAction: el instanceof HTMLButtonElement ? el.formAction || null : null,
              demoOnly: isDemoOnly(el),
              selector: shortSelector(el),
              hasReactHandler: reactProbe.handler,
              reactPropsProbed: reactProbe.probed,
              anchorWrapped:
                hasMeaningfulHref(el.parentElement?.closest("a[href]")) ||
                hasMeaningfulHref(el.querySelector("a[href]")),
              ariaHasPopup: el.getAttribute("aria-haspopup"),
              onclickAttr:
                typeof (el as HTMLElement).onclick === "function" ||
                el.hasAttribute("onclick"),
            };
          }),
        hydrationCtaLabels: hydrationRoot
          ? ctaCandidates
              .filter((el) => hydrationRoot.contains(el) && !isDemoOnly(el))
              .map((el) => text(el))
              .filter((value): value is string => Boolean(value))
          : [],
        forms: Array.from(document.querySelectorAll<HTMLFormElement>("form"))
          .filter(visible)
          .map((form) => ({
            id: form.id || null,
            action: form.getAttribute("action"),
            method: form.getAttribute("method"),
            hasSubmitControl: Boolean(form.querySelector('button[type="submit"], input[type="submit"], button:not([type])')),
            disabled: Boolean(form.querySelector("[disabled]")),
            ariaDisabled: form.getAttribute("aria-disabled") === "true",
            demoOnly: isDemoOnly(form),
            text: text(form),
          })),
      };
    },
      isMeaningfulCtaHref.toString(),
    );
    snapshot.hydrationCtaLabels = await page
      .evaluate(captureHydrationCtaLabelsInBrowser)
      .catch(() => []);

    // Desktop Next.js error-overlay probe — catches ambiguous render crashes
    // (Codex #321 P1) without piercing app content.
    const desktopErrorOverlay = await page
      .evaluate(detectNextErrorOverlayInBrowser)
      .catch(() => false);
    startPageOverlaySeen = desktopErrorOverlay;

    let desktopJpeg: Buffer | null = null;
    let mobileJpeg: Buffer | null = null;
    let domSummary: ProductDomSummary | null = null;
    let desktopCaptureMs = 0;
    const captureEnabled = params.captureEnabled === true;
    if (captureEnabled) {
      // Start page, before the crawl walks desktop off the homepage.
      const captureStartedAt = Date.now();
      desktopJpeg = await capturePostcheckJpeg(page);
      desktopCaptureMs = Date.now() - captureStartedAt;
      const liveProbe = await readPageProbe(page);
      domSummary = buildDomSummary(snapshot, liveProbe ?? firstProbe);
    }

    // Bounded same-origin crawl on DESKTOP only (mobile stays start-page-only
    // for cost control). Next-dev compiles each route on demand, so we stop
    // when the soft deadline is exceeded. Capture time is added back so a
    // slow JPEG cannot shrink the crawl window.
    const crawlDeadlineMs = resolveCrawlDeadlineMs(CRAWL_DEADLINE_MS, desktopCaptureMs);
    const hrefsRaw = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map(
          (a) => a.getAttribute("href") || "",
        ),
      )
      .catch(() => [] as string[]);
    const crawlRoutes = selectCrawlRoutes(
      Array.isArray(hrefsRaw) ? hrefsRaw : [],
      previewUrl,
      MAX_CRAWL_ROUTES,
    );
    for (const routeUrl of crawlRoutes) {
      if (Date.now() - startedAt >= crawlDeadlineMs) break;
      try {
        currentRoute = pathnameOf(routeUrl);
        desktopLeftStartUrl = true;
        await page.goto(routeUrl, {
          waitUntil: "domcontentloaded",
          timeout: Math.min(timeoutMs, CRAWL_DEADLINE_MS),
        });
        await page
          .waitForLoadState("networkidle", { timeout: Math.min(8_000, timeoutMs) })
          .catch(() => {});
        const crawlOverlay = await page
          .evaluate(detectNextErrorOverlayInBrowser)
          .catch(() => false);
        // En kraschad UNDERSIDA rapporteras men blockerar inte. Startsidan får
        // fortfarande blockera via `desktopErrorOverlay` — den avgör om
        // previewen är död. Att låta crawl-träffar blockera vore en tyst
        // utvidgning av blockeringsytan, och undersidor på en dev-server
        // kompileras on demand och är därför känsligare för transienta fel
        // (samma överblockeringsfälla som Bugbot #321).
        if (crawlOverlay) {
          browserRuntimeIssues.push({
            kind: "console",
            route: currentRoute,
            message: "Next.js-felöverlägg visas på undersidan.",
          });
        }
        routesChecked += 1;
      } catch {
        // One bad extra route must not fail the whole check — skip and continue.
      }
    }

    // Reset route label for the mobile start-page pass.
    currentRoute = pathnameOf(previewUrl);

    mobilePage = await browser.newPage({
      viewport: { width: 375, height: 667 },
      serviceWorkers: "block",
    });
    await applyCaptureRequestGate(mobilePage);
    // Capture mobile-viewport runtime crashes too (Bugbot #321): a render-fatal
    // error can surface only at 375px or after the hamburger toggle below.
    // Console/network listeners also attached (advisory) before goto.
    attachRuntimeListeners(mobilePage, "mobile");
    const mobileResponse = await mobilePage.goto(previewUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    mobileServerCtaBaseline = await serverCtaBaselineFromResponse(mobileResponse);
    // Let the mobile page settle like the desktop one so a render-fatal crash
    // that fires just after the initial paint is captured before we classify
    // `pageErrors` below (Bugbot #321).
    await mobilePage
      .waitForLoadState("networkidle", { timeout: Math.min(8_000, timeoutMs) })
      .catch(() => {});
    const mobileHydrationCtaLabels = await mobilePage
      .evaluate(captureHydrationCtaLabelsInBrowser)
      .catch(() => []);
    if (captureEnabled) {
      mobileJpeg = await capturePostcheckJpeg(mobilePage);
    }
    const mobileMenu = await mobilePage.evaluate<MobileMenuCheck>(async () => {
      const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((button) => {
        const label = [
          button.getAttribute("aria-label"),
          button.textContent,
          button.className?.toString?.(),
        ].join(" ");
        return /menu|meny|hamburger|navigation|nav/i.test(label);
      });
      const button = candidates[0];
      if (!button) return { status: "not_applicable" };
      const beforeExpanded = button.getAttribute("aria-expanded");
      const beforeText = document.body.innerText;
      button.click();
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      const afterExpanded = button.getAttribute("aria-expanded");
      const afterText = document.body.innerText;
      if (beforeExpanded !== afterExpanded || beforeText !== afterText) {
        return { status: "passed" };
      }
      return { status: "failed", reason: "hamburger_button_did_not_change_dom_or_aria" };
    });

    // Mobile Next.js error-overlay probe (after the menu interaction) — a render
    // crash can surface only at 375px or after the toggle.
    const mobileErrorOverlay = await mobilePage
      .evaluate(detectNextErrorOverlayInBrowser)
      .catch(() => false);

    const evaluation = evaluateProductDomSnapshot(snapshot, mobileMenu);
    const runtimeEval = evaluateRuntimeErrors(pageErrors, {
      nextErrorOverlay: desktopErrorOverlay || mobileErrorOverlay,
    });
    const browserEval = evaluateBrowserRuntimeIssues(browserRuntimeIssues);
    const hydrationDomEval = evaluateHydrationDomLossForViewports({
      desktopBaseline: desktopServerCtaBaseline,
      desktopSnapshot: snapshot,
      mobileBaseline: mobileServerCtaBaseline,
      mobileSnapshot: { hydrationCtaLabels: mobileHydrationCtaLabels },
      issues: browserRuntimeIssues,
      startRoute: pathnameOf(previewUrl),
    });
    const warnings = [
      ...evaluation.warnings,
      ...runtimeEval.warnings,
      ...browserEval.warnings,
      ...hydrationDomEval.warnings,
    ];
    // productBlocked comes ONLY from DOM + render-fatal evaluators — browser
    // runtime issues are advisory-only by design.
    // This is the last point before capture buffers are uploaded under the
    // starting filesRevision. A same-version replacement must discard N
    // instead of attaching N+1 DOM/readiness to N's durable evidence.
    if (!(await isExpectedPreviewTargetCurrent(params.chatId, params))) {
      return skippedResult(
        "preview_superseded",
        Date.now() - startedAt,
        previewUrl,
        routesChecked,
      );
    }
    const screenshots = captureEnabled
      ? await persistCapturedScreenshots({
          chatId: params.chatId,
          versionId: params.versionId,
          userId: params.captureUserId,
          filesRevision: params.filesRevision,
          desktop: desktopJpeg,
          mobile: mobileJpeg,
        }).catch(() => null)
      : null;
    return {
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings,
      warningCount: warnings.length,
      productBlocked:
        evaluation.productBlocked || runtimeEval.productBlocked || hydrationDomEval.productBlocked,
      durationMs: Date.now() - startedAt,
      checkedUrl: previewUrl,
      routesChecked,
      screenshots,
      domSummary,
    };
  } catch (err) {
    if (err instanceof PreviewTargetSupersededError) {
      return skippedResult(
        "preview_superseded",
        Date.now() - startedAt,
        previewUrl,
        routesChecked,
      );
    }
    // A render-fatal crash may already be visible even though a later phase
    // (mobile nav / menu probe) threw. Surface it instead of silently
    // downgrading to a skip (productBlocked:false) — a dead preview must never
    // read as green just because a subsequent step errored (Bugbot #321).
    // Best-effort: re-probe the Next.js error overlay on the desktop page too,
    // so an ambiguous render crash (which the structural pattern list skips but
    // the overlay catches) is not lost when the throw happened before the
    // happy-path overlay probe ran.
    //
    // Desktop-sidan omprövas BARA om crawlen inte flyttat den. Har den gjort
    // det beskriver den en undersida, och en undersida får varken blockera
    // (happy-pathen varnar bara) eller friskförklara en död startsida.
    // `startPageOverlaySeen` bär startsidans utfall vidare i det läget.
    let overlayInCatch = startPageOverlaySeen;
    const overlayCandidates = desktopLeftStartUrl ? [mobilePage] : [page, mobilePage];
    for (const candidate of overlayCandidates) {
      if (overlayInCatch) break;
      if (!candidate) continue;
      const seen = await candidate
        .evaluate(detectNextErrorOverlayInBrowser)
        .catch(() => false);
      if (seen) overlayInCatch = true;
    }
    const runtimeEval = evaluateRuntimeErrors(pageErrors, { nextErrorOverlay: overlayInCatch });
    const browserEval = evaluateBrowserRuntimeIssues(browserRuntimeIssues);
    const warnings = [...runtimeEval.warnings, ...browserEval.warnings];
    if (runtimeEval.productBlocked) {
      if (!(await isExpectedPreviewTargetCurrent(params.chatId, params))) {
        return skippedResult(
          "preview_superseded",
          Date.now() - startedAt,
          previewUrl,
          routesChecked,
        );
      }
      console.warn("[product-postcheck] fatal runtime crash captured before phase error:", err);
      return {
        ok: true,
        skipped: false,
        skippedReason: null,
        warnings,
        warningCount: warnings.length,
        productBlocked: true,
        durationMs: Date.now() - startedAt,
        checkedUrl: previewUrl,
        routesChecked,
      };
    }
    const reason = productPostcheckSkipReasonFromError(err);
    // Advisory-fynd som hann samlas in innan felet följer INTE med en skip.
    // Konsumenten (`buildProductPostcheckLogItems`) grenar på `skipped` först
    // och skriver bara skip-raden, så warnings här hade ändå tappats — och en
    // halvkörd kontroll ska rapportera "kördes inte", inte en delmängd som
    // läses som täckning. `routesChecked` visar hur långt den kom.
    console.warn("[product-postcheck] skipped:", err);
    return skippedResult(reason, Date.now() - startedAt, previewUrl, routesChecked);
  } finally {
    await mobilePage?.close().catch(() => {});
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

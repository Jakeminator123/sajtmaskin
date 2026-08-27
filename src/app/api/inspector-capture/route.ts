import { NextResponse } from "next/server";
import type { Page } from "playwright-core";
import { getCurrentUser } from "@/lib/auth/auth";
import { getBuilderInspectorDisabledMessage, isBuilderInspectorEnabled } from "@/lib/builder/inspector-feature";
import {
  isInspectorPreviewIdentityCurrent,
  parseInspectorPreviewIdentity,
} from "@/lib/builder/inspector-preview-identity";
import { hostResolvesToPrivate, isDisallowedHost } from "@/lib/ssrf-guard";
import { withRateLimit } from "@/lib/rate-limit";
import {
  applyCaptureRequestGate,
  assertFinalUrlAllowed,
  launchCaptureBrowser,
} from "@/lib/capture/browser";
import {
  assertPreviewUrlAllowed,
  isAllowedCaptureUrl,
} from "@/lib/capture/preview-allowlist";
import { clipFromRegion, parseCaptureRegion, type CaptureRegion } from "./capture-region";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Samma budget som miniatyr-routen: en kallstartad Chromium plus navigering
// och settle ligger långt över Vercels default på 10 s.
export const maxDuration = 60;

const NAVIGATION_TIMEOUT_MS = 25_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;
/**
 * Egen deadline för skottet. Utan den kan Playwrights default (30 s) plus
 * navigering och settle passera `maxDuration`, och funktionen dödas mitt i
 * bilden — vilket bara syns som "Target page, context or browser has been
 * closed".
 */
const SCREENSHOT_TIMEOUT_MS = 15_000;
const DEFAULT_CROP_WIDTH = 420;
const DEFAULT_CROP_HEIGHT = 280;
/**
 * Bilden måste kunna laddas upp igen.
 *
 * Klienten gör om `previewDataUrl` till en fil och postar den till
 * `/api/media/upload`, som avvisar allt över 4 MB. En lossless PNG av en stor
 * markerad yta i 2× skala passerar det med marginal, och användaren såg då
 * bilden lokalt medan modellen aldrig fick den (Codex P1 på #729). Taket ligger
 * under 4 MB så base64-omkodningen och svarsbudgeten också håller.
 */
const MAX_CAPTURE_BYTES = 3 * 1024 * 1024;
/** Över den här ytan är 2× skala inte värt storleken. */
const MAX_FULL_SCALE_CLIP_PIXELS = 1_200 * 900;
/** Faller PNG:en över taket kodas den om som JPEG i den här ordningen. */
const JPEG_FALLBACK_QUALITIES = [82, 60] as const;

type CaptureRequest = {
  url: string;
  xPercent: number;
  yPercent: number;
  viewportWidth: number;
  viewportHeight: number;
  cropWidth?: number;
  cropHeight?: number;
  region?: CaptureRegion;
  /**
   * Previewens scroll-läge när användaren markerade.
   *
   * Koordinaterna vi får är viewport-relativa, och den här routen laddar
   * sidan på nytt — alltid vid scroll 0. Utan att rulla tillbaka hit beskär
   * vi toppen av dokumentet och påstår att det är den markerade ytan.
   */
  scrollX?: number;
  scrollY?: number;
};

/** Låt lat-laddat innehåll hinna måla efter att vi rullat. */
const SCROLL_SETTLE_MS = 220;

type CapturedElement = {
  tag: string;
  id: string | null;
  className: string | null;
  text: string | null;
  ariaLabel: string | null;
  role: string | null;
  href: string | null;
  selector: string | null;
  nearestHeading: string | null;
};

type CapturePointDetails = {
  pointSummary: string;
  element?: CapturedElement;
  resolvedX: number;
  resolvedY: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function waitForStabilizedPage(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);
  await page
    .evaluate(async () => {
      const fontsApi = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
      if (!fontsApi?.ready) return;
      try {
        await fontsApi.ready;
      } catch {
        // Ignore font loading errors; screenshot can still be useful.
      }
    })
    .catch(() => undefined);
  await page.waitForTimeout(300).catch(() => undefined);
}

async function describePoint(
  page: Page,
  x: number,
  y: number,
): Promise<CapturePointDetails> {
  return page.evaluate(({ pointX, pointY }) => {
    const cleanText = (value: string | null | undefined): string | null => {
      if (!value) return null;
      const normalized = value.replace(/\s+/g, " ").trim();
      if (!normalized) return null;
      return normalized.slice(0, 160);
    };

    const cssEscape = (value: string) => {
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
      return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };

    const buildSelector = (el: Element): string | null => {
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const tag = current.tagName.toLowerCase();
        if (tag === "html") break;
        const id = current.getAttribute("id");
        if (id) {
          parts.unshift(`#${cssEscape(id)}`);
          break;
        }
        const classNames = (current.getAttribute("class") || "")
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 2)
          .map((item) => `.${cssEscape(item)}`)
          .join("");
        const currentTagName = current.tagName;
        const parentElement: Element | null = current.parentElement;
        let nth = 1;
        if (parentElement) {
          const siblings = (Array.from(parentElement.children) as Element[]).filter(
            (candidate) => candidate.tagName === currentTagName,
          );
          nth = Math.max(1, siblings.indexOf(current) + 1);
        }
        parts.unshift(`${tag}${classNames}:nth-of-type(${nth})`);
        current = parentElement;
      }
      return parts.length > 0 ? parts.join(" > ") : null;
    };

    const maxX = Math.max(0, window.innerWidth - 1);
    const maxY = Math.max(0, window.innerHeight - 1);
    const clampCoord = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));
    const cleanTag = (el: Element | null | undefined) => (el?.tagName || "").toLowerCase();
    const isRootLike = (el: Element | null | undefined) => {
      const tag = cleanTag(el);
      return tag === "html" || tag === "body" || tag === "head" || tag === "style" || tag === "script";
    };

    const pickAtPoint = (sampleX: number, sampleY: number): HTMLElement | null => {
      const stack = document.elementsFromPoint(sampleX, sampleY);
      const firstUseful = stack.find((entry) => !isRootLike(entry));
      if (firstUseful instanceof HTMLElement) return firstUseful;
      const fallback = document.elementFromPoint(sampleX, sampleY);
      return fallback instanceof HTMLElement ? fallback : null;
    };

    const offsets: Array<[number, number]> = [
      [0, 0],
      [-12, 0],
      [12, 0],
      [0, -12],
      [0, 12],
      [-24, 0],
      [24, 0],
      [0, -24],
      [0, 24],
      [-36, -12],
      [36, -12],
      [-36, 12],
      [36, 12],
      [-52, 0],
      [52, 0],
      [0, -52],
      [0, 52],
    ];
    const interactiveTags = new Set(["button", "a", "input", "select", "textarea", "summary", "label"]);
    const interactiveRoles = new Set(["button", "link", "menuitem", "tab", "switch", "checkbox"]);

    let best:
      | {
          element: HTMLElement;
          x: number;
          y: number;
          score: number;
        }
      | null = null;

    for (const [dx, dy] of offsets) {
      const sampleX = clampCoord(pointX + dx, maxX);
      const sampleY = clampCoord(pointY + dy, maxY);
      const candidate = pickAtPoint(sampleX, sampleY);
      if (!candidate) continue;

      const tag = candidate.tagName.toLowerCase();
      const role = (candidate.getAttribute("role") || "").toLowerCase();
      const candidateText = cleanText(candidate.innerText || candidate.textContent || "");
      const distance = Math.hypot(dx, dy);

      let score = 0;
      if (!isRootLike(candidate)) score += 45;
      if (interactiveTags.has(tag)) score += 85;
      if (interactiveRoles.has(role)) score += 65;
      if (candidate.closest("button,a,[role='button'],[role='link']")) score += 42;
      if (candidate.id) score += 20;
      if (String(candidate.className || "").trim()) score += 8;
      if (candidateText) score += Math.min(36, candidateText.length / 4);
      score -= distance * 0.9;

      if (!best || score > best.score) {
        best = { element: candidate, x: sampleX, y: sampleY, score };
      }
    }

    const resolvedX = best?.x ?? clampCoord(pointX, maxX);
    const resolvedY = best?.y ?? clampCoord(pointY, maxY);
    const target = best?.element ?? pickAtPoint(resolvedX, resolvedY);
    if (!target) {
      return {
        pointSummary: `Ingen DOM-träff vid x=${Math.round(pointX)}, y=${Math.round(pointY)}.`,
        resolvedX,
        resolvedY,
      };
    }

    const element = target as HTMLElement;
    const id = element.id || null;
    const className = cleanText(element.className || null);
    const text = cleanText(element.innerText || element.textContent || null);
    const ariaLabel = cleanText(element.getAttribute("aria-label"));
    const role = cleanText(element.getAttribute("role"));
    const href =
      element instanceof HTMLAnchorElement ? cleanText(element.href) : cleanText(element.getAttribute("href"));
    const selector = buildSelector(element);

    let nearestHeading: string | null = null;
    let headingCandidate: Element | null = element.closest("h1,h2,h3,h4,h5,h6");
    if (!headingCandidate) {
      const sectionRoot =
        element.closest("section,article,main,aside,nav,header,footer") || element.parentElement;
      headingCandidate = sectionRoot?.querySelector?.("h1,h2,h3,h4,h5,h6") || null;
    }
    if (headingCandidate) {
      nearestHeading = cleanText((headingCandidate as HTMLElement).innerText || headingCandidate.textContent || "");
    }

    const shortTag = element.tagName.toLowerCase();
    const adjusted = Math.abs(resolvedX - pointX) > 0.5 || Math.abs(resolvedY - pointY) > 0.5;
    const adjustedPart = adjusted
      ? ` (justerad från klick x=${Math.round(pointX)}, y=${Math.round(pointY)})`
      : "";
    const textPart = text ? ` text="${text}"` : "";
    const headingPart = nearestHeading ? ` närmast rubrik="${nearestHeading}"` : "";
    const summary = `Träffade <${shortTag}> vid x=${Math.round(resolvedX)}, y=${Math.round(resolvedY)}${adjustedPart}.${textPart}${headingPart}`;

    return {
      pointSummary: summary,
      resolvedX,
      resolvedY,
      element: {
        tag: shortTag,
        id,
        className,
        text,
        ariaLabel,
        role,
        href,
        selector,
        nearestHeading,
      },
    };
  }, { pointX: x, pointY: y }) as Promise<CapturePointDetails>;
}

async function drawCaptureOverlay(
  page: Page,
  x: number,
  y: number,
  xPercent: number,
  yPercent: number,
) {
  await page.evaluate(
    ({ pointX, pointY, pointXPercent, pointYPercent }) => {
      const previous = document.getElementById("__sajtmaskin_capture_overlay__");
      if (previous) previous.remove();

      const overlay = document.createElement("div");
      overlay.id = "__sajtmaskin_capture_overlay__";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "2147483647";

      const style = document.createElement("style");
      style.textContent = `
        @keyframes sajtmaskinCapturePulse {
          0% { transform: translate(-50%, -50%) scale(0.55); opacity: 0.95; }
          80% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes sajtmaskinCaptureDot {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(0.86); }
        }
      `;

      const crossH = document.createElement("div");
      crossH.style.position = "absolute";
      crossH.style.left = "0";
      crossH.style.top = `${pointY}px`;
      crossH.style.width = "100%";
      crossH.style.height = "2px";
      crossH.style.background = "rgba(244, 63, 94, 0.9)";
      crossH.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.35)";

      const crossV = document.createElement("div");
      crossV.style.position = "absolute";
      crossV.style.left = `${pointX}px`;
      crossV.style.top = "0";
      crossV.style.width = "2px";
      crossV.style.height = "100%";
      crossV.style.background = "rgba(244, 63, 94, 0.9)";
      crossV.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.35)";

      const pulse = document.createElement("div");
      pulse.style.position = "absolute";
      pulse.style.left = `${pointX}px`;
      pulse.style.top = `${pointY}px`;
      pulse.style.width = "44px";
      pulse.style.height = "44px";
      pulse.style.border = "3px solid rgba(244, 63, 94, 0.95)";
      pulse.style.borderRadius = "999px";
      pulse.style.animation = "sajtmaskinCapturePulse 900ms ease-out infinite";
      pulse.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.35)";

      const marker = document.createElement("div");
      marker.style.position = "absolute";
      marker.style.left = `${pointX}px`;
      marker.style.top = `${pointY}px`;
      marker.style.width = "14px";
      marker.style.height = "14px";
      marker.style.borderRadius = "999px";
      marker.style.background = "rgba(244, 63, 94, 1)";
      marker.style.border = "2px solid rgba(255,255,255,0.9)";
      marker.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.35), 0 0 14px rgba(244, 63, 94, 0.95)";
      marker.style.animation = "sajtmaskinCaptureDot 900ms ease-in-out infinite";
      marker.style.transform = "translate(-50%, -50%)";
      pulse.style.transform = "translate(-50%, -50%)";

      const label = document.createElement("div");
      label.textContent = `Punkt x ${pointXPercent.toFixed(1)}% • y ${pointYPercent.toFixed(1)}%`;
      label.style.position = "absolute";
      label.style.left = `${Math.max(8, Math.min(window.innerWidth - 240, pointX + 18))}px`;
      label.style.top = `${Math.max(8, Math.min(window.innerHeight - 42, pointY - 42))}px`;
      label.style.padding = "6px 9px";
      label.style.borderRadius = "8px";
      label.style.font = "600 12px system-ui, -apple-system, Segoe UI, sans-serif";
      label.style.color = "#ecfeff";
      label.style.background = "rgba(3, 7, 18, 0.82)";
      label.style.border = "1px solid rgba(244, 63, 94, 0.65)";
      label.style.boxShadow = "0 4px 14px rgba(0,0,0,0.35)";

      overlay.appendChild(style);
      overlay.appendChild(crossH);
      overlay.appendChild(crossV);
      overlay.appendChild(pulse);
      overlay.appendChild(marker);
      overlay.appendChild(label);
      (document.body || document.documentElement).appendChild(overlay);
    },
    { pointX: x, pointY: y, pointXPercent: xPercent, pointYPercent: yPercent },
  );

  await page.waitForTimeout(260).catch(() => undefined);
}

function parseBody(body: unknown): CaptureRequest | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const url = typeof obj.url === "string" ? obj.url.trim() : "";
  const xPercent = toNumber(obj.xPercent);
  const yPercent = toNumber(obj.yPercent);
  const viewportWidth = toNumber(obj.viewportWidth);
  const viewportHeight = toNumber(obj.viewportHeight);
  const cropWidth = Number.isFinite(toNumber(obj.cropWidth)) ? toNumber(obj.cropWidth) : undefined;
  const cropHeight = Number.isFinite(toNumber(obj.cropHeight)) ? toNumber(obj.cropHeight) : undefined;

  if (!url) return null;
  if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) return null;
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) return null;
  return {
    url,
    xPercent,
    yPercent,
    viewportWidth,
    viewportHeight,
    cropWidth,
    cropHeight,
    region: parseCaptureRegion(obj.region),
    scrollX: Number.isFinite(toNumber(obj.scrollX)) ? toNumber(obj.scrollX) : undefined,
    scrollY: Number.isFinite(toNumber(obj.scrollY)) ? toNumber(obj.scrollY) : undefined,
  };
}

/**
 * Capture kräver inloggning, inte bara en session.
 *
 * En gäst-session släpptes tidigare in här, men bilden är oanvändbar för den:
 * klienten laddar upp `previewDataUrl` till `/api/media/upload`, som kräver
 * `getCurrentUser` och 401:ar för samma gäst. Resultatet var en bild som syntes
 * lokalt medan modellen aldrig fick den. Att kräva inloggning stänger dessutom
 * halva proxy-ytan: gäst-`x-session-id` är klientkontrollerat och kunde roteras
 * fritt (Codex P1 på #729, ägarbeslut 2026-08-01).
 */
async function requireInspectorIdentity(req: Request): Promise<Response | null> {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Logga in för att skicka en bild av previewen." },
      { status: 401 },
    );
  }
  return null;
}

export async function POST(req: Request) {
  return withRateLimit(req, "inspector:capture", () => handlePOST(req));
}

async function handlePOST(req: Request) {
  const authError = await requireInspectorIdentity(req);
  if (authError) return authError;

  if (!isBuilderInspectorEnabled()) {
    return NextResponse.json(
      { success: false, error: getBuilderInspectorDisabledMessage() },
      { status: 503 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = parseBody(json);
  if (!parsed) {
    return NextResponse.json(
      { success: false, error: "Ogiltig payload. Kräver url, xPercent, yPercent, viewportWidth, viewportHeight." },
      { status: 400 },
    );
  }
  const parsedIdentity = parseInspectorPreviewIdentity(
    json && typeof json === "object" ? (json as Record<string, unknown>) : {},
  );
  if (parsedIdentity.status !== "valid") {
    return NextResponse.json(
      {
        success: false,
        staleIdentity: true,
        error: "Capture kräver en fullständig aktuell preview-identitet.",
      },
      { status: 400 },
    );
  }
  if (!(await isInspectorPreviewIdentityCurrent(parsedIdentity.identity, parsed.url))) {
    return NextResponse.json(
      { success: false, staleIdentity: true, error: "Previewen har bytt version eller session." },
      { status: 409 },
    );
  }

  let target: URL;
  try {
    target = new URL(parsed.url);
  } catch {
    return NextResponse.json({ success: false, error: "Ogiltig URL." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return NextResponse.json({ success: false, error: "Endast http/https stöds." }, { status: 400 });
  }
  // Samma allowlist som miniatyrvägen. SSRF-kontrollen nedan avvisar bara
  // privata värdar, så utan den här raden fotograferar routen vilken PUBLIK
  // adress som helst — en screenshot-proxy i prod (Codex P1 på #729).
  const allowlistDecision = assertPreviewUrlAllowed(target, "Inspector-capture");
  if (!allowlistDecision.ok) {
    return NextResponse.json(
      { success: false, error: allowlistDecision.error },
      { status: allowlistDecision.status },
    );
  }
  if (isDisallowedHost(target.hostname) || (await hostResolvesToPrivate(target.hostname))) {
    return NextResponse.json({ success: false, error: "Otillåten host för capture." }, { status: 403 });
  }

  const viewportWidth = clamp(Math.round(parsed.viewportWidth), 320, 2400);
  const viewportHeight = clamp(Math.round(parsed.viewportHeight), 240, 2400);
  const xPercent = clamp(parsed.xPercent, 0, 100);
  const yPercent = clamp(parsed.yPercent, 0, 100);
  const centerX = clamp((xPercent / 100) * viewportWidth, 0, viewportWidth);
  const centerY = clamp((yPercent / 100) * viewportHeight, 0, viewportHeight);

  const cropWidth = clamp(Math.round(parsed.cropWidth ?? DEFAULT_CROP_WIDTH), 120, viewportWidth);
  const cropHeight = clamp(Math.round(parsed.cropHeight ?? DEFAULT_CROP_HEIGHT), 90, viewportHeight);

  // Ytan är känd redan här — den beror bara på payloaden — så skalan kan väljas
  // innan sidan laddas i stället för att upptäckas som en för stor bild efteråt.
  const regionClip = parsed.region
    ? clipFromRegion(parsed.region, viewportWidth, viewportHeight)
    : null;
  const plannedClipPixels = regionClip
    ? regionClip.width * regionClip.height
    : cropWidth * cropHeight;
  const deviceScaleFactor = plannedClipPixels > MAX_FULL_SCALE_CLIP_PIXELS ? 1 : 2;

  let browser: Awaited<ReturnType<typeof launchCaptureBrowser>> | null = null;
  try {
    // Delad startpunkt med projektminiatyrerna. Tidigare importerades
    // `playwright` rakt av — en devDependency — och routen svarade därför 503
    // så fort `process.env.VERCEL` fanns. Bildvägen i inspektorn var alltså
    // lokal-bara och död i prod, inklusive den punktbild som funnits längst.
    browser = await launchCaptureBrowser();
    const page = await browser.newPage({
      viewport: { width: viewportWidth, height: viewportHeight },
      deviceScaleFactor,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      // Service worker-requests går förbi interception, så de blockeras helt
      // (en capture behöver dem aldrig).
      serviceWorkers: "block",
    });

    // Nu när routen faktiskt kör i prod måste den bära samma SSRF-skydd som
    // miniatyrvägen: värdkontrollen ovan gäller bara den första URL:en, och
    // Chromium får aldrig nå metadata-endpoints eller interna tjänster.
    await applyCaptureRequestGate(page);

    await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await waitForStabilizedPage(page);

    // Rulla till samma position som previewen stod i. Allt nedanför beror på
    // det: `describePoint` slår upp elementet med viewport-koordinater, och
    // Playwrights `clip` är viewport-relativ när `fullPage` är av. Utan det
    // här steget beskriver och fotograferar vi sidans topp oavsett vad
    // användaren tittade på.
    const scrollX = Math.max(0, Math.round(parsed.scrollX ?? 0));
    const scrollY = Math.max(0, Math.round(parsed.scrollY ?? 0));
    if (scrollX > 0 || scrollY > 0) {
      await page
        .evaluate(
          ([x, y]) => window.scrollTo(x, y),
          [scrollX, scrollY] as const,
        )
        .catch(() => undefined);
      await page.waitForTimeout(SCROLL_SETTLE_MS).catch(() => undefined);
    }

    const pointDetails = await describePoint(page, centerX, centerY);
    const resolvedCenterX = clamp(Math.round(pointDetails.resolvedX), 0, viewportWidth);
    const resolvedCenterY = clamp(Math.round(pointDetails.resolvedY), 0, viewportHeight);

    // A dragged region is its own answer: clip exactly what the user outlined
    // and draw nothing on top. The point path needs a crosshair because a
    // 420x280 crop around a coordinate does not otherwise say which pixel was
    // meant — but here the crop IS the selection, and an overlay would only
    // obscure the thing the user is asking about. The region also must not be
    // recentred on `resolvedX/Y`: that snaps to an element, which is right for
    // a click and wrong for a rectangle the user drew themselves.
    const clip = regionClip
      ? regionClip
      : {
          x: clamp(
            Math.round(resolvedCenterX - cropWidth / 2),
            0,
            Math.max(0, viewportWidth - cropWidth),
          ),
          y: clamp(
            Math.round(resolvedCenterY - cropHeight / 2),
            0,
            Math.max(0, viewportHeight - cropHeight),
          ),
          width: cropWidth,
          height: cropHeight,
        };
    if (!regionClip) {
      await drawCaptureOverlay(page, resolvedCenterX, resolvedCenterY, xPercent, yPercent);
    }

    // Grinden ovan släpper igenom vilken PUBLIK värd som helst, så en
    // redirect eller en JS-navigering kan ha flyttat huvudramen bort från
    // previewen. Att bara pinna mot `target.hostname` räckte inte: den värden
    // valde anroparen själv, så kontrollen godkände en URL som aldrig hörde till
    // previewen. Slutlig URL prövas därför mot samma allowlist som den första.
    assertFinalUrlAllowed(
      page.url(),
      (finalUrl) => isAllowedCaptureUrl(finalUrl, "Inspector-capture"),
      "Inspector capture",
    );

    let previewBuffer = await page.screenshot({
      type: "png",
      omitBackground: false,
      clip,
      timeout: SCREENSHOT_TIMEOUT_MS,
    });
    let previewMimeType = "image/png";
    for (const quality of JPEG_FALLBACK_QUALITIES) {
      if (previewBuffer.byteLength <= MAX_CAPTURE_BYTES) break;
      previewBuffer = await page.screenshot({
        type: "jpeg",
        quality,
        clip,
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
      previewMimeType = "image/jpeg";
    }
    if (!(await isInspectorPreviewIdentityCurrent(parsedIdentity.identity, page.url()))) {
      return NextResponse.json(
        { success: false, staleIdentity: true, error: "Previewen byttes under bildfångsten." },
        { status: 409 },
      );
    }
    if (previewBuffer.byteLength > MAX_CAPTURE_BYTES) {
      // Hellre ett ärligt fel än en bild som ser ut att fungera och sedan
      // avvisas av uppladdningen utan att modellen får något.
      return NextResponse.json(
        {
          success: false,
          error: "Den markerade ytan blev för stor att skicka. Markera ett mindre område.",
        },
        { status: 413 },
      );
    }
    const previewDataUrl = `data:${previewMimeType};base64,${previewBuffer.toString("base64")}`;

    return NextResponse.json({
      success: true,
      source: "local" as const,
      capturedUrl: page.url(),
      previewDataUrl,
      previewMimeType,
      xPercent,
      yPercent,
      viewportWidth,
      viewportHeight,
      pointSummary: regionClip
        ? `Markerad yta ${clip.width}×${clip.height} px vid x ${xPercent.toFixed(1)}% • y ${yPercent.toFixed(1)}%`
        : pointDetails.pointSummary,
      element: pointDetails.element,
      clip,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown capture error";
    return NextResponse.json(
      {
        success: false,
        error: "Kunde inte skapa punktbild. Kontrollera att URL:en är publik och att Playwright Chromium finns installerad.",
        details: message,
      },
      { status: 502 },
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

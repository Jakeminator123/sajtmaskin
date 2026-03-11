import { NextResponse } from "next/server";
import net from "node:net";
import type { Page } from "playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_SERVERLESS = Boolean(process.env.VERCEL);

const NAVIGATION_TIMEOUT_MS = 25_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;
const DEFAULT_CROP_WIDTH = 420;
const DEFAULT_CROP_HEIGHT = 280;
const WORKER_URL = process.env.INSPECTOR_CAPTURE_WORKER_URL?.trim() || "";
const WORKER_TOKEN = process.env.INSPECTOR_CAPTURE_WORKER_TOKEN?.trim() || "";
const FORCE_WORKER_ONLY = (() => {
  const raw = process.env.INSPECTOR_FORCE_WORKER_ONLY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
})();
const WORKER_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.INSPECTOR_CAPTURE_WORKER_TIMEOUT_MS || "7000");
  if (!Number.isFinite(parsed)) return 7000;
  return Math.max(1000, Math.min(30_000, Math.round(parsed)));
})();

type CaptureRequest = {
  url: string;
  xPercent: number;
  yPercent: number;
  viewportWidth: number;
  viewportHeight: number;
  cropWidth?: number;
  cropHeight?: number;
};

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

function normalizeHost(hostname: string): string {
  const lowered = hostname.toLowerCase().trim().replace(/\.$/, "");
  if (lowered.startsWith("[") && lowered.endsWith("]")) {
    return lowered.slice(1, -1);
  }
  return lowered;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

function isDisallowedHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return true;

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) return isPrivateIpv6(host);
  return false;
}

async function tryWorkerCapture(payload: CaptureRequest): Promise<NextResponse | null> {
  if (!WORKER_URL) return null;

  let captureUrl: URL;
  try {
    captureUrl = new URL("/capture", WORKER_URL);
  } catch {
    console.warn("[inspector-capture] Invalid INSPECTOR_CAPTURE_WORKER_URL, falling back to local.");
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  try {
    const headers: HeadersInit = { "content-type": "application/json" };
    if (WORKER_TOKEN) {
      headers["x-inspector-token"] = WORKER_TOKEN;
    }

    const response = await fetch(captureUrl.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && data) {
      return NextResponse.json(data, { status: 200 });
    }

    const reason = data && typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
    console.warn(`[inspector-capture] Worker unavailable (${reason}), using local fallback.`);
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown worker error";
    console.warn(`[inspector-capture] Worker request failed (${reason}), using local fallback.`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
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
  return { url, xPercent, yPercent, viewportWidth, viewportHeight, cropWidth, cropHeight };
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = parseBody(json);
  if (!parsed) {
    return NextResponse.json(
      { success: false, error: "Ogiltig payload. Kräver url, xPercent, yPercent, viewportWidth, viewportHeight." },
      { status: 400 },
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
  if (isDisallowedHost(target.hostname)) {
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

  const workerResult = await tryWorkerCapture({
    url: target.toString(),
    xPercent,
    yPercent,
    viewportWidth,
    viewportHeight,
    cropWidth,
    cropHeight,
  });
  if (workerResult) return workerResult;

  if (WORKER_URL && FORCE_WORKER_ONLY) {
    return NextResponse.json(
      {
        success: false,
        error: "Inspector worker är konfigurerad men kunde inte nås. Lokal fallback är avstängd.",
      },
      { status: 503 },
    );
  }

  if (IS_SERVERLESS) {
    return NextResponse.json(
      { success: false, error: "Inspector worker is not available. Local Playwright fallback is not supported in serverless." },
      { status: 503 },
    );
  }

  const { chromium } = await import("playwright");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: viewportWidth, height: viewportHeight },
      deviceScaleFactor: 2,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await waitForStabilizedPage(page);
    const pointDetails = await describePoint(page, centerX, centerY);
    const resolvedCenterX = clamp(Math.round(pointDetails.resolvedX), 0, viewportWidth);
    const resolvedCenterY = clamp(Math.round(pointDetails.resolvedY), 0, viewportHeight);
    const clipX = clamp(Math.round(resolvedCenterX - cropWidth / 2), 0, Math.max(0, viewportWidth - cropWidth));
    const clipY = clamp(Math.round(resolvedCenterY - cropHeight / 2), 0, Math.max(0, viewportHeight - cropHeight));
    await drawCaptureOverlay(page, resolvedCenterX, resolvedCenterY, xPercent, yPercent);

    const previewBuffer = await page.screenshot({
      type: "png",
      omitBackground: false,
      clip: { x: clipX, y: clipY, width: cropWidth, height: cropHeight },
    });
    const previewDataUrl = `data:image/png;base64,${previewBuffer.toString("base64")}`;

    return NextResponse.json({
      success: true,
      source: "local" as const,
      capturedUrl: page.url(),
      previewDataUrl,
      previewMimeType: "image/png",
      xPercent,
      yPercent,
      viewportWidth,
      viewportHeight,
      pointSummary: pointDetails.pointSummary,
      element: pointDetails.element,
      clip: {
        x: clipX,
        y: clipY,
        width: cropWidth,
        height: cropHeight,
      },
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


import http from "node:http";
import net from "node:net";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || 3310);
const AUTH_TOKEN = process.env.INSPECTOR_CAPTURE_WORKER_TOKEN || "";
const NAVIGATION_TIMEOUT_MS = Number(process.env.INSPECTOR_CAPTURE_NAVIGATION_TIMEOUT_MS || 25_000);
const NETWORK_IDLE_TIMEOUT_MS = Number(process.env.INSPECTOR_CAPTURE_NETWORK_IDLE_TIMEOUT_MS || 8_000);
const MAX_BODY_BYTES = Number(process.env.INSPECTOR_CAPTURE_MAX_BODY_BYTES || 64_000);
const DEFAULT_CROP_WIDTH = 420;
const DEFAULT_CROP_HEIGHT = 280;

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

function parseCaptureBody(body) {
  if (!body || typeof body !== "object") return null;

  const obj = body;
  const url = typeof obj.url === "string" ? obj.url.trim() : "";
  const xPercent = toNumber(obj.xPercent);
  const yPercent = toNumber(obj.yPercent);
  const viewportWidth = toNumber(obj.viewportWidth);
  const viewportHeight = toNumber(obj.viewportHeight);
  const cropWidthRaw = toNumber(obj.cropWidth);
  const cropHeightRaw = toNumber(obj.cropHeight);

  if (!url) return null;
  if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) return null;
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) return null;

  return {
    url,
    xPercent,
    yPercent,
    viewportWidth,
    viewportHeight,
    cropWidth: Number.isFinite(cropWidthRaw) ? cropWidthRaw : undefined,
    cropHeight: Number.isFinite(cropHeightRaw) ? cropHeightRaw : undefined,
  };
}

function normalizeHost(hostname) {
  const lowered = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (lowered.startsWith("[") && lowered.endsWith("]")) {
    return lowered.slice(1, -1);
  }
  return lowered;
}

function isPrivateIpv4(host) {
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

function isPrivateIpv6(host) {
  const normalized = host.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

function isDisallowedHost(hostname) {
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

async function waitForStabilizedPage(page) {
  await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);
  await page
    .waitForSelector("body > *:not(script):not(style)", {
      state: "attached",
      timeout: 4_000,
    })
    .catch(() => undefined);
  await page
    .evaluate(async () => {
      const fontsApi = document.fonts;
      if (!fontsApi?.ready) return;
      try {
        await fontsApi.ready;
      } catch {
        // Ignore font loading errors.
      }
    })
    .catch(() => undefined);
  await page.waitForTimeout(800).catch(() => undefined);
}

async function describePoint(page, x, y) {
  return page.evaluate(({ pointX, pointY }) => {
    const cleanText = (value) => {
      if (!value) return null;
      const normalized = String(value).replace(/\s+/g, " ").trim();
      if (!normalized) return null;
      return normalized.slice(0, 160);
    };

    const cssEscape = (value) => {
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };

    const buildSelector = (el) => {
      const parts = [];
      let current = el;
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
        const parent = current.parentElement;
        let nth = 1;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (candidate) => candidate.tagName === current.tagName,
          );
          nth = Math.max(1, siblings.indexOf(current) + 1);
        }
        parts.unshift(`${tag}${classNames}:nth-of-type(${nth})`);
        current = parent;
      }
      return parts.length > 0 ? parts.join(" > ") : null;
    };

    const maxX = Math.max(0, window.innerWidth - 1);
    const maxY = Math.max(0, window.innerHeight - 1);
    const clampCoord = (value, max) => Math.max(0, Math.min(max, Math.round(value)));
    const cleanTag = (el) => (el?.tagName || "").toLowerCase();
    const isRootLike = (el) => {
      const tag = cleanTag(el);
      return tag === "html" || tag === "body" || tag === "head" || tag === "style" || tag === "script";
    };

    const pickAtPoint = (sampleX, sampleY) => {
      const stack = document.elementsFromPoint(sampleX, sampleY);
      const firstUseful = stack.find((entry) => !isRootLike(entry));
      if (firstUseful instanceof HTMLElement) return firstUseful;
      const fallback = document.elementFromPoint(sampleX, sampleY);
      return fallback instanceof HTMLElement ? fallback : null;
    };

    const offsets = [
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

    let best = null;
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

    const element = target;
    const id = element.id || null;
    const className = cleanText(element.className || null);
    const text = cleanText(element.innerText || element.textContent || null);
    const ariaLabel = cleanText(element.getAttribute("aria-label"));
    const role = cleanText(element.getAttribute("role"));
    const href =
      element instanceof HTMLAnchorElement ? cleanText(element.href) : cleanText(element.getAttribute("href"));
    const selector = buildSelector(element);

    let nearestHeading = null;
    let headingCandidate = element.closest("h1,h2,h3,h4,h5,h6");
    if (!headingCandidate) {
      const sectionRoot =
        element.closest("section,article,main,aside,nav,header,footer") || element.parentElement;
      headingCandidate = sectionRoot?.querySelector?.("h1,h2,h3,h4,h5,h6") || null;
    }
    if (headingCandidate) {
      nearestHeading = cleanText(headingCandidate.innerText || headingCandidate.textContent || "");
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
  }, { pointX: x, pointY: y });
}

async function drawCaptureOverlay(page, x, y, xPercent, yPercent) {
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
      pulse.style.transform = "translate(-50%, -50%)";

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

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Body too large");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return null;
  const raw = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(raw);
}

async function handleCapture(parsed) {
  let target;
  try {
    target = new URL(parsed.url);
  } catch {
    return { status: 400, body: { success: false, error: "Ogiltig URL." } };
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return { status: 400, body: { success: false, error: "Endast http/https stöds." } };
  }
  if (isDisallowedHost(target.hostname)) {
    return { status: 403, body: { success: false, error: "Otillåten host för capture." } };
  }

  const viewportWidth = clamp(Math.round(parsed.viewportWidth), 320, 2400);
  const viewportHeight = clamp(Math.round(parsed.viewportHeight), 240, 2400);
  const xPercent = clamp(parsed.xPercent, 0, 100);
  const yPercent = clamp(parsed.yPercent, 0, 100);
  const centerX = clamp((xPercent / 100) * viewportWidth, 0, viewportWidth);
  const centerY = clamp((yPercent / 100) * viewportHeight, 0, viewportHeight);
  const cropWidth = clamp(Math.round(parsed.cropWidth ?? DEFAULT_CROP_WIDTH), 120, viewportWidth);
  const cropHeight = clamp(Math.round(parsed.cropHeight ?? DEFAULT_CROP_HEIGHT), 90, viewportHeight);

  let browser = null;
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
    return {
      status: 200,
      body: {
        success: true,
        source: "worker",
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
      },
    };
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown capture error";
    return {
      status: 502,
      body: {
        success: false,
        error:
          "Kunde inte skapa punktbild. Kontrollera att URL:en är publik och att worker har Chromium tillgänglig.",
        details,
      },
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: "inspector-worker",
      playwright: true,
    });
  }

  if (method === "POST" && url.pathname === "/capture") {
    if (AUTH_TOKEN) {
      const headerToken = req.headers["x-inspector-token"];
      if (headerToken !== AUTH_TOKEN) {
        return json(res, 401, { success: false, error: "Unauthorized" });
      }
    }

    try {
      const body = await readJsonBody(req);
      const parsed = parseCaptureBody(body);
      if (!parsed) {
        return json(res, 400, {
          success: false,
          error: "Ogiltig payload. Kräver url, xPercent, yPercent, viewportWidth, viewportHeight.",
        });
      }

      const result = await handleCapture(parsed);
      return json(res, result.status, result.body);
    } catch (err) {
      if (err instanceof Error && err.message === "Body too large") {
        return json(res, 413, { success: false, error: "Request body too large" });
      }
      return json(res, 400, { success: false, error: "Ogiltig JSON payload." });
    }
  }

  return json(res, 404, { success: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.info(`[inspector-worker] listening on http://0.0.0.0:${PORT}`);
});


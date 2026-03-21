import { NextResponse } from "next/server";
import net from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_URL = process.env.INSPECTOR_CAPTURE_WORKER_URL?.trim() || "";
const WORKER_TOKEN = process.env.INSPECTOR_CAPTURE_WORKER_TOKEN?.trim() || "";
const FORCE_WORKER_ONLY = (() => {
  const raw = process.env.INSPECTOR_FORCE_WORKER_ONLY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
})();
const WORKER_TIMEOUT_MS = 15_000;
const NAVIGATION_TIMEOUT_MS = 20_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;
const IS_SERVERLESS = Boolean(process.env.VERCEL);

type MapRequest = {
  url: string;
  viewportWidth?: number;
  viewportHeight?: number;
  maxElements?: number;
};

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 60_000;

function cacheKey(url: string, w: number, h: number): string {
  return `${url}|${w}x${h}`;
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

async function tryWorkerElementMap(
  url: string,
  vpW: number,
  vpH: number,
  maxElements: number,
): Promise<NextResponse | null> {
  if (!WORKER_URL) return null;

  let workerEndpoint: URL;
  try {
    workerEndpoint = new URL("/element-map", WORKER_URL);
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  try {
    const headers: HeadersInit = { "content-type": "application/json" };
    if (WORKER_TOKEN) headers["x-inspector-token"] = WORKER_TOKEN;

    const response = await fetch(workerEndpoint.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ url, viewportWidth: vpW, viewportHeight: vpH, maxElements }),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && data) {
      return NextResponse.json(data);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function localElementMap(
  url: string,
  vpW: number,
  vpH: number,
  maxElements: number,
): Promise<NextResponse> {
  const { chromium } = await import("playwright");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: vpW, height: vpH },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {});
    await page
      .waitForFunction(
        () => !document.body?.classList.contains("v0-loading") && document.querySelectorAll("*").length > 20,
        { timeout: 10_000 },
      )
      .catch(() => {});

    const elements = await page.evaluate((max: number) => {
      const results: Array<{
        tag: string;
        id: string | null;
        className: string | null;
        text: string | null;
        vpPercent: { x: number; y: number; w: number; h: number };
      }> = [];
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (vw <= 0 || vh <= 0) return results;

      const all = document.querySelectorAll("*");
      for (let i = 0; i < all.length && results.length < max; i++) {
        const el = all[i] as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (["html", "head", "body", "script", "style", "link", "meta", "noscript", "br"].includes(tag)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        if (rect.bottom < 0 || rect.top > vh * 3) continue;

        const xPct = (rect.left / vw) * 100;
        const yPct = (rect.top / vh) * 100;
        const wPct = (rect.width / vw) * 100;
        const hPct = (rect.height / vh) * 100;

        const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
        const cls = Array.from(el.classList).filter((c) => !c.startsWith("__inspector")).join(" ") || null;

        results.push({
          tag,
          id: el.id || null,
          className: cls,
          text,
          vpPercent: {
            x: Math.round(xPct * 100) / 100,
            y: Math.round(yPct * 100) / 100,
            w: Math.round(wPct * 100) / 100,
            h: Math.round(hPct * 100) / 100,
          },
        });
      }
      return results;
    }, maxElements);

    return NextResponse.json({
      success: true,
      source: "local",
      elements,
      viewport: { width: vpW, height: vpH },
      elementCount: elements.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Local element map failed";
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as MapRequest | null;
  if (!body?.url?.trim()) {
    return NextResponse.json({ success: false, error: "Missing url." }, { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(body.url);
  } catch {
    return NextResponse.json({ success: false, error: "Ogiltig URL." }, { status: 400 });
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    return NextResponse.json({ success: false, error: "Endast http/https stöds." }, { status: 400 });
  }
  if (isDisallowedHost(target.hostname)) {
    return NextResponse.json({ success: false, error: "Otillåten host för inspect." }, { status: 403 });
  }

  const vpW = Math.round(Number(body.viewportWidth) || 1280);
  const vpH = Math.round(Number(body.viewportHeight) || 800);
  const maxElements = body.maxElements || 300;
  const normalizedUrl = target.toString();
  const key = cacheKey(normalizedUrl, vpW, vpH);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const workerResult = await tryWorkerElementMap(normalizedUrl, vpW, vpH, maxElements);
  if (workerResult) {
    const data = await workerResult.json();
    cache.set(key, { data, ts: Date.now() });
    return NextResponse.json(data);
  }

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

  const localResult = await localElementMap(normalizedUrl, vpW, vpH, maxElements);
  if (localResult.ok) {
    const data = await localResult.json();
    cache.set(key, { data, ts: Date.now() });
    return NextResponse.json(data);
  }

  return localResult;
}

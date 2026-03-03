import { NextResponse } from "next/server";
import { chromium } from "playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_URL = process.env.INSPECTOR_CAPTURE_WORKER_URL?.trim() || "";
const WORKER_TOKEN = process.env.INSPECTOR_CAPTURE_WORKER_TOKEN?.trim() || "";
const WORKER_TIMEOUT_MS = 15_000;
const NAVIGATION_TIMEOUT_MS = 20_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;

type MapRequest = {
  url: string;
  viewportWidth?: number;
  viewportHeight?: number;
  maxElements?: number;
};

type ElementInfo = {
  tag: string;
  id: string | null;
  className: string | null;
  text: string | null;
  vpPercent: { x: number; y: number; w: number; h: number };
};

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 60_000;

function cacheKey(url: string, w: number, h: number): string {
  return `${url}|${w}x${h}`;
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

  const vpW = Math.round(Number(body.viewportWidth) || 1280);
  const vpH = Math.round(Number(body.viewportHeight) || 800);
  const maxElements = body.maxElements || 300;
  const key = cacheKey(body.url, vpW, vpH);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const workerResult = await tryWorkerElementMap(body.url, vpW, vpH, maxElements);
  if (workerResult) {
    const data = await workerResult.json();
    cache.set(key, { data, ts: Date.now() });
    return NextResponse.json(data);
  }

  const localResult = await localElementMap(body.url, vpW, vpH, maxElements);
  if (localResult.ok) {
    const data = await localResult.json();
    cache.set(key, { data, ts: Date.now() });
    return NextResponse.json(data);
  }

  return localResult;
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getBuilderInspectorDisabledMessage, isBuilderInspectorEnabled } from "@/lib/builder/inspector-feature";
import { isDisallowedHost, isLoopbackHost } from "@/lib/security/is-disallowed-host";
import { withRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function cacheKey(url: string, w: number, h: number, maxElements: number): string {
  return `${url}|${w}x${h}|max=${maxElements}`;
}

/** Expected "inspector capture is unavailable right now" response. */
function unavailableResponse(reason: string): NextResponse {
  return NextResponse.json(
    { success: false, unavailable: true, error: reason },
    { status: 200 },
  );
}

async function localElementMap(
  url: string,
  vpW: number,
  vpH: number,
  maxElements: number,
): Promise<NextResponse> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return unavailableResponse(
      "Inspector worker is not running and the local Playwright fallback is not installed.",
    );
  }
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
    // Capture failures are expected during preview warmup (navigation
    // timeout, VM not ready, target route 404 for sub-paths).
    return unavailableResponse(msg);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function requireInspectorIdentity(req: Request): Promise<Response | null> {
  const user = await getCurrentUser(req);
  const sessionId = getSessionIdFromRequest(req);
  if (!user && !sessionId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  return withRateLimit(req, "inspector:element-map", () => handlePOST(req));
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

  const body = (await req.json().catch(() => null)) as MapRequest | null;
  if (!body?.url?.trim()) {
    return NextResponse.json({ success: false, error: "Missing url." }, { status: 400 });
  }

  // SSRF guard: localElementMap navigates this URL server-side with Playwright.
  // Block localhost / private / metadata hosts for an authenticated caller.
  let target: URL;
  try {
    target = new URL(body.url);
  } catch {
    return NextResponse.json({ success: false, error: "Ogiltig URL." }, { status: 400 });
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    return NextResponse.json({ success: false, error: "Endast http/https stöds." }, { status: 400 });
  }
  // Loopback exemption: the compatibility preview (/api/preview-render) is
  // expanded client-side to the app's own origin, which in local dev is loopback
  // (e.g. localhost:3000). Re-allow ONLY loopback so the own-fallback preview
  // keeps working in dev, while private/metadata targets stay blocked. This must
  // be derived from the parsed target host — NOT from req.url / the Host header,
  // which is client-controllable and would let a caller forge same-origin and
  // drive Playwright to a private/metadata host.
  if (!isLoopbackHost(target.hostname) && isDisallowedHost(target.hostname)) {
    return NextResponse.json({ success: false, error: "Otillåten host för capture." }, { status: 403 });
  }

  const vpW = Math.round(Number(body.viewportWidth) || 1280);
  const vpH = Math.round(Number(body.viewportHeight) || 800);
  const maxElements = body.maxElements || 300;
  const key = cacheKey(body.url, vpW, vpH, maxElements);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  if (IS_SERVERLESS) {
    return NextResponse.json(
      { success: false, error: "Inspector element map is not available in serverless (local Playwright fallback is unsupported here)." },
      { status: 503 },
    );
  }

  const localResult = await localElementMap(body.url, vpW, vpH, maxElements);
  if (localResult.ok) {
    const data = (await localResult.json()) as { success?: boolean; unavailable?: boolean };
    // Only cache real captures; expected unavailable responses must not
    // starve the client's retry loop.
    if (data.success === true) {
      cache.set(key, { data, ts: Date.now() });
    }
    return NextResponse.json(data);
  }

  return localResult;
}

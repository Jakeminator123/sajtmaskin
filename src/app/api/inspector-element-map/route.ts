import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_URL = process.env.INSPECTOR_CAPTURE_WORKER_URL?.trim() || "";
const WORKER_TOKEN = process.env.INSPECTOR_CAPTURE_WORKER_TOKEN?.trim() || "";
const WORKER_TIMEOUT_MS = 15_000;

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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as MapRequest | null;
  if (!body?.url?.trim()) {
    return NextResponse.json({ success: false, error: "Missing url." }, { status: 400 });
  }

  const vpW = Math.round(Number(body.viewportWidth) || 1280);
  const vpH = Math.round(Number(body.viewportHeight) || 800);
  const key = cacheKey(body.url, vpW, vpH);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  if (!WORKER_URL) {
    return NextResponse.json(
      { success: false, error: "Inspector worker is not configured (INSPECTOR_CAPTURE_WORKER_URL)." },
      { status: 501 },
    );
  }

  let workerEndpoint: URL;
  try {
    workerEndpoint = new URL("/element-map", WORKER_URL);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid worker URL." }, { status: 500 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  try {
    const headers: HeadersInit = { "content-type": "application/json" };
    if (WORKER_TOKEN) headers["x-inspector-token"] = WORKER_TOKEN;

    const response = await fetch(workerEndpoint.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: body.url,
        viewportWidth: vpW,
        viewportHeight: vpH,
        maxElements: body.maxElements || 300,
      }),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && data) {
      cache.set(key, { data, ts: Date.now() });
      return NextResponse.json(data);
    }

    const reason = data && typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
    return NextResponse.json({ success: false, error: reason }, { status: response.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Worker request failed";
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}

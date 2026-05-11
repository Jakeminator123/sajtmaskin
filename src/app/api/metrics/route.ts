import { NextResponse, type NextRequest } from "next/server";
import { getPrometheusMetrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROM_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

function constantTimeEqual(a: string, b: string): boolean {
  // Length difference is itself a side-channel signal that cannot be hidden,
  // but we still avoid early-exit byte comparison for equal-length inputs.
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken) {
    return queryToken;
  }
  return null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const expected = process.env.SAJTMASKIN_METRICS_TOKEN;
  if (!expected || expected.length === 0) {
    return new NextResponse("metrics_disabled", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const provided = extractToken(req);
  if (!provided || !constantTimeEqual(provided, expected)) {
    console.warn("[metrics] unauthorized request", {
      hasAuthorizationHeader: Boolean(req.headers.get("authorization") ?? req.headers.get("Authorization")),
      hasQueryToken: req.nextUrl.searchParams.has("token"),
    });
    return new NextResponse("unauthorized", {
      status: 401,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "WWW-Authenticate": 'Bearer realm="sajtmaskin-metrics"',
      },
    });
  }

  const body = await getPrometheusMetrics();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": PROM_CONTENT_TYPE,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

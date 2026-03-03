import { NextResponse } from "next/server";
import { OPENCLAW } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const gatewayUrl = OPENCLAW.gatewayUrl;
  if (!gatewayUrl) {
    return NextResponse.json(
      { status: "unconfigured", error: "OPENCLAW_GATEWAY_URL not set" },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${gatewayUrl}/health`, {
      headers: OPENCLAW.gatewayToken
        ? { Authorization: `Bearer ${OPENCLAW.gatewayToken}` }
        : {},
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { status: "unhealthy", upstream: res.status },
        { status: 502 },
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (e) {
    return NextResponse.json(
      { status: "unreachable", error: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}

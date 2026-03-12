import { NextResponse } from "next/server";
import { checkOpenClawGatewayHealth } from "@/lib/openclaw/status";

export const runtime = "nodejs";

export async function GET() {
  const health = await checkOpenClawGatewayHealth();
  const statusCode =
    health.status === "ok"
      ? 200
      : health.status === "unconfigured"
        ? 503
        : 502;

  return NextResponse.json(health, { status: statusCode });
}

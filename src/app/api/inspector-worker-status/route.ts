import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_URL = process.env.INSPECTOR_CAPTURE_WORKER_URL?.trim() || "";
const HEALTH_TIMEOUT_MS = 1500;

export async function GET() {
  if (!WORKER_URL) {
    return NextResponse.json({
      enabled: false,
      healthy: false,
      status: "disabled" as const,
      message: "Inspector worker is not configured.",
    });
  }

  let healthUrl: URL;
  try {
    healthUrl = new URL("/health", WORKER_URL);
  } catch {
    return NextResponse.json({
      enabled: true,
      healthy: false,
      status: "unhealthy" as const,
      message: "Inspector worker URL is invalid.",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(healthUrl.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    const isHealthy = response.ok && body?.ok === true;

    return NextResponse.json({
      enabled: true,
      healthy: isHealthy,
      status: (isHealthy ? "healthy" : "unhealthy") as "healthy" | "unhealthy",
      workerUrl: WORKER_URL,
      message: isHealthy ? "Inspector worker is reachable." : "Inspector worker did not return healthy status.",
    });
  } catch {
    return NextResponse.json({
      enabled: true,
      healthy: false,
      status: "unhealthy" as const,
      workerUrl: WORKER_URL,
      message: "Inspector worker is unreachable.",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

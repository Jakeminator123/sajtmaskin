/**
 * API Route: Analytics
 * GET /api/analytics - Get analytics stats (requires admin auth)
 * POST /api/analytics - Record a page view
 */

import { getCurrentUser } from "@/lib/auth/auth";
import {
  TEST_USER_EMAIL,
  getAnalyticsStats,
  recordPageView,
} from "@/lib/data/database";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

// Safely parse JSON without throwing on empty/invalid bodies
async function parseJsonBody<T>(
  req: NextRequest
): Promise<T | Record<string, never>> {
  try {
    const text = await req.text();
    if (!text) return {} as Record<string, never>;
    return JSON.parse(text) as T;
  } catch (error) {
    console.warn("[API/analytics] Failed to parse request body:", error);
    return {} as Record<string, never>;
  }
}

// Record page view
export async function POST(req: NextRequest) {
  try {
    const body = await parseJsonBody<{ path?: string; referrer?: string }>(req);
    const { path, referrer } = body as { path?: string; referrer?: string };

    if (!path) {
      return NextResponse.json(
        { success: false, error: "Path required" },
        { status: 400 }
      );
    }

    const sessionId = getSessionIdFromRequest(req);
    const user = await getCurrentUser(req);
    const ipAddress =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || undefined;

    recordPageView(
      path,
      sessionId || undefined,
      user?.id,
      ipAddress,
      userAgent,
      referrer
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/analytics] Error recording page view:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record page view" },
      { status: 500 }
    );
  }
}

// Get analytics stats (admin only - must be logged in as admin user)
export async function GET(req: NextRequest) {
  try {
    // Check if user is logged in as admin (TEST_USER_EMAIL)
    const user = await getCurrentUser(req);

    if (!user || user.email !== TEST_USER_EMAIL) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - admin access required" },
        { status: 401 }
      );
    }

    const days = parseInt(req.nextUrl.searchParams.get("days") || "30");
    const stats = getAnalyticsStats(days);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("[API/analytics] Error getting stats:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get stats" },
      { status: 500 }
    );
  }
}

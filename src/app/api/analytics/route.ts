/**
 * API Route: Analytics
 * GET /api/analytics - Get analytics stats (requires admin auth)
 * POST /api/analytics - Record a page view
 */

import { requireAdminAccess } from "@/lib/auth/admin";
import { getCurrentUser } from "@/lib/auth/auth";
import { getAnalyticsStats, recordPageView } from "@/lib/db/services/analytics";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { isServerOnlyKostnadsfriPath } from "@/lib/kostnadsfri/analytics-paths";
import { readRequestTextWithLimit } from "@/lib/api/read-limited-body";
import { withRateLimit } from "@/lib/rate-limit";
import { after, NextRequest, NextResponse } from "next/server";

const MAX_ANALYTICS_URL_CHARS = 2_048;
const MAX_ANALYTICS_BODY_BYTES = 16_384;

// Safely parse JSON without throwing on empty/invalid bodies
async function parseJsonBody<T>(
  req: NextRequest,
): Promise<{ ok: true; body: T | Record<string, never> } | { ok: false }> {
  try {
    const result = await readRequestTextWithLimit(req, MAX_ANALYTICS_BODY_BYTES);
    if (!result.ok) return { ok: false };
    if (!result.text) return { ok: true, body: {} as Record<string, never> };
    return { ok: true, body: JSON.parse(result.text) as T };
  } catch (error) {
    console.warn("[API/analytics] Failed to parse request body:", error);
    return { ok: true, body: {} as Record<string, never> };
  }
}

// Record page view
export async function POST(req: NextRequest) {
  return withRateLimit(req, "analytics:pageview", () => handlePOST(req));
}

async function handlePOST(req: NextRequest) {
  try {
    const parsed = await parseJsonBody<{ path?: string; referrer?: string }>(req);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: "Payload too large" }, { status: 413 });
    }
    const { path, referrer } = parsed.body as { path?: string; referrer?: string };

    if (!path || typeof path !== "string" || path.length > MAX_ANALYTICS_URL_CHARS) {
      return NextResponse.json({ success: false, error: "Path required" }, { status: 400 });
    }
    if (
      referrer !== undefined &&
      (typeof referrer !== "string" || referrer.length > MAX_ANALYTICS_URL_CHARS)
    ) {
      return NextResponse.json({ success: false, error: "Invalid referrer" }, { status: 400 });
    }
    // Server-authored funnel events (kostnadsfri "verifierad"/"skapad") may not
    // be planted from the browser — also not by the page-view tracker on a 404
    // at that URL; they would forge the admin console's counts.
    if (isServerOnlyKostnadsfriPath(path)) {
      return NextResponse.json({ success: false, error: "Path not allowed" }, { status: 400 });
    }

    const sessionId = getSessionIdFromRequest(req);
    const ipAddress = req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || undefined;

    after(async () => {
      try {
        const user = await getCurrentUser(req);
        await recordPageView(
          path,
          sessionId || undefined,
          user?.id,
          ipAddress,
          userAgent,
          referrer,
        );
      } catch (error) {
        console.error("[API/analytics] Error recording page view:", error);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/analytics] Error recording page view:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record page view" },
      { status: 500 },
    );
  }
}

// Get analytics stats (admin only)
export async function GET(req: NextRequest) {
  try {
    // Was previously gated on `user.email === TEST_USER_EMAIL` only, so the
    // admin panel's statistics returned 401 for every real admin account in
    // ADMIN_EMAILS/SUPERADMIN_EMAIL (the old UI reacted by logging the operator
    // out). `requireAdminAccess` is the same guard the other /api/admin routes
    // use, and its predicate (`isAdminEmailEdge`) still includes TEST_USER_EMAIL
    // — so this is a strict superset of the old access, not a widening beyond
    // admins.
    const admin = await requireAdminAccess(req);
    if (!admin.ok) {
      return admin.response;
    }

    const rawDays = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
    const days = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 366 ? rawDays : 30;
    const stats = await getAnalyticsStats(days);

    return NextResponse.json({
      success: true,
      stats,
      daysUsed: days,
    });
  } catch (error) {
    console.error("[API/analytics] Error getting stats:", error);
    return NextResponse.json({ success: false, error: "Failed to get stats" }, { status: 500 });
  }
}

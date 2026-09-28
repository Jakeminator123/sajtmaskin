import { NextRequest, NextResponse } from "next/server";
import {
  adminHandoffSecret,
  consumeHandoffJti,
  DEFAULT_HANDOFF_NEXT,
  safeAdminPath,
  verifyAdminHandoff,
} from "@/lib/auth/admin-handoff";
import { createConfiguredAdminLogin, setAuthCookie } from "@/lib/auth/auth";
import { withRateLimit } from "@/lib/rate-limit";

type DenyReason = "missing-secret" | "bad-token" | "replay" | "replay-store" | "no-admin";

function deny(request: NextRequest, reason: DenyReason) {
  console.info(`[admin-handoff] denied ${reason}`);
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
}

function adminDestination(request: NextRequest, next: string): URL {
  const origin = request.nextUrl.origin;
  const url = new URL(safeAdminPath(next), origin);
  if (url.origin !== origin) return new URL(DEFAULT_HANDOFF_NEXT, origin);
  return url;
}

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, "auth:admin-handoff", async () => {
    const secret = adminHandoffSecret();
    if (!secret) return deny(request, "missing-secret");

    let token = "";
    try {
      const form = await request.formData();
      const value = form.get("token");
      token = typeof value === "string" ? value : "";
    } catch {
      return deny(request, "bad-token");
    }

    const payload = verifyAdminHandoff(token, secret);
    if (!payload) return deny(request, "bad-token");
    const jtiStatus = await consumeHandoffJti(payload.jti);
    if (jtiStatus === "unavailable") return deny(request, "replay-store");
    if (jtiStatus !== "fresh") return deny(request, "replay");

    try {
      const login = await createConfiguredAdminLogin();
      if ("error" in login) return deny(request, "no-admin");
      await setAuthCookie(login.token, { secure: request.nextUrl.protocol === "https:" });
    } catch {
      return deny(request, "no-admin");
    }

    return NextResponse.redirect(adminDestination(request, payload.next), 303);
  });
}

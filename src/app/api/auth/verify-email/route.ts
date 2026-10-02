/**
 * API Route: Verify email address
 * GET /api/auth/verify-email?token=...
 *
 * Called when the user clicks the link in their verification email.
 * Marks the email as verified and redirects to the app with a status
 * query parameter so the UI can show a confirmation toast.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getUserByVerificationToken,
  markEmailVerified,
} from "@/lib/db/services/users";
import { URLS } from "@/lib/config";
import { sanitizeAuthReturnTo } from "@/lib/auth/auth-return";

function verifiedRedirect(
  appOrigin: string,
  path: string,
  verified: "success" | "error",
  reason?: string,
): string {
  const target = new URL(path, appOrigin);
  target.searchParams.set("verified", verified);
  if (reason) target.searchParams.set("reason", reason);
  return target.toString();
}

export async function GET(req: NextRequest) {
  const appOrigin = URLS.baseUrl;
  const token = req.nextUrl.searchParams.get("token");
  const returnTo = sanitizeAuthReturnTo(
    req.nextUrl.searchParams.get("returnTo"),
    appOrigin,
  ) ?? "/";

  if (!token) {
    return NextResponse.redirect(
      verifiedRedirect(appOrigin, returnTo, "error", "missing_token"),
    );
  }

  try {
    const user = await getUserByVerificationToken(token);

    if (!user) {
      return NextResponse.redirect(
        verifiedRedirect(appOrigin, returnTo, "error", "invalid_or_expired"),
      );
    }

    await markEmailVerified(user.id);

    return NextResponse.redirect(verifiedRedirect(appOrigin, returnTo, "success"));
  } catch (error) {
    console.error("[API/auth/verify-email] Error:", error);
    return NextResponse.redirect(
      verifiedRedirect(appOrigin, returnTo, "error", "server_error"),
    );
  }
}

/**
 * API Route: Verify email address
 * GET /api/auth/verify-email?token=...
 *
 * Called when the user clicks the link in their verification email.
 * Marks the email as verified and redirects to the app with a status
 * query parameter so the UI can show a confirmation toast.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserByVerificationToken, markEmailVerified } from "@/lib/db/services";
import { URLS } from "@/lib/config";

export async function GET(req: NextRequest) {
  const appOrigin = req.nextUrl.origin || URLS.baseUrl;
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      `${appOrigin}/?verified=error&reason=missing_token`,
    );
  }

  try {
    const user = await getUserByVerificationToken(token);

    if (!user) {
      return NextResponse.redirect(
        `${appOrigin}/?verified=error&reason=invalid_or_expired`,
      );
    }

    await markEmailVerified(user.id);

    return NextResponse.redirect(`${appOrigin}/?verified=success`);
  } catch (error) {
    console.error("[API/auth/verify-email] Error:", error);
    return NextResponse.redirect(
      `${appOrigin}/?verified=error&reason=server_error`,
    );
  }
}

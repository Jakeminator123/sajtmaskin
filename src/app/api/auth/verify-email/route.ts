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
  createTransaction,
  getUserByVerificationToken,
  hasSignupBonusTransaction,
  isAdminEmail,
  markEmailVerified,
} from "@/lib/db/services";
import { URLS } from "@/lib/config";

const SIGNUP_BONUS_CREDITS = 50;

export async function GET(req: NextRequest) {
  const appOrigin = URLS.baseUrl;
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

    const shouldGrantSignupBonus =
      user.provider === "email" && !isAdminEmail((user.email || "").toLowerCase());

    if (shouldGrantSignupBonus) {
      try {
        const alreadyAwarded = await hasSignupBonusTransaction(user.id);
        if (!alreadyAwarded) {
          await createTransaction(
            user.id,
            "signup_bonus",
            SIGNUP_BONUS_CREDITS,
            "Välkomstbonus efter e-postverifiering",
          );
        }
      } catch (bonusErr) {
        console.error("[API/auth/verify-email] Failed to award signup bonus:", bonusErr);
      }
    }

    return NextResponse.redirect(`${appOrigin}/?verified=success`);
  } catch (error) {
    console.error("[API/auth/verify-email] Error:", error);
    return NextResponse.redirect(
      `${appOrigin}/?verified=error&reason=server_error`,
    );
  }
}

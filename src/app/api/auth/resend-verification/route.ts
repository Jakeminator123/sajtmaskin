/**
 * API Route: Resend email verification link
 * POST /api/auth/resend-verification
 *
 * Accepts an email address and sends a fresh verification link when
 * the account exists and is not yet verified.
 */

import { NextRequest, NextResponse } from "next/server";
import { createVerificationToken, getUserByEmail } from "@/lib/db/services";
import { sendVerificationEmail } from "@/lib/email/send";
import { withRateLimit } from "@/lib/rateLimit";
import { URLS } from "@/lib/config";

export async function POST(req: NextRequest) {
  return withRateLimit(req, "auth:resend-verification", async () => {
    try {
      const body = await req.json().catch(() => null);
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email) {
        return NextResponse.json(
          { success: false, error: "E-post krävs" },
          { status: 400 },
        );
      }

      const user = await getUserByEmail(email);

      // Return generic success for unknown/already verified users to avoid account enumeration.
      if (!user || user.email_verified) {
        return NextResponse.json({
          success: true,
          message: "Om kontot finns har ett verifieringsmail skickats.",
        });
      }

      const token = await createVerificationToken(user.id);
      const result = await sendVerificationEmail(user.email, token, {
        name: user.name,
        baseUrl: URLS.baseUrl,
      });

      if (!result.success) {
        const isProviderMissing = result.deliveryMode === "provider_missing";
        const isRecipientRestricted = result.deliveryMode === "recipient_restricted";
        const isSenderNotVerified = result.deliveryMode === "sender_not_verified";
        return NextResponse.json(
          {
            success: false,
            error: isProviderMissing
              ? "E-posttjänsten är inte tillgänglig just nu. Försök igen senare."
              : isRecipientRestricted
                ? "E-posttjänsten kör i testläge. Verifiera domänen i Resend för att kunna skicka till andra mottagare."
                : isSenderNotVerified
                  ? "Avsändaradressen är inte verifierad i Resend."
                  : "Kunde inte skicka verifieringsmail",
            reason: isProviderMissing
              ? "provider_missing"
              : isRecipientRestricted
                ? "recipient_restricted"
                : isSenderNotVerified
                  ? "sender_not_verified"
                  : "send_failed",
          },
          { status: isProviderMissing || isRecipientRestricted || isSenderNotVerified ? 503 : 500 },
        );
      }

      return NextResponse.json({
        success: true,
        message: "Om kontot finns har ett verifieringsmail skickats.",
      });
    } catch (error) {
      console.error("[API/auth/resend-verification] Error:", error);
      return NextResponse.json(
        { success: false, error: "Något gick fel" },
        { status: 500 },
      );
    }
  });
}

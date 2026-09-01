/**
 * API Route: Register new user
 * POST /api/auth/register
 *
 * After successful registration a verification email is attempted.
 * Privileged addresses (ADMIN_EMAILS / SUPERADMIN_EMAIL / TEST_USER_EMAIL)
 * cannot be registered here — no row is created and no auth cookie is issued.
 * Those accounts are provisioned via env-credential login. Regular users
 * must verify email before they can log in.
 */

import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth/auth";
import {
  createVerificationToken,
  isAdminEmail,
} from "@/lib/db/services/users";
import { sendVerificationEmail } from "@/lib/email/send";
import { withRateLimit } from "@/lib/rate-limit";
import { URLS } from "@/lib/config";

export async function POST(req: NextRequest) {
  return withRateLimit(req, "auth:register", async () => {
    try {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json({ success: false, error: "Ogiltig request body" }, { status: 400 });
      }
      const { email, password, name } = body as {
        email?: string;
        password?: string;
        name?: string;
      };

      // Validate input
      if (!email || !password) {
        return NextResponse.json(
          { success: false, error: "E-post och lösenord krävs" },
          { status: 400 },
        );
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (isAdminEmail(normalizedEmail)) {
        return NextResponse.json(
          { success: false, error: "Denna adress kan inte registreras här. Logga in med administratörskontot." },
          { status: 403 },
        );
      }

      // Register user
      const result = await registerUser(email, password, name);

      if ("error" in result) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }

      // Regular users must verify by email before login.
      let emailVerificationSent = true;
      let emailVerificationReason:
        | "provider_missing"
        | "recipient_restricted"
        | "sender_not_verified"
        | "send_failed"
        | null = null;
      try {
        const token = await createVerificationToken(result.user.id);
        const sendResult = await sendVerificationEmail(normalizedEmail, token, {
          name,
          baseUrl: URLS.baseUrl,
        });
        emailVerificationSent = sendResult.success;
        if (!sendResult.success) {
          if (sendResult.deliveryMode === "provider_missing") {
            emailVerificationReason = "provider_missing";
          } else if (sendResult.deliveryMode === "recipient_restricted") {
            emailVerificationReason = "recipient_restricted";
          } else if (sendResult.deliveryMode === "sender_not_verified") {
            emailVerificationReason = "sender_not_verified";
          } else {
            emailVerificationReason = "send_failed";
          }
        }
      } catch (emailErr) {
        console.error("[API/auth/register] Failed to send verification email:", emailErr);
        emailVerificationSent = false;
        emailVerificationReason = "send_failed";
      }

      const message = emailVerificationSent
        ? "Vi har skickat ett verifieringsmail. Bekräfta din e-post för att aktivera kontot och din kostnadsfria första generering."
        : emailVerificationReason === "provider_missing"
          ? "Konto skapat, men verifieringsmail kunde inte skickas just nu eftersom e-posttjänsten saknas."
          : emailVerificationReason === "recipient_restricted"
            ? "Konto skapat, men e-posttjänsten är i testläge. Verifiera domänen i Resend för att skicka till andra mottagare."
            : emailVerificationReason === "sender_not_verified"
              ? "Konto skapat, men avsändaradressen är inte verifierad i Resend."
          : "Konto skapat, men verifieringsmail kunde inte skickas. Försök igen via 'Skicka verifieringsmail igen'.";

      return NextResponse.json({
        success: true,
        requiresEmailVerification: true,
        emailVerificationSent,
        emailVerificationReason,
        canResendVerification: true,
        message,
        user: null,
      });
    } catch (error) {
      console.error("[API/auth/register] Error:", error);
      return NextResponse.json(
        { success: false, error: "Något gick fel vid registrering" },
        { status: 500 },
      );
    }
  });
}

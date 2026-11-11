/**
 * API Route: Register new user
 * POST /api/auth/register
 *
 * After successful registration a verification email is attempted.
 * Privileged addresses cannot be registered here: those accounts must be
 * provisioned through the configured admin credentials. Regular users must
 * verify email before they can log in.
 */

import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth/auth";
import { createVerificationToken, isAdminEmail } from "@/lib/db/services/users";
import { sendVerificationEmail } from "@/lib/email/send";
import { withRateLimit } from "@/lib/rate-limit";
import { URLS } from "@/lib/config";
import { sanitizeAuthReturnTo } from "@/lib/auth/auth-return";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 1_024;
const MAX_NAME_LENGTH = 200;
const MAX_RETURN_TO_LENGTH = 2_048;
const MAX_REGISTER_BODY_BYTES = 8_192;

export async function POST(req: NextRequest) {
  return withRateLimit(req, "auth:register", async () => {
    try {
      const parsedBody = await readRequestJsonWithLimit<unknown>(req, MAX_REGISTER_BODY_BYTES);
      if (!parsedBody.ok && parsedBody.reason === "too_large") {
        return NextResponse.json(
          { success: false, error: "För stor request body" },
          { status: 413 },
        );
      }
      const body = parsedBody.ok ? parsedBody.value : null;
      if (!body || typeof body !== "object") {
        return NextResponse.json(
          { success: false, error: "Ogiltig request body" },
          { status: 400 },
        );
      }
      const { email, password, name, returnTo } = body as {
        email?: string;
        password?: string;
        name?: string;
        returnTo?: string;
      };

      // Validate input
      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password ||
        email.length > MAX_EMAIL_LENGTH ||
        password.length > MAX_PASSWORD_LENGTH ||
        (name !== undefined && (typeof name !== "string" || name.length > MAX_NAME_LENGTH)) ||
        (returnTo !== undefined &&
          (typeof returnTo !== "string" || returnTo.length > MAX_RETURN_TO_LENGTH))
      ) {
        return NextResponse.json(
          { success: false, error: "E-post och lösenord krävs" },
          { status: 400 },
        );
      }
      const safeReturnTo = sanitizeAuthReturnTo(returnTo, URLS.baseUrl);

      const normalizedEmail = email.trim().toLowerCase();
      if (isAdminEmail(normalizedEmail)) {
        return NextResponse.json(
          {
            success: false,
            error: "Denna adress kan inte registreras här. Logga in med administratörskontot.",
          },
          { status: 403 },
        );
      }

      // Register regular user only after the privileged-address guard.
      const result = await registerUser(email, password, name);

      if ("error" in result) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }

      // Regular users must verify by email before login.
      let emailVerificationSent = true;
      let emailVerificationReason:
        "provider_missing" | "recipient_restricted" | "sender_not_verified" | "send_failed" | null =
        null;
      try {
        const token = await createVerificationToken(result.user.id);
        const sendResult = await sendVerificationEmail(normalizedEmail, token, {
          name,
          baseUrl: URLS.baseUrl,
          returnTo: safeReturnTo,
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
        ? "Vi har skickat ett verifieringsmail. Öppna länken och välj ditt lösenord för att bekräfta din e-post och aktivera kontot."
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

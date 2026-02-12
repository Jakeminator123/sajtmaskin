/**
 * API Route: Register new user
 * POST /api/auth/register
 *
 * After successful registration a verification email is attempted.
 * Non-admin users must verify email before they can log in.
 */

import { NextRequest, NextResponse } from "next/server";
import { registerUser, setAuthCookie } from "@/lib/auth/auth";
import {
  createTransaction,
  createVerificationToken,
  isAdminEmail,
  markEmailVerified,
  setUserDiamonds,
} from "@/lib/db/services";
import { sendVerificationEmail } from "@/lib/email/send";

const ADMIN_DIAMONDS = Number(process.env.SUPERADMIN_DIAMONDS) || 10_000;

export async function POST(req: NextRequest) {
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

    // Register user
    const result = await registerUser(email, password, name);

    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // Record signup bonus transaction
    await createTransaction(
      result.user.id,
      "signup_bonus",
      0, // Already have 50 diamonds from creation
      "Välkomstbonus vid registrering",
    );

    const normalizedEmail = email.trim().toLowerCase();
    const isAdmin = isAdminEmail(normalizedEmail);

    // Admin users are auto-verified and can be logged in immediately.
    if (isAdmin) {
      await markEmailVerified(result.user.id);
      const diamonds = Math.max(result.user.diamonds, ADMIN_DIAMONDS);
      if (diamonds !== result.user.diamonds) {
        await setUserDiamonds(result.user.id, diamonds);
      }

      await setAuthCookie(result.token, { secure: req.nextUrl.protocol === "https:" });
      return NextResponse.json({
        success: true,
        requiresEmailVerification: false,
        emailVerificationSent: false,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          image: result.user.image,
          diamonds,
          provider: result.user.provider,
          emailVerified: true,
        },
      });
    }

    // Non-admin users must verify by email before login.
    let emailVerificationSent = true;
    let emailVerificationReason: "provider_missing" | "send_failed" | null = null;
    try {
      const token = await createVerificationToken(result.user.id);
      const sendResult = await sendVerificationEmail(normalizedEmail, token, {
        name,
        baseUrl: req.nextUrl.origin,
      });
      emailVerificationSent = sendResult.success;
      if (!sendResult.success) {
        emailVerificationReason =
          sendResult.deliveryMode === "provider_missing" ? "provider_missing" : "send_failed";
      }
    } catch (emailErr) {
      console.error("[API/auth/register] Failed to send verification email:", emailErr);
      emailVerificationSent = false;
      emailVerificationReason = "send_failed";
    }

    const message = emailVerificationSent
      ? "Vi har skickat ett verifieringsmail. Bekräfta din e-post innan du loggar in."
      : emailVerificationReason === "provider_missing"
        ? "Konto skapat, men verifieringsmail kunde inte skickas just nu eftersom e-posttjänsten saknas."
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
}

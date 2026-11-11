/**
 * API Route: begär en länk för att välja nytt lösenord
 * POST /api/auth/forgot-password  { email }
 *
 * Svarar alltid likadant, oavsett om adressen finns, så att svaret inte avslöjar
 * vilka konton som finns. Privilegierade adresser (admin/env-konton) får ingen
 * länk: de lösenorden ägs av miljövariabler.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, isAdminEmail } from "@/lib/db/services/users";
import {
  PASSWORD_RESET_TOKEN_TTL_MS,
  createPasswordResetToken,
} from "@/lib/db/services/password-reset";
import { sendPasswordResetEmail } from "@/lib/email/send";
import { withRateLimit } from "@/lib/rate-limit";
import { URLS } from "@/lib/config";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";

const MAX_EMAIL_LENGTH = 254;
const MAX_BODY_BYTES = 4_096;

const GENERIC_RESET_MESSAGE =
  "Om det finns ett konto med den adressen har vi skickat en länk för att välja nytt lösenord. Kolla även skräpposten.";

function genericResponse(): NextResponse {
  const response = NextResponse.json({ success: true, message: GENERIC_RESET_MESSAGE });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "auth:password-reset-request", async () => {
    const parsed = await readRequestJsonWithLimit<Record<string, unknown> | null>(
      req,
      MAX_BODY_BYTES,
    );
    if (!parsed.ok && parsed.reason === "too_large") {
      return NextResponse.json({ success: false, error: "För stor request body" }, { status: 413 });
    }
    const body = parsed.ok ? parsed.value : null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > MAX_EMAIL_LENGTH || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Ange en giltig e-postadress." },
        { status: 400 },
      );
    }

    try {
      const user = await getUserByEmail(email);
      if (!user?.email || isAdminEmail(user.email)) return genericResponse();

      const token = await createPasswordResetToken(user.id);
      // null = en länk skickades nyss; svara likadant utan att mejla igen.
      if (!token) return genericResponse();

      const result = await sendPasswordResetEmail(user.email, token, {
        name: user.name,
        baseUrl: URLS.baseUrl,
        validMinutes: Math.round(PASSWORD_RESET_TOKEN_TTL_MS / 60_000),
      });
      if (!result.success) {
        // Loggas för drift, men svaret är detsamma så det inte avslöjar kontot.
        console.error("[API/auth/forgot-password] Reset email not sent:", result.deliveryMode);
      }
    } catch (error) {
      console.error("[API/auth/forgot-password] Error:", error);
    }
    return genericResponse();
  });
}

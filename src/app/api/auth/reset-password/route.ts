/**
 * API Route: välj nytt lösenord via engångslänk
 *
 * GET  /api/auth/reset-password?token=…  (länken i mejlet)
 *   Kontrollerar länken utan att förbruka den, lägger token i en httpOnly-
 *   cookie och skickar vidare till /aterstall-losenord. Token hamnar därmed
 *   aldrig i sidans URL, analys eller klient-JS (samma mönster som
 *   verify-email).
 * POST /api/auth/reset-password  { password, confirmPassword }
 *   Löser in länken och byter lösenord. Skapar ingen session: användaren
 *   loggar in med det nya lösenordet.
 */

import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/auth";
import { URLS } from "@/lib/config";
import {
  MAX_PASSWORD_RESET_TOKEN_LENGTH,
  consumePasswordResetToken,
  findUsablePasswordResetToken,
} from "@/lib/db/services/password-reset";
import { getUserById, isAdminEmail } from "@/lib/db/services/users";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";
import { withRateLimit } from "@/lib/rate-limit";

const RESET_COOKIE = "sajtmaskin_password_reset";
const COOKIE_PATH = "/api/auth/reset-password";
const RESET_PAGE = "/aterstall-losenord";
const COOKIE_MAX_AGE_SECONDS = 30 * 60;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 1_024;

const INVALID_LINK_ERROR =
  "Länken är ogiltig, har redan använts eller har gått ut. Begär en ny via Logga in → Glömt lösenord?";

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function pageUrl(status?: "invalid" | "error"): URL {
  const target = new URL(RESET_PAGE, URLS.baseUrl);
  if (status) target.searchParams.set("status", status);
  return target;
}

function clearResetCookie(response: NextResponse): NextResponse {
  response.cookies.set(RESET_COOKIE, "", {
    path: COOKIE_PATH,
    maxAge: 0,
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(URLS.baseUrl).protocol === "https:",
  });
  return response;
}

/** Öppnar man länken (även länkskannrar) förbrukas den inte. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token.length > MAX_PASSWORD_RESET_TOKEN_LENGTH) {
    return privateResponse(NextResponse.redirect(pageUrl("invalid")));
  }
  try {
    const found = await findUsablePasswordResetToken(token);
    if (!found) return privateResponse(NextResponse.redirect(pageUrl("invalid")));
    const target = pageUrl();
    const remainingSeconds = Math.floor((found.expiresAt.getTime() - Date.now()) / 1000);
    const response = privateResponse(NextResponse.redirect(target));
    response.cookies.set(RESET_COOKIE, token, {
      httpOnly: true,
      secure: target.protocol === "https:",
      sameSite: "strict",
      path: COOKIE_PATH,
      maxAge: Math.max(1, Math.min(COOKIE_MAX_AGE_SECONDS, remainingSeconds)),
    });
    return response;
  } catch (error) {
    console.error("[API/auth/reset-password] GET error:", error);
    return privateResponse(NextResponse.redirect(pageUrl("error")));
  }
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "auth:password-reset", async () => {
    try {
      const token = req.cookies.get(RESET_COOKIE)?.value;
      if (!token || token.length > MAX_PASSWORD_RESET_TOKEN_LENGTH) {
        return privateResponse(
          NextResponse.json({ success: false, error: INVALID_LINK_ERROR }, { status: 400 }),
        );
      }
      const parsed = await readRequestJsonWithLimit<Record<string, unknown> | null>(req, 8_192);
      const body = parsed.ok ? parsed.value : null;
      const password = typeof body?.password === "string" ? body.password : "";
      if (
        password.length < MIN_PASSWORD_LENGTH ||
        password.length > MAX_PASSWORD_LENGTH ||
        password !== body?.confirmPassword
      ) {
        return privateResponse(
          NextResponse.json(
            { success: false, error: "Ange samma lösenord två gånger, med minst 6 tecken." },
            { status: 400 },
          ),
        );
      }

      // Adresser som blivit privilegierade efter att länken skickades får
      // aldrig sitt lösenord satt härifrån (de ägs av env-uppgifter).
      const found = await findUsablePasswordResetToken(token);
      const owner = found ? await getUserById(found.userId) : null;
      if (!found || !owner?.email || isAdminEmail(owner.email)) {
        return clearResetCookie(
          privateResponse(
            NextResponse.json({ success: false, error: INVALID_LINK_ERROR }, { status: 400 }),
          ),
        );
      }

      const userId = await consumePasswordResetToken(token, hashPassword(password));
      if (!userId) {
        return clearResetCookie(
          privateResponse(
            NextResponse.json({ success: false, error: INVALID_LINK_ERROR }, { status: 400 }),
          ),
        );
      }

      return clearResetCookie(privateResponse(NextResponse.json({ success: true })));
    } catch (error) {
      console.error("[API/auth/reset-password] POST error:", error);
      return privateResponse(
        NextResponse.json(
          { success: false, error: "Något gick fel. Försök igen om en stund." },
          { status: 500 },
        ),
      );
    }
  });
}

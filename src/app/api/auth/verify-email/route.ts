import { NextRequest, NextResponse } from "next/server";
import { getUserByVerificationToken, isAdminEmail, verifyEmailWithPassword } from "@/lib/db/services/users";
import { hashPassword } from "@/lib/auth/auth";
import { URLS } from "@/lib/config";
import { sanitizeAuthReturnTo } from "@/lib/auth/auth-return";
import { withRateLimit } from "@/lib/rate-limit";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";

const VERIFICATION_COOKIE = "sajtmaskin_email_verification";
const COOKIE_PATH = "/api/auth/verify-email";
const MAX_TOKEN_LENGTH = 256;

function returnUrl(returnTo: unknown, status: "success" | "error", reason?: string): string {
  const target = new URL(sanitizeAuthReturnTo(typeof returnTo === "string" ? returnTo : null, URLS.baseUrl) ?? "/", URLS.baseUrl);
  target.searchParams.set("verified", status);
  if (reason) target.searchParams.set("reason", reason);
  return target.toString();
}

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/** Opening email (including link scanners) never verifies an account. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const returnTo = sanitizeAuthReturnTo(req.nextUrl.searchParams.get("returnTo"), URLS.baseUrl) ?? "/";
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return privateResponse(NextResponse.redirect(returnUrl(returnTo, "error", token ? "invalid_or_expired" : "missing_token")));
  }
  try {
    const user = await getUserByVerificationToken(token);
    if (!user || user.email_verified || (user.email && isAdminEmail(user.email))) {
      return privateResponse(NextResponse.redirect(returnUrl(returnTo, "error", "invalid_or_expired")));
    }
    const target = new URL("/verify-email", URLS.baseUrl);
    target.searchParams.set("returnTo", returnTo);
    const response = privateResponse(NextResponse.redirect(target));
    // Keep the bearer token out of the page URL, analytics and browser JS.
    response.cookies.set(VERIFICATION_COOKIE, token, {
      httpOnly: true, secure: target.protocol === "https:", sameSite: "strict",
      path: COOKIE_PATH, maxAge: 30 * 60,
    });
    return response;
  } catch {
    return privateResponse(NextResponse.redirect(returnUrl(returnTo, "error", "server_error")));
  }
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "auth:register", async () => {
    try {
      const parsed = await readRequestJsonWithLimit<unknown>(req, 8_192);
      const body = parsed.ok && parsed.value && typeof parsed.value === "object"
        ? parsed.value as Record<string, unknown> : null;
      const token = req.cookies.get(VERIFICATION_COOKIE)?.value;
      if (!token || token.length > MAX_TOKEN_LENGTH) {
        return privateResponse(NextResponse.json({ error: "Länken har gått ut. Öppna verifieringsmailet igen eller begär ett nytt." }, { status: 400 }));
      }
      if (!body || typeof body.password !== "string" || body.password.length < 6 || body.password.length > 1_024 || body.password !== body.confirmPassword) {
        return privateResponse(NextResponse.json({ error: "Ange samma lösenord två gånger, med minst 6 tecken." }, { status: 400 }));
      }
      const user = await getUserByVerificationToken(token);
      if (!user || user.email_verified || (user.email && isAdminEmail(user.email)) ||
        !await verifyEmailWithPassword(token, hashPassword(body.password))) {
        return privateResponse(NextResponse.json({ error: "Länken är ogiltig eller har redan använts. Begär ett nytt verifieringsmail." }, { status: 400 }));
      }
      const response = privateResponse(NextResponse.json({ success: true, redirectTo: returnUrl(body.returnTo, "success") }));
      response.cookies.set(VERIFICATION_COOKIE, "", { path: COOKIE_PATH, maxAge: 0, httpOnly: true, sameSite: "strict", secure: new URL(URLS.baseUrl).protocol === "https:" });
      return response;
    } catch {
      return privateResponse(NextResponse.json({ error: "Verifieringen misslyckades. Försök igen." }, { status: 500 }));
    }
  });
}

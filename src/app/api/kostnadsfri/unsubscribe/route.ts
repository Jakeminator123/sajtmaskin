import { NextRequest, NextResponse } from "next/server";
import { markKostnadsfriPageUnsubscribed } from "@/lib/db/services/kostnadsfri";
import { verifyUnsubscribeToken } from "@/lib/kostnadsfri/unsubscribe";
import { withRateLimit } from "@/lib/rate-limit";

/**
 * One-click List-Unsubscribe (RFC 8058). Gmail POSTs
 * `List-Unsubscribe=One-Click` with the token in the query string.
 * No cookies, no API key — the HMAC is the credential.
 *
 * Same register as a reply with subject «nej tack»: both set
 * `extra_data.unsubscribedAt` on the kostnadsfri page. send.py skips
 * addresses that already have that field.
 */
export async function POST(request: NextRequest) {
  return withRateLimit(request, "kostnadsfri:unsubscribe", () => handleUnsubscribe(request));
}

async function handleUnsubscribe(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return NextResponse.json({ success: false, error: "Ogiltig avreg-länk." }, { status: 400 });
  }

  try {
    await markKostnadsfriPageUnsubscribed(payload.slug);
  } catch {
    return NextResponse.json({ success: false, error: "Kunde inte spara avregistreringen." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { recordKostnadsfriPixelHit } from "@/lib/db/services/kostnadsfri";
import { parseKostnadsfriMailKind } from "@/lib/kostnadsfri/mail-kind";
import { verifyPixelToken } from "@/lib/kostnadsfri/pixel-token";

/**
 * Optional open-pixel for kostnadsfri mail. Off by default at the sender.
 * Zero hits therefore does not mean the mail was unread.
 *
 * Always returns a 1×1 GIF with Cache-Control: no-store, private — even when
 * the token is bad or kind does not match the signature. `kind` is part of
 * the HMAC payload; a query-param swap is not counted. Only rent|animated
 * hits whose query matches the signed kind are stored.
 * A pixel token cannot unsubscribe (different HMAC purpose).
 */

const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, private",
  "Content-Length": String(PIXEL_GIF.length),
};

function pixelResponse() {
  return new NextResponse(new Uint8Array(PIXEL_GIF), { status: 200, headers: PIXEL_HEADERS });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const queryKind = parseKostnadsfriMailKind(request.nextUrl.searchParams.get("kind"));
  const payload = verifyPixelToken(token);

  if (payload && queryKind === payload.kind) {
    try {
      await recordKostnadsfriPixelHit({
        email: payload.email,
        slug: payload.slug,
        kind: payload.kind,
      });
    } catch (error) {
      const type = error instanceof Error ? error.name : typeof error;
      console.error(`[API/kostnadsfri/pixel] Failed to record hit (${type})`);
    }
  }

  return pixelResponse();
}

import { withRateLimit } from "@/lib/rateLimit";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const session = ensureSessionIdFromRequest(req);
  const attachSessionCookie = (response: Response) => {
    if (session.setCookie) {
      response.headers.set("Set-Cookie", session.setCookie);
    }
    return response;
  };
  return withRateLimit(req, "chat:create", async () => {
    return attachSessionCookie(
      NextResponse.json(
        {
          success: false,
          code: "registry_init_removed",
          error:
            "Direkt registry-init ar avvecklad. Anvand own-engine fallback-flodet i buildern i stallet.",
        },
        { status: 410 },
      ),
    );
  });
}

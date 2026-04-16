import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  const headerSecret = req.headers.get("x-cron-secret") || "";

  return bearer === secret || headerSecret === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    skipped: true,
    message:
      "Template embeddings ar lokala och commitade artifacts. Regenerera dem lokalt och deploya om produktionen.",
  });
}

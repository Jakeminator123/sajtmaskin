import { NextResponse, type NextRequest } from "next/server";

import { isLikelyBot } from "@/lib/visits/config";
import { readVisitStats, recordVisit } from "@/lib/visits/server";

// Counters change on every request — never let the CDN cache either method.
export const dynamic = "force-dynamic";

/**
 * GET /api/visits → `{ ok: true, demo, stats }` for the /statistik page.
 * In demo mode (no real store) `stats` is the in-memory sample series and
 * `demo` is true. A store failure answers 502 `visits-read-failed`; the client
 * keeps its retry path.
 */
export async function GET() {
  try {
    const stats = await readVisitStats();
    return NextResponse.json(
      { ok: true, demo: stats.demo, stats },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[visits] read failed", err);
    return NextResponse.json({ ok: false, error: "visits-read-failed" }, { status: 502 });
  }
}

/**
 * POST /api/visits — beacon from `<VisitBeacon />`. Body: `{ newVisitor }`.
 * Always answers 200 so a failing counter never surfaces in the visitor's
 * console; obvious bots are skipped (`counted: false`).
 */
export async function POST(request: NextRequest) {
  if (isLikelyBot(request.headers.get("user-agent"))) {
    return NextResponse.json({ ok: true, counted: false });
  }
  let newVisitor = false;
  try {
    const body = (await request.json()) as { newVisitor?: unknown } | null;
    newVisitor = body?.newVisitor === true;
  } catch {
    // Empty or malformed body: count the view, not the visit.
  }
  try {
    await recordVisit({ newVisitor });
    return NextResponse.json({ ok: true, counted: true });
  } catch (err) {
    console.error("[visits] record failed", err);
    return NextResponse.json({ ok: true, counted: false });
  }
}

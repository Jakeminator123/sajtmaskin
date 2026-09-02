import { NextResponse, type NextRequest } from "next/server";

import { listMedia } from "@/lib/media-storage/server";

// The list comes from the storage API on every request; the CDN may cache the
// JSON briefly so a busy gallery page does not hammer the store.
export const dynamic = "force-dynamic";

const FOLDER_RE = /^[a-z0-9][a-z0-9/_-]{0,80}$/i;

/**
 * GET /api/media?folder=<sub-folder>
 *
 * Returns `{ ok: true, demo, items }`. In demo mode (no real token) `items` is
 * the shipped seed list and `demo` is true — the gallery shows a discreet
 * notice. A storage failure answers 502 `media-list-failed`; the client keeps
 * its retry path. There is deliberately NO upload handler here: uploads go
 * through `uploadMedia()` from an owner-authenticated route only.
 */
export async function GET(request: NextRequest) {
  const rawFolder = request.nextUrl.searchParams.get("folder") ?? "";
  const folder = FOLDER_RE.test(rawFolder) ? rawFolder : "";
  try {
    const result = await listMedia({ folder });
    return NextResponse.json(
      { ok: true, demo: result.demo, items: result.items },
      {
        headers: result.demo
          ? { "Cache-Control": "no-store" }
          : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
      },
    );
  } catch (err) {
    console.error("[media] list failed", err);
    return NextResponse.json({ ok: false, error: "media-list-failed" }, { status: 502 });
  }
}

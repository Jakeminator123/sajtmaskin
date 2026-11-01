import { NextRequest, NextResponse } from "next/server";
import {
  isDevLogViewerEnabled,
  readAvailableDevLogSlugs,
  readDevLogEntries,
} from "@/lib/logging/dev-log-reader";
import { parseBoundedPositiveInteger } from "@/lib/api/bounded-query-integer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isDevLogViewerEnabled()) {
    return NextResponse.json(
      {
        success: false,
        enabled: false,
        error: "Dev log viewer is disabled outside local development.",
      },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const limit = parseBoundedPositiveInteger(searchParams.get("limit"), {
    fallback: 200,
    max: 500,
  });

  const entries = readDevLogEntries({
    slug,
    limit,
  });
  const slugs = readAvailableDevLogSlugs();

  return NextResponse.json({
    success: true,
    enabled: true,
    slug: slug || null,
    latestSlug: slugs[0] ?? null,
    slugs,
    entryCount: entries.length,
    entries,
  });
}

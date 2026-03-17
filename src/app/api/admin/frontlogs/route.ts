import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import {
  readAvailableDevLogSlugs,
  readDevLogEntries,
} from "@/lib/logging/dev-log-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 300)
      : 120;

    const entries = readDevLogEntries({ slug, limit });
    const slugs = readAvailableDevLogSlugs();
    const available = entries.length > 0 || slugs.length > 0;

    return NextResponse.json({
      success: true,
      available,
      slug: slug || null,
      latestSlug: slugs[0] ?? null,
      slugs,
      entryCount: entries.length,
      entries,
      note: available
        ? null
        : process.env.NODE_ENV === "production"
          ? "Inga frontloggar hittades. Dev-loggning skrivs normalt inte i produktion."
          : "Inga frontloggar hittades ännu i den lokala loggfilen.",
    });
  } catch (error) {
    console.error("[API/admin/frontlogs] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch front logs" },
      { status: 500 },
    );
  }
}

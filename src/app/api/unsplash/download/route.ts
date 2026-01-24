import { FEATURES } from "@/lib/config";
import { NextRequest, NextResponse } from "next/server";

/**
 * Unsplash Download Tracking Endpoint
 *
 * REQUIRED BY UNSPLASH API GUIDELINES!
 * https://unsplash.com/documentation#track-a-photo-download
 *
 * When a user in your application uses a photo (downloads, inserts, etc.),
 * you MUST trigger this endpoint to track the download.
 *
 * This is critical for:
 * 1. Photographers get credit and stats for their photos
 * 2. Your app to qualify for production rate limits (5,000 req/hr)
 *
 * Usage:
 * POST /api/unsplash/download
 * Body: { downloadLocation: "https://api.unsplash.com/photos/:id/download?..." }
 *
 * Or with photo ID:
 * POST /api/unsplash/download
 * Body: { photoId: "abc123" }
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { downloadLocation, photoId } = body;

    if (!FEATURES.useUnsplash) {
      console.log("[API/unsplash/download] Unsplash not configured, skipping");
      return NextResponse.json({ success: true, tracked: false });
    }

    // Use downloadLocation if provided, otherwise construct from photoId
    let trackUrl = downloadLocation;

    if (!trackUrl && photoId) {
      trackUrl = `https://api.unsplash.com/photos/${photoId}/download`;
    }

    if (!trackUrl) {
      return NextResponse.json(
        { success: false, error: "Missing downloadLocation or photoId" },
        { status: 400 },
      );
    }

    // Track the download by calling Unsplash's download endpoint
    // Per Unsplash guidelines: call download_location as-is (it already carries auth/params)
    const response = await fetch(trackUrl);

    if (!response.ok) {
      console.error(
        `[API/unsplash/download] Failed to track download:`,
        response.status,
        await response.text(),
      );
      // Don't fail the request - tracking is best-effort
      return NextResponse.json({ success: true, tracked: false });
    }

    const data = await response.json();
    console.log(`[API/unsplash/download] ✅ Download tracked for photo`);

    return NextResponse.json({
      success: true,
      tracked: true,
      url: data.url, // The actual download URL (for reference)
    });
  } catch (error) {
    console.error("[API/unsplash/download] Error:", error);
    // Don't fail the request - tracking is best-effort
    return NextResponse.json({ success: true, tracked: false });
  }
}

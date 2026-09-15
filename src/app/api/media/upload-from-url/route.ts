import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { withRateLimit } from "@/lib/rate-limit";
import {
  describeRemoteImageUrl,
  rehostRemoteImage,
} from "@/lib/media/rehost-remote-image";

/**
 * Media Upload from URL API
 * =========================
 *
 * Downloads an image from a URL and uploads it to Vercel Blob storage.
 * This is used for stock photos (Unsplash/Pexels) to ensure we have
 * PUBLIC URLs that work in live preview.
 *
 * POST /api/media/upload-from-url
 * Body: { url: string, filename?: string, source?: string, photographer?: string }
 */

export async function POST(request: NextRequest) {
  return withRateLimit(request, "media:upload-url", async () => {
    try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { url, filename, source, photographer } = body;

    if (!url) {
      return NextResponse.json({ success: false, error: "URL krävs" }, { status: 400 });
    }

    try {
      const parsedUrl = new URL(url);
      console.info(`[Media/UploadFromUrl] Downloading image from: ${describeRemoteImageUrl(parsedUrl)}`);
    } catch {
      return NextResponse.json({ success: false, error: "Ogiltig URL" }, { status: 400 });
    }

    const result = await rehostRemoteImage({
      url,
      userId: user.id,
      filename: typeof filename === "string" ? filename : undefined,
      source: typeof source === "string" ? source : undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.failure.error },
        { status: result.failure.status },
      );
    }

    console.info(`[Media/UploadFromUrl] ✅ Saved to Blob: ${result.media.url}`);

    return NextResponse.json({
      success: true,
      media: {
        url: result.media.url,
        filename: result.media.filename,
        contentType: result.media.contentType,
        size: result.media.size,
        source: source || "external",
        photographer: photographer || "Unknown",
        storageType: result.media.storageType,
      },
    });
    } catch (error) {
      console.error("[Media/UploadFromUrl] Error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Okänt fel",
        },
        { status: 500 },
      );
    }
  });
}

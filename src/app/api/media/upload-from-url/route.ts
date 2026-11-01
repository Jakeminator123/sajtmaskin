import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";
import { withRateLimit } from "@/lib/rate-limit";
import { describeRemoteImageUrl, rehostRemoteImage } from "@/lib/media/rehost-remote-image";

const MAX_REMOTE_URL_CHARS = 4_096;
const MAX_FILENAME_CHARS = 255;
const MAX_SOURCE_CHARS = 100;
const MAX_PHOTOGRAPHER_CHARS = 200;
const MAX_UPLOAD_FROM_URL_BODY_BYTES = 16_384;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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

      const bodyResult = await readRequestJsonWithLimit<unknown>(
        request,
        MAX_UPLOAD_FROM_URL_BODY_BYTES,
      );
      if (!bodyResult.ok && bodyResult.reason === "too_large") {
        return NextResponse.json({ success: false, error: "Förfrågan är för stor" }, { status: 413 });
      }
      const body = bodyResult.ok ? asRecord(bodyResult.value) : null;
      if (!body) {
        return NextResponse.json({ success: false, error: "Ogiltig förfrågan" }, { status: 400 });
      }
      const { url, filename, source, photographer } = body;

      if (typeof url !== "string" || !url.trim() || url.length > MAX_REMOTE_URL_CHARS) {
        return NextResponse.json({ success: false, error: "URL krävs" }, { status: 400 });
      }
      if (
        (filename !== undefined && filename !== null && typeof filename !== "string") ||
        (source !== undefined && source !== null && typeof source !== "string") ||
        (photographer !== undefined && photographer !== null && typeof photographer !== "string")
      ) {
        return NextResponse.json(
          { success: false, error: "Ogiltig bildmetadata" },
          { status: 400 },
        );
      }
      if (
        (typeof filename === "string" && filename.length > MAX_FILENAME_CHARS) ||
        (typeof source === "string" && source.length > MAX_SOURCE_CHARS) ||
        (typeof photographer === "string" && photographer.length > MAX_PHOTOGRAPHER_CHARS)
      ) {
        return NextResponse.json(
          { success: false, error: "Bildmetadata är för lång" },
          { status: 400 },
        );
      }
      const normalizedUrl = url.trim();
      const normalizedFilename =
        typeof filename === "string" ? filename.trim() || undefined : undefined;
      const normalizedSource = typeof source === "string" ? source.trim() || undefined : undefined;
      const normalizedPhotographer =
        typeof photographer === "string" ? photographer.trim() || undefined : undefined;

      try {
        const parsedUrl = new URL(normalizedUrl);
        console.info(
          `[Media/UploadFromUrl] Downloading image from: ${describeRemoteImageUrl(parsedUrl)}`,
        );
      } catch {
        return NextResponse.json({ success: false, error: "Ogiltig URL" }, { status: 400 });
      }

      const result = await rehostRemoteImage({
        url: normalizedUrl,
        userId: user.id,
        filename: normalizedFilename,
        source: normalizedSource,
      });

      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.failure.error },
          { status: result.failure.status },
        );
      }

      console.info(`[Media/UploadFromUrl] Saved (${result.media.storageType})`);

      return NextResponse.json({
        success: true,
        media: {
          url: result.media.url,
          filename: result.media.filename,
          contentType: result.media.contentType,
          size: result.media.size,
          source: normalizedSource || "external",
          photographer: normalizedPhotographer || "Unknown",
          storageType: result.media.storageType,
        },
      });
    } catch (error) {
      console.error("[Media/UploadFromUrl] Error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Kunde inte spara bilden",
        },
        { status: 500 },
      );
    }
  });
}

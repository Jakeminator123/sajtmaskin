import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { canUserUploadFile, saveMediaLibraryItem } from "@/lib/db/services/media";
import { MediaUploadPolicyError } from "@/lib/media/upload-policy-error";
import { PROJECT_MEDIA_LIBRARY_CATEGORY } from "@/lib/media/project-media-library";
import { deleteBlob } from "@/lib/vercel/blob-service";
import { resolveMediaUploadProject } from "@/lib/media/resolve-upload-project";
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
      const { url, filename, source, photographer, chatId, sourcePageUrl, projectId: rawProjectId } = body;

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

      if (rawProjectId !== undefined && (typeof rawProjectId !== "string" || !rawProjectId.trim() || rawProjectId.length > 200)) {
        return NextResponse.json({ success: false, error: "Ogiltig sajt" }, { status: 400 });
      }
      let projectId = typeof rawProjectId === "string" ? rawProjectId.trim() : undefined;
      let originPage: string | undefined;
      if (chatId !== undefined || sourcePageUrl !== undefined || normalizedSource === "sajtagent-source") {
        const page = typeof sourcePageUrl === "string" && sourcePageUrl.length <= MAX_REMOTE_URL_CHARS
          ? URL.parse(sourcePageUrl) : null;
        if ((chatId !== undefined && (typeof chatId !== "string" || !chatId.trim() || chatId.length > 200)) ||
            !page || !["http:", "https:"].includes(page.protocol) || page.username || page.password) {
          return NextResponse.json({ success: false, error: "Ogiltig projektkälla" }, { status: 400 });
        }
        projectId = await resolveMediaUploadProject(request, user.id, projectId, typeof chatId === "string" ? chatId : undefined);
        originPage = page.href;
      }

      const quota = await canUserUploadFile(user.id, "image/png", projectId);
      if (!quota.allowed) {
        return NextResponse.json({ success: false, error: quota.reason }, { status: 400 });
      }

      const result = await rehostRemoteImage({
        url: normalizedUrl,
        userId: user.id,
        filename: normalizedFilename,
        source: normalizedSource,
        ...(projectId ? { projectId } : {}),
        ...(projectId && body.mediaScope === PROJECT_MEDIA_LIBRARY_CATEGORY ? { category: PROJECT_MEDIA_LIBRARY_CATEGORY } : {}),
      });

      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.failure.error },
          { status: result.failure.status },
        );
      }

      let item: Awaited<ReturnType<typeof saveMediaLibraryItem>>;
      try {
        item = await saveMediaLibraryItem(
          user.id,
          result.media.filename,
          normalizedFilename || result.media.filename,
          result.media.path,
          result.media.contentType,
          result.media.size,
          result.media.url,
          projectId,
          originPage,
        );
      } catch (error) {
        if (error instanceof MediaUploadPolicyError) {
          await deleteBlob(result.media.storageType === "blob" ? result.media.url : result.media.path);
        }
        throw error;
      }
      console.info(`[Media/UploadFromUrl] Saved (${result.media.storageType})`);

      return NextResponse.json({
        success: true,
        media: {
          id: item.id,
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
      if (error instanceof MediaUploadPolicyError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status });
      }
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

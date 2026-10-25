import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  canUserUploadFile,
  getMediaLibraryByUser,
  getMediaLibraryCounts,
  saveMediaLibraryItem,
} from "@/lib/db/services/media";
import { uploadBlob, generateUniqueFilename } from "@/lib/vercel/blob-service";
import { withRateLimit } from "@/lib/rate-limit";
import { errorLog, warnLog } from "@/lib/utils/debug";
import { readRequestFormDataWithLimit } from "@/lib/api/read-limited-body";

/**
 * Media Library Upload API
 * ========================
 *
 * Handles uploading media files to a user's persistent media library.
 *
 * SUPPORTED FILE TYPES:
 * - Images (jpg, png, gif, webp) - max 10 total
 * - Videos (mp4, webm, mov) - max 3 total
 * - PDFs - no limit
 * - Text files (txt, md, json, css) - no limit
 *
 * SECURITY:
 * - All files are scoped to the authenticated user
 * - Server-side limit enforcement (can't bypass by modifying client)
 * - Files stored with user-isolated paths via blob-service
 *
 * STORAGE (in priority order):
 * 1. Vercel Blob (if BLOB_READ_WRITE_TOKEN is set) - gives public URLs
 * 2. Local storage (fallback) - in /data/uploads/{userId}/media/
 *
 * POST /api/media/upload
 * GET /api/media/upload - List user's media library
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_IMAGES = 10; // Includes logos
const MAX_VIDEOS = 3;
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB (Blob-safe for preview reliability)
const MAX_UPLOAD_BODY_BYTES = 5 * 1024 * 1024;
const MAX_PROJECT_ID_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5_000;
const MAX_TAG_LENGTH = 100;
const MEDIA_FILE_TYPES = ["image", "video", "pdf", "text", "logo", "other"] as const;
type MediaFileType = (typeof MEDIA_FILE_TYPES)[number];

function isMediaFileType(value: string): value is MediaFileType {
  return MEDIA_FILE_TYPES.some((fileType) => fileType === value);
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.size === "number" &&
    typeof value.arrayBuffer === "function"
  );
}

const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  // Videos
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  // Documents
  "application/pdf",
  // Text
  "text/plain",
  "text/markdown",
  "application/json",
  "text/css",
];

// ============================================================================
// POST - Upload a file
// ============================================================================

export async function POST(request: NextRequest) {
  return withRateLimit(request, "media:upload", async () => {
    try {
    // Require authentication
    const user = await getCurrentUser(request);
    if (!user) {
      warnLog("Media", "Upload blocked: unauthenticated");
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att ladda upp filer",
        },
        { status: 401 },
      );
    }

    const body = await readRequestFormDataWithLimit(request, MAX_UPLOAD_BODY_BYTES);
    if (!body.ok) {
      return NextResponse.json(
        { success: false, error: "Uppladdningen är för stor" },
        { status: 413 },
      );
    }

    const { formData } = body;
    const file = formData.get("file");
    const projectId = formData.get("projectId");
    const description = formData.get("description");
    const tagsStr = formData.get("tags");

    if (!isUploadedFile(file)) {
      return NextResponse.json({ success: false, error: "Ingen fil bifogad" }, { status: 400 });
    }
    if (
      (projectId !== null &&
        (typeof projectId !== "string" || projectId.length > MAX_PROJECT_ID_LENGTH)) ||
      (description !== null &&
        (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH)) ||
      (tagsStr !== null && typeof tagsStr !== "string")
    ) {
      return NextResponse.json({ success: false, error: "Ogiltig metadata" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      warnLog("Media", "Upload blocked: unsupported file type", { type: file.type });
      return NextResponse.json(
        {
          success: false,
          error: `Filtypen ${file.type} är inte tillåten. Tillåtna: bilder, videos, PDF, textfiler.`,
        },
        { status: 400 },
      );
    }

    // Validate file size (Blob-safe for preview reliability)
    if (file.size > MAX_FILE_SIZE) {
      warnLog("Media", "Upload blocked: file too large", { size: file.size });
      return NextResponse.json(
        {
          success: false,
          error: `Filen är för stor (${(file.size / 1024 / 1024).toFixed(
            2,
          )}MB). Max storlek: 4MB (krävs för stabil Blob-preview).`,
        },
        { status: 400 },
      );
    }

    // SERVER-SIDE LIMIT CHECK - Can't be bypassed by client
    const limitCheck = await canUserUploadFile(user.id, file.type, MAX_IMAGES, MAX_VIDEOS);
    if (!limitCheck.allowed) {
      return NextResponse.json({ success: false, error: limitCheck.reason }, { status: 400 });
    }

    // Parse tags if provided
    let tags: string[] | undefined;
    if (tagsStr) {
      try {
        const parsed = JSON.parse(tagsStr);
        if (Array.isArray(parsed)) {
          tags = parsed
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0 && tag.length <= MAX_TAG_LENGTH)
            .slice(0, 20);
        }
      } catch {
        // Ignore invalid JSON
      }
    }

    // Generate unique filename using blob-service
    const filename = generateUniqueFilename(file.name);

    // Read file bytes
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload via centralized blob-service (handles Blob + local fallback)
    // Files are now isolated under userId: {userId}/media/{filename}
    const uploadResult = await uploadBlob({
      userId: user.id,
      filename,
      buffer,
      contentType: file.type,
      projectId: projectId || undefined,
      category: "media",
    });

    if (!uploadResult) {
      errorLog("Media", "Upload failed: no blob result");
      return NextResponse.json(
        { success: false, error: "Kunde inte spara filen" },
        { status: 500 },
      );
    }

    console.info(`[Media/Upload] Saved (${uploadResult.storageType})`);

    // Save metadata to database
    let mediaItem: Awaited<ReturnType<typeof saveMediaLibraryItem>>;
    try {
      mediaItem = await saveMediaLibraryItem(
        user.id,
        filename,
        file.name,
        uploadResult.path,
        file.type,
        file.size,
        uploadResult.url,
        projectId || undefined,
        description || undefined,
        tags,
      );
    } catch (persistError) {
      errorLog("Media", "Metadata persistence failed after upload", persistError);
      // The insert may have committed before the connection failed. Preserve
      // the blob until persistence can be reconciled, rather than lose user data.
      return NextResponse.json(
        { success: false, error: "Kunde inte spara filen" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      media: {
        id: mediaItem.id,
        url: uploadResult.url,
        filename: file.name,
        mimeType: file.type,
        fileType: mediaItem.file_type,
        size: file.size,
        storageType: uploadResult.storageType,
      },
      note:
        uploadResult.storageType === "local"
          ? "Filen är sparad lokalt. Fungerar i utveckling men preview kanske inte kan nå den."
          : undefined,
    });
    } catch (error: unknown) {
      errorLog("Media", "Upload error", error);
      return NextResponse.json(
        { success: false, error: "Kunde inte ladda upp filen" },
        { status: 500 },
      );
    }
  });
}

// ============================================================================
// GET - List user's media library
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const rawFileType = searchParams.get("fileType");
    let fileType: MediaFileType | undefined;
    if (rawFileType) {
      if (!isMediaFileType(rawFileType)) {
        return NextResponse.json(
          { success: false, error: "Ogiltig filtyp" },
          { status: 400 },
        );
      }
      fileType = rawFileType;
    }

    // SECURITY: Only return the current user's files
    // projectId filter removed - users should only see their own files
    const [items, counts] = await Promise.all([
      getMediaLibraryByUser(user.id, fileType),
      // Also return counts for limit display in UI.
      getMediaLibraryCounts(user.id),
    ]);

    return NextResponse.json({
      success: true,
      items: items.map((item) => ({
        id: item.id,
        url: item.blob_url || item.file_path,
        filename: item.original_name,
        mimeType: item.mime_type,
        fileType: item.file_type,
        size: item.size_bytes,
        description: item.description,
        tags: item.tags,
        createdAt: item.created_at,
      })),
      counts,
      limits: {
        maxImages: MAX_IMAGES,
        maxVideos: MAX_VIDEOS,
      },
    });
  } catch (error: unknown) {
    console.error("[API/Media/Upload] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta mediebiblioteket" },
      { status: 500 },
    );
  }
}

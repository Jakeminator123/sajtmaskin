import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  canUserUploadFile,
  getMediaLibraryByUser,
  getMediaLibraryCounts,
  requireMediaUploadProject,
  saveMediaLibraryItem,
} from "@/lib/db/services/media";
import { deleteBlob, uploadBlob, generateUniqueFilename } from "@/lib/vercel/blob-service";
import { withRateLimit } from "@/lib/rate-limit";
import { MAX_MEDIA_FILE_BYTES, MAX_MEDIA_IMAGES, MAX_MEDIA_VIDEOS } from "@/lib/media/upload-limits";
import { MediaUploadPolicyError } from "@/lib/media/upload-policy-error";
import { PROJECT_MEDIA_LIBRARY_CATEGORY } from "@/lib/media/project-media-library";
import { resolveMediaUploadProject } from "@/lib/media/resolve-upload-project";
import { errorLog, warnLog } from "@/lib/utils/debug";
import { readRequestFormDataWithLimit } from "@/lib/api/read-limited-body";

/**
 * Media Library Upload API
 * ========================
 *
 * Handles uploading media files to a user's persistent media library.
 *
 * SUPPORTED FILE TYPES:
 * - Images (jpg, png, gif, webp) - per-site or personal quota
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


const MAX_FILE_SIZE = MAX_MEDIA_FILE_BYTES;
const MAX_UPLOAD_BODY_BYTES = 5 * 1024 * 1024;
const MAX_SCOPE_ID_LENGTH = 200;
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
    const rawProjectId = formData.get("projectId");
    const rawChatId = formData.get("chatId");
    const description = formData.get("description");
    const tagsStr = formData.get("tags");

    if (!isUploadedFile(file)) {
      return NextResponse.json({ success: false, error: "Ingen fil bifogad" }, { status: 400 });
    }
    if (
      (rawProjectId !== null &&
        (typeof rawProjectId !== "string" || !rawProjectId.trim() || rawProjectId.length > MAX_SCOPE_ID_LENGTH)) ||
      (rawChatId !== null &&
        (typeof rawChatId !== "string" || !rawChatId.trim() || rawChatId.length > MAX_SCOPE_ID_LENGTH)) ||
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

    const projectId = await resolveMediaUploadProject(
      request,
      user.id,
      typeof rawProjectId === "string" ? rawProjectId.trim() : undefined,
      typeof rawChatId === "string" ? rawChatId.trim() : undefined,
    );
    const category = projectId && formData.get("mediaScope") === PROJECT_MEDIA_LIBRARY_CATEGORY
      ? PROJECT_MEDIA_LIBRARY_CATEGORY : "media";

    // SERVER-SIDE LIMIT CHECK - Can't be bypassed by client
    const limitCheck = await canUserUploadFile(user.id, file.type, projectId);
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
      category,
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
        projectId,
        description || undefined,
        tags,
      );
    } catch (persistError) {
      if (persistError instanceof MediaUploadPolicyError) {
        await deleteBlob(uploadResult.storageType === "blob" ? uploadResult.url : uploadResult.path);
        return NextResponse.json({ success: false, error: persistError.message }, { status: persistError.status });
      }
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
      if (error instanceof MediaUploadPolicyError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status });
      }
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
    const rawProjectId = searchParams.get("projectId");
    const rawChatId = searchParams.get("chatId");
    if (rawProjectId !== null && (!rawProjectId.trim() || rawProjectId.length > MAX_SCOPE_ID_LENGTH)) {
      return NextResponse.json({ success: false, error: "Ogiltig sajt" }, { status: 400 });
    }
    if (rawChatId !== null && (!rawChatId.trim() || rawChatId.length > MAX_SCOPE_ID_LENGTH)) {
      return NextResponse.json({ success: false, error: "Ogiltig chatt" }, { status: 400 });
    }
    const projectId = await resolveMediaUploadProject(request, user.id, rawProjectId?.trim(), rawChatId?.trim());
    await requireMediaUploadProject(user.id, projectId);
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

    // Listing stays account-wide so users can reuse their own media in another site.
    const [items, counts] = await Promise.all([
      getMediaLibraryByUser(user.id, fileType),
      // Also return counts for limit display in UI.
      getMediaLibraryCounts(user.id, projectId),
    ]);

    return NextResponse.json({
      success: true,
      projectId,
      items: items.map((item) => ({
        id: item.id,
        url: item.blob_url || item.file_path,
        filename: item.original_name,
        mimeType: item.mime_type,
        fileType: item.file_type,
        projectId: item.project_id,
        size: item.size_bytes,
        description: item.description,
        tags: item.tags,
        createdAt: item.created_at,
      })),
      counts,
      limits: {
        maxImages: MAX_MEDIA_IMAGES,
        maxVideos: MAX_MEDIA_VIDEOS,
      },
    });
  } catch (error: unknown) {
    if (error instanceof MediaUploadPolicyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("[API/Media/Upload] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta mediebiblioteket" },
      { status: 500 },
    );
  }
}

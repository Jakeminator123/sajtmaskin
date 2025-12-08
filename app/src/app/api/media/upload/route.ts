import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  saveMediaLibraryItem,
  canUserUploadFile,
  getMediaLibraryCounts,
  getMediaLibraryByUser,
} from "@/lib/database";
import { uploadBlob, generateUniqueFilename } from "@/lib/blob-service";

/**
 * Media Library Upload API
 * ========================
 *
 * Handles uploading media files to a user's persistent media library.
 *
 * SUPPORTED FILE TYPES:
 * - Images (jpg, png, gif, webp, svg) - max 10 total
 * - Videos (mp4, webm, mov) - max 3 total
 * - PDFs - no limit
 * - Text files (txt, md, json) - no limit
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
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
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
  "text/html",
  "text/css",
];

// ============================================================================
// POST - Upload a file
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att ladda upp filer",
        },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string | null;
    const description = formData.get("description") as string | null;
    const tagsStr = formData.get("tags") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Ingen fil bifogad" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Filtypen ${file.type} är inte tillåten. Tillåtna: bilder, videos, PDF, textfiler.`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Filen är för stor (${(file.size / 1024 / 1024).toFixed(
            2
          )}MB). Max storlek: 50MB.`,
        },
        { status: 400 }
      );
    }

    // SERVER-SIDE LIMIT CHECK - Can't be bypassed by client
    const limitCheck = canUserUploadFile(
      user.id,
      file.type,
      MAX_IMAGES,
      MAX_VIDEOS
    );
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { success: false, error: limitCheck.reason },
        { status: 400 }
      );
    }

    // Parse tags if provided
    let tags: string[] | undefined;
    if (tagsStr) {
      try {
        tags = JSON.parse(tagsStr);
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
      return NextResponse.json(
        { success: false, error: "Kunde inte spara filen" },
        { status: 500 }
      );
    }

    console.log(
      `[Media/Upload] ✅ Saved (${uploadResult.storageType}):`,
      uploadResult.url
    );

    // Save metadata to database
    const mediaItem = saveMediaLibraryItem(
      user.id,
      filename,
      file.name,
      uploadResult.path,
      file.type,
      file.size,
      uploadResult.url,
      projectId || undefined,
      description || undefined,
      tags
    );

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
          ? "Filen är sparad lokalt. Fungerar i utveckling men v0-preview kanske inte kan nå den."
          : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error("[API/Media/Upload] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
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
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fileType = searchParams.get("fileType") as
      | "image"
      | "video"
      | "pdf"
      | "text"
      | "logo"
      | "other"
      | null;

    // SECURITY: Only return the current user's files
    // projectId filter removed - users should only see their own files
    const items = getMediaLibraryByUser(user.id, fileType || undefined);

    // Also return counts for limit display in UI
    const counts = getMediaLibraryCounts(user.id);

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
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error("[API/Media/Upload] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

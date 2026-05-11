import { NextRequest, NextResponse } from "next/server";
import { getProjectByIdForOwner } from "@/lib/db/services/projects";
import { saveImage } from "@/lib/db/services/media";
import { getCurrentUser } from "@/lib/auth/auth";
import { uploadBlob, generateUniqueFilename } from "@/lib/vercel/blob-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Mirror media-upload limits so project image uploads can't bypass them
// by hitting the legacy project-scoped endpoint.
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB (matches Vercel Blob preview budget)
const ALLOWED_MIME_TYPES: ReadonlyArray<string> = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

// POST /api/projects/[id]/upload - Upload image
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Require authentication
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const project = await getProjectByIdForOwner(id, { userId: user.id });
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large (max ${Math.floor(MAX_FILE_SIZE / (1024 * 1024))} MB)`,
        },
        { status: 413 },
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${file.type || "unknown"}` },
        { status: 415 },
      );
    }

    // Generate unique filename
    const filename = generateUniqueFilename(file.name);

    // Read file bytes once
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload via centralized blob-service (handles isolation)
    // Files stored under: {userId}/projects/{projectId}/project-files/{filename}
    const uploadResult = await uploadBlob({
      userId: user.id,
      filename,
      buffer,
      contentType: file.type,
      projectId: id,
      category: "project-files",
    });

    if (!uploadResult) {
      return NextResponse.json({ success: false, error: "Failed to upload file" }, { status: 500 });
    }

    console.info(`[Upload] Image uploaded (${uploadResult.storageType}):`, uploadResult.url);

    // Save metadata to database
    const imageRecord = await saveImage(
      id,
      filename,
      uploadResult.path,
      file.name,
      file.type,
      file.size,
    );

    return NextResponse.json({
      success: true,
      image: {
        ...imageRecord,
        url: uploadResult.url,
        storageType: uploadResult.storageType,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Failed to upload image:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getProjectByIdForOwner, saveImage } from "@/lib/db/services";
import { getCurrentUser } from "@/lib/auth/auth";
import { uploadBlob, generateUniqueFilename } from "@/lib/vercel/blob-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

    console.log(`[Upload] Image uploaded (${uploadResult.storageType}):`, uploadResult.url);

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

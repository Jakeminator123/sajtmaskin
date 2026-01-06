import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveImage } from "@/lib/database";
import { uploadBlobFromBase64 } from "@/lib/blob-service";

/**
 * Save AI-generated images to storage
 *
 * Uses centralized blob-service for user-isolated storage:
 * - Files stored under: {userId}/ai-images/{filename}
 * - Or with project: {userId}/projects/{projectId}/ai-images/{filename}
 *
 * POST /api/images/save
 * {
 *   images: Array<{ base64: string; prompt: string }>
 *   projectId?: string
 * }
 *
 * Returns: Array<{ url: string; prompt: string; storageType: string }>
 */

interface SaveImageRequest {
  images: Array<{ base64: string; prompt: string }>;
  projectId?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check auth
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const body: SaveImageRequest = await request.json();
    const { images, projectId } = body;

    if (!images || images.length === 0) {
      return NextResponse.json(
        { success: false, error: "No images provided" },
        { status: 400 }
      );
    }

    const savedImages: Array<{
      url: string;
      prompt: string;
      storageType: string;
    }> = [];

    for (const img of images) {
      try {
        // Upload via centralized blob-service (handles isolation)
        // Files stored under: {userId}/ai-images/{filename}
        // Or with project: {userId}/projects/{projectId}/ai-images/{filename}
        const uploadResult = await uploadBlobFromBase64(user.id, img.base64, {
          projectId: projectId || undefined,
          filenamePrefix: "ai",
        });

        if (uploadResult) {
          console.log(
            `[Images/Save] ✅ Saved (${uploadResult.storageType}):`,
            uploadResult.url
          );

          savedImages.push({
            url: uploadResult.url,
            prompt: img.prompt,
            storageType: uploadResult.storageType,
          });

          // Save metadata to database
          if (projectId) {
            const filename =
              uploadResult.path.split("/").pop() || "unknown.png";
            const buffer = Buffer.from(img.base64, "base64");
            saveImage(
              projectId,
              filename,
              uploadResult.path,
              `AI Generated: ${img.prompt.substring(0, 50)}`,
              "image/png",
              buffer.length
            );
          }
          continue;
        }

        // Last resort - data URL (won't work in V0 preview)
        console.log("[Images/Save] ⚠️ Using data URL (V0 preview won't work)");
        savedImages.push({
          url: `data:image/png;base64,${img.base64}`,
          prompt: img.prompt,
          storageType: "dataurl",
        });
      } catch (error) {
        console.error("[Images/Save] Failed to save image:", error);
      }
    }

    return NextResponse.json({
      success: true,
      images: savedImages,
      note: savedImages.some((i) => i.storageType === "local")
        ? "Bilder sparade lokalt. Fungerar i utveckling men V0-preview kan inte nå dem."
        : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API/Images/Save] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { uploadBlob, generateUniqueFilename } from "@/lib/vercel/blob-service";

/**
 * Media Upload from URL API
 * =========================
 *
 * Downloads an image from a URL and uploads it to Vercel Blob storage.
 * This is used for stock photos (Unsplash/Pexels) to ensure we have
 * PUBLIC URLs that work in v0 preview.
 *
 * POST /api/media/upload-from-url
 * Body: { url: string, filename?: string, source?: string, photographer?: string }
 */

export async function POST(request: NextRequest) {
  try {
    // Require authentication
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

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ success: false, error: "Ogiltig URL" }, { status: 400 });
    }

    console.log(`[Media/UploadFromUrl] Downloading image from: ${url.substring(0, 100)}...`);

    // Download the image
    const response = await fetch(url, {
      headers: {
        // Some sites require a user agent
        "User-Agent": "Mozilla/5.0 (compatible; Sajtmaskin/1.0)",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Kunde inte ladda ner bilden: ${response.status}`,
        },
        { status: 400 },
      );
    }

    // Get content type from response
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Validate it's an image
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "URL:en pekar inte på en bild" },
        { status: 400 },
      );
    }

    // Get the image data
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check size (Blob-safe for preview reliability)
    const maxSize = 4 * 1024 * 1024;
    if (buffer.length > maxSize) {
      return NextResponse.json(
        { success: false, error: "Bilden är för stor (max 4MB för Blob-preview)" },
        { status: 400 },
      );
    }

    // Generate filename
    const extension = contentType.split("/")[1] || "jpg";
    const safeFilename = filename || `stock-${Date.now()}.${extension}`;
    const uniqueFilename = generateUniqueFilename(safeFilename, source || "stock");

    // Upload to Vercel Blob
    const uploadResult = await uploadBlob({
      userId: user.id,
      filename: uniqueFilename,
      buffer,
      contentType,
      category: "media",
    });

    if (!uploadResult) {
      return NextResponse.json(
        { success: false, error: "Kunde inte spara bilden till Blob storage" },
        { status: 500 },
      );
    }

    console.log(`[Media/UploadFromUrl] ✅ Saved to Blob: ${uploadResult.url}`);

    return NextResponse.json({
      success: true,
      media: {
        url: uploadResult.url,
        filename: uniqueFilename,
        contentType,
        size: buffer.length,
        source: source || "external",
        photographer: photographer || "Unknown",
        storageType: uploadResult.storageType,
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
}

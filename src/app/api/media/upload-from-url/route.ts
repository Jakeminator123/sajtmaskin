import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { uploadBlob, generateUniqueFilename } from "@/lib/vercel/blob-service";
import { validateSsrfTarget, safeFetch } from "@/lib/ssrf-guard";
import { withRateLimit } from "@/lib/rateLimit";

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

const MAX_REMOTE_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_REMOTE_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

function normalizeContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() || "";
}

function getContentLengthBytes(response: Response): number | null {
  const value = response.headers.get("content-length");
  if (!value) return null;
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) return null;
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, received);
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, "media:upload-url", async () => {
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

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ success: false, error: "Ogiltig URL" }, { status: 400 });
    }

    const ssrfCheck = validateSsrfTarget(parsedUrl);
    if (!ssrfCheck.ok) {
      return NextResponse.json(
        { success: false, error: `Otillåten URL: ${ssrfCheck.reason}` },
        { status: 400 },
      );
    }

    console.info(`[Media/UploadFromUrl] Downloading image from: ${url.substring(0, 100)}...`);

    const response = await safeFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Sajtmaskin/1.0)",
      },
      timeoutMs: 15_000,
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
    const contentType = normalizeContentType(response.headers.get("content-type") || "image/jpeg");

    // Validate it's an image type safe to serve back from public Blob storage.
    const extension = ALLOWED_REMOTE_IMAGE_TYPES.get(contentType);
    if (!extension) {
      return NextResponse.json(
        { success: false, error: "URL:en pekar inte på en tillåten bildtyp" },
        { status: 400 },
      );
    }

    // Check size (Blob-safe for preview reliability)
    const contentLength = getContentLengthBytes(response);
    if (contentLength !== null && contentLength > MAX_REMOTE_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Bilden är för stor (max 4MB för Blob-preview)" },
        { status: 400 },
      );
    }

    // Get the image data, but stop reading once the Blob-safe limit is exceeded.
    const buffer = await readBodyWithLimit(response, MAX_REMOTE_IMAGE_BYTES);
    if (!buffer) {
      return NextResponse.json(
        { success: false, error: "Bilden är för stor (max 4MB för Blob-preview)" },
        { status: 400 },
      );
    }

    // Generate filename
    const requestedName = typeof filename === "string" && filename.trim() ? filename : "stock";
    const safeFilename = `${requestedName.replace(/\.[^.]*$/, "")}.${extension}`;
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

    console.info(`[Media/UploadFromUrl] ✅ Saved to Blob: ${uploadResult.url}`);

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
  });
}

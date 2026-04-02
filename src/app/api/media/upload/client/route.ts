import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { warnLog } from "@/lib/utils/debug";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
];

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  const sessionId = getSessionIdFromRequest(request);

  if (!user && !sessionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerId = user?.id ?? sessionId!;
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          tokenPayload: JSON.stringify({
            userId: ownerId,
            clientPayload,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const payload = tokenPayload ? JSON.parse(tokenPayload) : {};
          console.info(
            `[BlobClient] Upload completed for ${payload.userId}:`,
            blob.pathname,
          );
        } catch (err) {
          warnLog("BlobClient", "onUploadCompleted error", err);
        }
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

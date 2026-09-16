/**
 * Shared remote-image rehost used by POST /api/media/upload-from-url and the
 * audit→builder handoff. Downloads a public image (SSRF-guarded, 4 MB, jpeg/
 * png/gif/webp) and stores it on the blob host already allowlisted for
 * generated sites.
 */
import { uploadBlob, generateUniqueFilename } from "@/lib/vercel/blob-service";
import { validateSsrfTarget, safeFetch } from "@/lib/ssrf-guard";
import type { RequestAttachment } from "@/lib/gen/request-metadata";
import type { AuditSourceImage } from "@/lib/builder/audit-handoff";

export const MAX_REMOTE_IMAGE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_REMOTE_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

const MAX_AUDIT_REHOSTS = 3;

export function normalizeRemoteImageContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() || "";
}

export function getRemoteImageContentLengthBytes(response: Response): number | null {
  const value = response.headers.get("content-length");
  if (!value) return null;
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}

export function describeRemoteImageUrl(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 160);
}

export async function readRemoteImageBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer | null> {
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

export type RehostRemoteImageSuccess = {
  url: string;
  filename: string;
  contentType: string;
  size: number;
  storageType: string;
};

export type RehostRemoteImageFailure = {
  error: string;
  status: number;
};

export async function rehostRemoteImage(params: {
  url: string;
  userId: string;
  filename?: string;
  source?: string;
}): Promise<
  | { ok: true; media: RehostRemoteImageSuccess }
  | { ok: false; failure: RehostRemoteImageFailure }
> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(params.url);
  } catch {
    return { ok: false, failure: { error: "Ogiltig URL", status: 400 } };
  }

  const ssrfCheck = validateSsrfTarget(parsedUrl);
  if (!ssrfCheck.ok) {
    return { ok: false, failure: { error: `Otillåten URL: ${ssrfCheck.reason}`, status: 400 } };
  }

  const response = await safeFetch(params.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Sajtmaskin/1.0)",
    },
    timeoutMs: 15_000,
    maxBodyBytes: MAX_REMOTE_IMAGE_BYTES,
  });

  if (response.status === 413) {
    return {
      ok: false,
      failure: { error: "Bilden är för stor (max 4MB för Blob-preview)", status: 400 },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      failure: { error: `Kunde inte ladda ner bilden: ${response.status}`, status: 400 },
    };
  }

  const contentType = normalizeRemoteImageContentType(
    response.headers.get("content-type") || "image/jpeg",
  );
  const extension = ALLOWED_REMOTE_IMAGE_TYPES.get(contentType);
  if (!extension) {
    return { ok: false, failure: { error: "URL:en pekar inte på en tillåten bildtyp", status: 400 } };
  }

  const contentLength = getRemoteImageContentLengthBytes(response);
  if (contentLength !== null && contentLength > MAX_REMOTE_IMAGE_BYTES) {
    return {
      ok: false,
      failure: { error: "Bilden är för stor (max 4MB för Blob-preview)", status: 400 },
    };
  }

  const buffer = await readRemoteImageBodyWithLimit(response, MAX_REMOTE_IMAGE_BYTES);
  if (!buffer) {
    return {
      ok: false,
      failure: { error: "Bilden är för stor (max 4MB för Blob-preview)", status: 400 },
    };
  }

  const requestedName =
    typeof params.filename === "string" && params.filename.trim() ? params.filename : "stock";
  const safeFilename = `${requestedName.replace(/\.[^.]*$/, "")}.${extension}`;
  const uniqueFilename = generateUniqueFilename(safeFilename, params.source || "stock");

  const uploadResult = await uploadBlob({
    userId: params.userId,
    filename: uniqueFilename,
    buffer,
    contentType,
    category: "media",
  });

  if (!uploadResult) {
    return {
      ok: false,
      failure: { error: "Kunde inte spara bilden till Blob storage", status: 500 },
    };
  }

  return {
    ok: true,
    media: {
      url: uploadResult.url,
      filename: uniqueFilename,
      contentType,
      size: buffer.length,
      storageType: uploadResult.storageType,
    },
  };
}

export async function rehostAuditSourceImages(params: {
  images: AuditSourceImage[];
  userId: string | null;
}): Promise<RequestAttachment[]> {
  const attachments: RequestAttachment[] = [];
  const seen = new Set<string>();
  const userId = params.userId?.trim() || "anonymous";

  for (const image of params.images) {
    if (attachments.length >= MAX_AUDIT_REHOSTS) break;
    const url = image.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const result = await rehostRemoteImage({
        url,
        userId,
        filename: image.kind === "logo" ? "audit-logo" : "audit-image",
        source: "audit",
      });
      if (!result.ok) continue;
      attachments.push({
        type: "user_file",
        url: result.media.url,
        filename: result.media.filename,
        mimeType: result.media.contentType,
        size: result.media.size,
        purpose: image.alt?.trim() || `audit ${image.kind ?? "content"} image`,
      });
    } catch {
      // Silent: JS-rendered sites or failed rehosts fall back to current behavior.
    }
  }

  return attachments;
}

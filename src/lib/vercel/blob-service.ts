import path from "path";
import { randomUUID } from "crypto";
import { PATHS } from "@/lib/config";
import { LocalFsProvider } from "@/lib/storage/local-fs-provider";
import type { StorageProvider } from "@/lib/storage/types";
import { VercelBlobProvider } from "@/lib/storage/vercel-blob-provider";

export interface BlobUploadResult {
  url: string;
  path: string;
  storageType: "blob" | "local" | "dataurl";
}

export interface BlobUploadOptions {
  userId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
  projectId?: string;
  category?: "media" | "ai-images" | "project-files";
}

const MAX_SERVER_UPLOAD_BYTES = 4.5 * 1024 * 1024;

function getExtension(filename: string): string {
  const basename = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const lastDot = basename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === basename.length - 1) return ".bin";
  const ext = basename.slice(lastDot).toLowerCase().replace(/[^.a-z0-9]/g, "");
  return ext && ext !== "." ? ext : ".bin";
}

function sanitizeBlobPathSegment(value: string | undefined, fallback: string): string {
  const sanitized = (value ?? "")
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  if (!sanitized || sanitized === "." || sanitized === "..") return fallback;
  return sanitized;
}

/** @internal exported for path-contract regression tests. */
export function buildBlobPath(
  userId: string,
  filename: string,
  options?: {
    projectId?: string;
    category?: "media" | "ai-images" | "project-files";
  },
): string {
  const safeUserId = sanitizeBlobPathSegment(userId, "anonymous");
  const safeFilename = sanitizeBlobPathSegment(filename, "file.bin");
  const category = options?.category || "media";
  if (options?.projectId) {
    const safeProjectId = sanitizeBlobPathSegment(options.projectId, "project");
    return `${safeUserId}/projects/${safeProjectId}/${category}/${safeFilename}`;
  }
  return `${safeUserId}/${category}/${safeFilename}`;
}

export function generateUniqueFilename(originalName: string, prefix?: string): string {
  const ext = getExtension(originalName);
  const timestamp = Date.now();
  const random = randomUUID().replace(/-/g, "").slice(0, 8);
  const safePrefix = prefix ? sanitizeBlobPathSegment(prefix, "file") : "";
  const prefixStr = safePrefix ? `${safePrefix}_` : "";
  return `${prefixStr}${timestamp}_${random}${ext}`;
}

export async function uploadBlob(options: BlobUploadOptions): Promise<BlobUploadResult | null> {
  const { userId, filename, buffer, contentType, projectId, category } = options;
  const storagePath = buildBlobPath(userId, filename, { projectId, category });
  const provider = getDefaultUploadProvider();

  if (provider.kind === "blob" && buffer.length > MAX_SERVER_UPLOAD_BYTES) {
    console.warn(
      `[BlobService] Upload too large for server route (${buffer.length} bytes). ` +
        "Use client uploads for files > 4.5MB.",
    );
    return null;
  }

  try {
    const stored = await provider.put(storagePath, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    const url = stored.url ?? stored.fsPath;

    if (!url) {
      console.error("[BlobService] Upload completed without a readable URL/path:", storagePath);
      return null;
    }

    console.info(
      `[BlobService] ✅ Uploaded via ${provider.kind === "blob" ? "Vercel Blob" : "LocalFs"}:`,
      storagePath,
    );

    return {
      url,
      path: storagePath,
      storageType: provider.kind === "blob" ? "blob" : "local",
    };
  } catch (error) {
    console.error("[BlobService] ❌ Upload failed:", error);
    return null;
  }
}

export async function deleteBlob(target: string): Promise<boolean> {
  const provider = getDeleteProvider(target);
  if (!provider) {
    console.info("[BlobService] ⚠️ Cannot delete - no matching storage provider configured");
    return false;
  }

  try {
    const deleted = await provider.delete(target);
    if (deleted) {
      console.info(
        `[BlobService] ✅ Deleted from ${provider.kind === "blob" ? "Vercel Blob" : "LocalFs"}:`,
        target,
      );
    }
    return deleted;
  } catch (error) {
    console.error("[BlobService] ❌ Delete failed:", error);
    return false;
  }
}

function isVercelBlobUrl(url: string): boolean {
  return url.includes(".blob.vercel-storage.com");
}

function getDefaultUploadProvider(): StorageProvider {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return new VercelBlobProvider({ token: process.env.BLOB_READ_WRITE_TOKEN });
  }
  return createLocalUploadProvider();
}

function getDeleteProvider(target: string): StorageProvider | null {
  if (isVercelBlobUrl(target)) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return null;
    }
    return new VercelBlobProvider({ token: process.env.BLOB_READ_WRITE_TOKEN });
  }
  return createLocalUploadProvider();
}

function createLocalUploadProvider(): StorageProvider {
  return new LocalFsProvider({
    rootDir: path.join(PATHS.uploads, "media"),
    publicUrlBase: "/api/uploads/media",
  });
}

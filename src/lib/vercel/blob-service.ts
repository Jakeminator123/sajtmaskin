import path from "path";
import { PATHS } from "@/lib/config";
import {
  LocalFsProvider,
  VercelBlobProvider,
  type StorageObjectInfo,
  type StorageProvider,
} from "@/lib/storage";

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

let _blobWarningLogged = false;
const MAX_SERVER_UPLOAD_BYTES = 4.5 * 1024 * 1024;

export function isBlobConfigured(): boolean {
  const configured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

  if (!configured && !_blobWarningLogged) {
    _blobWarningLogged = true;
    console.warn(
      "[BlobService] ⚠️ BLOB_READ_WRITE_TOKEN not configured.\n" +
        "  → Falling back to local filesystem storage for user uploads\n" +
        "  → Preview/share flows that need public blob URLs should still use Vercel Blob",
    );
  }

  return configured;
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return ".png";
  return filename.substring(lastDot);
}

export function buildBlobPath(
  userId: string,
  filename: string,
  options?: {
    projectId?: string;
    category?: "media" | "ai-images" | "project-files";
  },
): string {
  const category = options?.category || "media";
  if (options?.projectId) {
    return `${userId}/projects/${options.projectId}/${category}/${filename}`;
  }
  return `${userId}/${category}/${filename}`;
}

export function generateUniqueFilename(originalName: string, prefix?: string): string {
  const ext = getExtension(originalName);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const prefixStr = prefix ? `${prefix}_` : "";
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

export async function uploadBlobFromBase64(
  userId: string,
  base64: string,
  options?: {
    projectId?: string;
    filenamePrefix?: string;
    contentType?: string;
  },
): Promise<BlobUploadResult | null> {
  const buffer = Buffer.from(base64, "base64");
  const filename = generateUniqueFilename(".png", options?.filenamePrefix || "ai");

  return uploadBlob({
    userId,
    filename,
    buffer,
    contentType: options?.contentType || "image/png",
    projectId: options?.projectId,
    category: "ai-images",
  });
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

export async function listUserBlobs(
  userId: string,
  options?: { prefix?: string; limit?: number },
): Promise<string[]> {
  const provider = getDefaultUploadProvider();
  const prefix = options?.prefix ? `${userId}/${options.prefix}` : userId;

  try {
    const items = await provider.list({
      prefix,
      limit: options?.limit || 1000,
    });
    return items
      .filter((item) => matchesPathBoundary(item, prefix))
      .map((item) => item.url ?? item.fsPath ?? item.pathname);
  } catch (error) {
    console.error("[BlobService] ❌ List failed:", error);
    return [];
  }
}

export function isVercelBlobUrl(url: string): boolean {
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

function matchesPathBoundary(item: StorageObjectInfo, prefix: string): boolean {
  return item.pathname === prefix || item.pathname.startsWith(`${prefix}/`);
}

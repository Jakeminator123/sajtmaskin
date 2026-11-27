import path from "node:path";
import fs from "node:fs/promises";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deployments, images, mediaLibrary } from "@/lib/db/schema";
import { getUploadsDir } from "@/lib/db/services/shared";
import { isProjectMediaLibraryPath } from "@/lib/media/project-media-library";
import { MAX_MEDIA_VIDEOS } from "@/lib/media/upload-limits";
import { MAX_GENERATED_VIDEO_BYTES } from "@/lib/media/video-generation-contract";
import { resolveStorageAbsolutePath } from "@/lib/storage/shared";
import { VercelBlobProvider } from "@/lib/storage/vercel-blob-provider";
import { fetchWithPinnedDns } from "@/lib/capture/pinned-fetch";
import { resolveLegacyProviderUrl } from "@/app/api/v0/deployments/_route/legacy-provider-url";

export const PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES = 4.5 * 1024 * 1024;
export const PROJECT_EXPORT_MEDIA_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const PROJECT_EXPORT_MEDIA_TIMEOUT_MS = 10_000;
const PROJECT_EXPORT_MAX_VIDEO_BYTES = MAX_MEDIA_VIDEOS * MAX_GENERATED_VIDEO_BYTES;

export type ProjectExportMedia = {
  id: number | string;
  originalName: string;
  mimeType: string;
  body: Buffer;
  sourceUrls: string[];
};

function isOwnedVercelBlobUrl(rawUrl: string, storagePath: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (!url.hostname.endsWith(".blob.vercel-storage.com")) return false;
    const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return pathname === storagePath;
  } catch {
    return false;
  }
}

async function readMediaBody(
  row: { file_path: string; blob_url: string | null },
  maxBlobBytes = PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES,
): Promise<Buffer> {
  if (row.blob_url && isOwnedVercelBlobUrl(row.blob_url, row.file_path)) {
    const response = await fetchWithPinnedDns(row.blob_url, {
      timeoutMs: PROJECT_EXPORT_MEDIA_TIMEOUT_MS,
      maxBodyBytes: maxBlobBytes,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Mediafilen kunde inte hämtas (HTTP ${response.status})`);
    }
    return response.body;
  }

  const absolutePath = resolveStorageAbsolutePath(
    path.join(getUploadsDir(), "media"),
    row.file_path,
  );
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(absolutePath, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Mediafilen saknas i lagringen");
    }
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("Mediafilen saknas i lagringen");
    if (stat.size > PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES) {
      throw new Error("Mediafilen är för stor för export");
    }
    // Read through a fixed max+1 buffer so a file that grows after stat()
    // still cannot allocate or enter the export above the per-file cap.
    const bounded = Buffer.alloc(PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES + 1);
    let total = 0;
    while (total < bounded.byteLength) {
      const { bytesRead } = await handle.read(bounded, total, bounded.byteLength - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES) {
      throw new Error("Mediafilen är för stor för export");
    }
    return Buffer.from(bounded.subarray(0, total));
  } finally {
    await handle.close();
  }
}

function localMediaUrl(storagePath: string): string {
  return `/api/uploads/media/${storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

async function resolveLegacyBlobUrl(storagePath: string): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const provider = new VercelBlobProvider({ token });
  const blobs = await provider.list({ prefix: storagePath, limit: 2 });
  const exact = blobs.find((blob) => blob.pathname === storagePath);
  return exact?.url && isOwnedVercelBlobUrl(exact.url, storagePath) ? exact.url : null;
}

function normalizePersistedProviderOrigin(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const url = new URL(candidate);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Load only the provider origin persisted for this already-authorized version. */
export async function loadProjectProviderOrigin(params: {
  chatId: string;
  versionId: string;
}): Promise<string | null> {
  const [deployment] = await db
    .select({ providerUrl: deployments.providerUrl, legacyUrl: deployments.url })
    .from(deployments)
    .where(
      and(
        eq(deployments.chatId, params.chatId),
        eq(deployments.versionId, params.versionId),
        eq(deployments.status, "ready"),
      ),
    )
    .orderBy(desc(deployments.createdAt))
    .limit(1);
  if (!deployment) return null;
  return normalizePersistedProviderOrigin(
    deployment.providerUrl || resolveLegacyProviderUrl(deployment.legacyUrl),
  );
}

/**
 * Read actual bytes for media explicitly attached to one owned project.
 * The caller verifies project ownership first. The query repeats the user id
 * constraint so a bad project id can never cross tenant scope.
 */
export async function loadProjectExportMedia(params: {
  projectId: string;
  userId: string;
  referencedText: string;
}): Promise<ProjectExportMedia[]> {
  const libraryRows = await db
    .select()
    .from(mediaLibrary)
    .where(eq(mediaLibrary.user_id, params.userId));
  // Legacy /api/projects/[id]/upload rows have no user_id. The caller has
  // already authorized this exact project, so keep this query project-bound.
  const legacyRows = await db.select().from(images).where(eq(images.project_id, params.projectId));

  const output: ProjectExportMedia[] = [];
  let totalBytes = 0;
  let totalVideoBytes = 0;
  for (const row of libraryRows) {
    const sourceUrls = [row.blob_url, localMediaUrl(row.file_path)].filter(
      (value): value is string => Boolean(value),
    );
    const explicitlyExported = row.project_id === params.projectId && !isProjectMediaLibraryPath(row.file_path);
    const referenced = sourceUrls.some((sourceUrl) => params.referencedText.includes(sourceUrl));
    if (!explicitlyExported && !referenced) continue;

    // Generated MP4s bypass the upload route's 4 MiB limit. Keep the existing
    // export budget for other media and give owned Blob videos their own budget.
    const largeVideo = row.file_type === "video" &&
      row.mime_type === "video/mp4" &&
      isProjectMediaLibraryPath(row.file_path) &&
      Boolean(row.blob_url && isOwnedVercelBlobUrl(row.blob_url, row.file_path));
    const maxFileBytes = largeVideo ? MAX_GENERATED_VIDEO_BYTES : PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES;
    if (row.size_bytes > maxFileBytes) {
      throw new Error(`Mediafilen “${row.original_name}” är för stor för export`);
    }
    const body = await readMediaBody(row, maxFileBytes);
    if (largeVideo) totalVideoBytes += body.byteLength;
    else totalBytes += body.byteLength;
    if (totalBytes > PROJECT_EXPORT_MEDIA_MAX_TOTAL_BYTES || totalVideoBytes > PROJECT_EXPORT_MAX_VIDEO_BYTES) {
      throw new Error("Projektets media är för stora för en GitHub-export");
    }
    output.push({
      id: row.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      body,
      sourceUrls,
    });
  }

  for (const row of legacyRows) {
    if (
      typeof row.size_bytes === "number" &&
      row.size_bytes > PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES
    ) {
      throw new Error(`Mediafilen “${row.original_name || row.filename}” är för stor för export`);
    }
    const blobUrl = await resolveLegacyBlobUrl(row.file_path);
    const sourceUrls = [blobUrl, localMediaUrl(row.file_path)].filter((value): value is string =>
      Boolean(value),
    );
    const body = await readMediaBody({ file_path: row.file_path, blob_url: blobUrl });
    totalBytes += body.byteLength;
    if (totalBytes > PROJECT_EXPORT_MEDIA_MAX_TOTAL_BYTES) {
      throw new Error("Projektets media är för stora för en GitHub-export");
    }
    output.push({
      id: `image-${row.id}`,
      originalName: row.original_name || row.filename,
      mimeType: row.mime_type || "application/octet-stream",
      body,
      sourceUrls,
    });
  }
  return output;
}

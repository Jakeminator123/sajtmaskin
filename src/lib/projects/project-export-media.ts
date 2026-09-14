import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mediaLibrary } from "@/lib/db/schema";
import { getUploadsDir } from "@/lib/db/services/shared";
import { LocalFsProvider } from "@/lib/storage/local-fs-provider";
import { fetchWithPinnedDns } from "@/lib/capture/pinned-fetch";

export const PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES = 4.5 * 1024 * 1024;
export const PROJECT_EXPORT_MEDIA_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const PROJECT_EXPORT_MEDIA_TIMEOUT_MS = 10_000;

export type ProjectExportMedia = {
  id: number;
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

async function readMediaBody(row: { file_path: string; blob_url: string | null }): Promise<Buffer> {
  if (row.blob_url && isOwnedVercelBlobUrl(row.blob_url, row.file_path)) {
    const response = await fetchWithPinnedDns(row.blob_url, {
      timeoutMs: PROJECT_EXPORT_MEDIA_TIMEOUT_MS,
      maxBodyBytes: PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Mediafilen kunde inte hämtas (HTTP ${response.status})`);
    }
    return response.body;
  }

  const local = new LocalFsProvider({
    rootDir: path.join(getUploadsDir(), "media"),
    publicUrlBase: "/api/uploads/media",
  });
  const stored = await local.get(row.file_path);
  if (!stored) throw new Error("Mediafilen saknas i lagringen");
  if (stored.body.byteLength > PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES) {
    throw new Error("Mediafilen är för stor för export");
  }
  return stored.body;
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
  const rows = await db.select().from(mediaLibrary).where(eq(mediaLibrary.user_id, params.userId));

  const output: ProjectExportMedia[] = [];
  let totalBytes = 0;
  for (const row of rows) {
    const sourceUrls = [
      row.blob_url,
      `/api/uploads/media/${row.file_path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`,
    ].filter((value): value is string => Boolean(value));
    const belongsToProject = row.project_id === params.projectId;
    const isReferencedSharedMedia =
      row.project_id === null &&
      sourceUrls.some((sourceUrl) => params.referencedText.includes(sourceUrl));
    if (!belongsToProject && !isReferencedSharedMedia) continue;

    if (row.size_bytes > PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES) {
      throw new Error(`Mediafilen “${row.original_name}” är för stor för export`);
    }
    const body = await readMediaBody(row);
    totalBytes += body.byteLength;
    if (totalBytes > PROJECT_EXPORT_MEDIA_MAX_TOTAL_BYTES) {
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
  return output;
}

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { images, mediaLibrary } from "@/lib/db/schema";
import { deleteBlob, isVercelBlobUrl } from "@/lib/vercel/blob-service";
import { assertDbConfigured } from "./shared";
import type { MediaLibraryItem } from "./shared";

function resolveMediaFileType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/json") return "text";
  return "other";
}

export async function canUserUploadFile(
  userId: string,
  mimeType: string,
  maxImages: number,
  maxVideos: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const counts = await getMediaLibraryCounts(userId);

  if (mimeType.startsWith("image/")) {
    if (counts.images >= maxImages) {
      return {
        allowed: false,
        reason: `Max ${maxImages} bilder/logos. Ta bort någon först.`,
      };
    }
  }

  if (mimeType.startsWith("video/")) {
    if (counts.videos >= maxVideos) {
      return {
        allowed: false,
        reason: `Max ${maxVideos} videos. Ta bort någon först.`,
      };
    }
  }

  return { allowed: true };
}

export async function saveMediaLibraryItem(
  userId: string,
  filename: string,
  originalName: string,
  filePath: string,
  mimeType: string,
  sizeBytes: number,
  blobUrl: string,
  projectId?: string,
  description?: string,
  tags?: string[],
): Promise<MediaLibraryItem> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(mediaLibrary)
    .values({
      user_id: userId,
      filename,
      original_name: originalName,
      file_path: filePath,
      blob_url: blobUrl,
      mime_type: mimeType,
      file_type: resolveMediaFileType(mimeType),
      size_bytes: sizeBytes,
      description: description || null,
      tags: tags || null,
      project_id: projectId || null,
      created_at: now,
    })
    .returning();
  return rows[0];
}

export async function getMediaLibraryByUser(
  userId: string,
  fileType?: "image" | "video" | "pdf" | "text" | "logo" | "other",
): Promise<MediaLibraryItem[]> {
  assertDbConfigured();
  if (fileType) {
    return await db
      .select()
      .from(mediaLibrary)
      .where(and(eq(mediaLibrary.user_id, userId), eq(mediaLibrary.file_type, fileType)))
      .orderBy(desc(mediaLibrary.created_at));
  }
  return await db
    .select()
    .from(mediaLibrary)
    .where(eq(mediaLibrary.user_id, userId))
    .orderBy(desc(mediaLibrary.created_at));
}

export async function getMediaLibraryCounts(userId: string): Promise<{
  images: number;
  videos: number;
  other: number;
}> {
  assertDbConfigured();
  const rows = await db
    .select({
      file_type: mediaLibrary.file_type,
      count: sql<number>`count(*)`,
    })
    .from(mediaLibrary)
    .where(eq(mediaLibrary.user_id, userId))
    .groupBy(mediaLibrary.file_type);

  let imageCount = 0;
  let videos = 0;
  let other = 0;

  rows.forEach((row) => {
    if (row.file_type === "image" || row.file_type === "logo") imageCount += row.count;
    else if (row.file_type === "video") videos += row.count;
    else other += row.count;
  });

  return { images: imageCount, videos, other };
}

export async function getMediaLibraryItemById(id: number): Promise<MediaLibraryItem | null> {
  assertDbConfigured();
  const rows = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteMediaLibraryItem(id: number, userId: string): Promise<boolean> {
  assertDbConfigured();
  const item = await getMediaLibraryItemById(id);
  if (!item || item.user_id !== userId) return false;

  if (item.blob_url && isVercelBlobUrl(item.blob_url)) {
    await deleteBlob(item.blob_url);
  }

  await db
    .delete(mediaLibrary)
    .where(and(eq(mediaLibrary.id, id), eq(mediaLibrary.user_id, userId)));
  return true;
}

export async function saveImage(
  projectId: string,
  filename: string,
  filePath: string,
  originalName: string,
  mimeType: string,
  sizeBytes: number,
) {
  assertDbConfigured();
  const rows = await db
    .insert(images)
    .values({
      project_id: projectId,
      filename,
      file_path: filePath,
      original_name: originalName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_at: new Date(),
    })
    .returning();
  return rows[0];
}

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appProjects, images, mediaLibrary, videoGenerationJobs } from "@/lib/db/schema";
import { parseMediaLibraryId } from "@/lib/media/media-library-id";
import { MAX_MEDIA_IMAGES, MAX_MEDIA_VIDEOS } from "@/lib/media/upload-limits";
import { MediaUploadPolicyError } from "@/lib/media/upload-policy-error";
import { getVideoGenerationCredentials } from "@/lib/media/video-generation-config";
import { deleteBlob } from "@/lib/vercel/blob-service";
import { assertDbConfigured } from "./shared";
import type { MediaLibraryItem } from "./shared";

function resolveMediaFileType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/json") return "text";
  return "other";
}

type MediaExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type MediaCounts = { images: number; videos: number; other: number };

function mediaQuotaError(fileType: string, counts: MediaCounts, projectId?: string): string | null {
  if (fileType === "image" && counts.images >= MAX_MEDIA_IMAGES) {
    return projectId
      ? `Sajten har nått gränsen på ${MAX_MEDIA_IMAGES} bilder och logotyper.`
      : `Ditt personliga utrymme har nått gränsen på ${MAX_MEDIA_IMAGES} bilder och logotyper.`;
  }
  if (fileType === "video" && counts.videos >= MAX_MEDIA_VIDEOS) {
    return `Kontot har nått gränsen på ${MAX_MEDIA_VIDEOS} videor.`;
  }
  return null;
}

export async function requireMediaUploadProject(
  userId: string,
  projectId?: string,
  executor: MediaExecutor = db,
) {
  if (!projectId) return;
  assertDbConfigured();
  const query = executor.select({ id: appProjects.id }).from(appProjects)
    .where(and(eq(appProjects.id, projectId), eq(appProjects.user_id, userId)));
  // Inside the upload transaction, keep ownership stable until the row is saved.
  const [project] = executor === db ? await query : await query.for("share");
  if (!project) throw new MediaUploadPolicyError("Sajten hittades inte.", 404);
}

export async function canUserUploadFile(
  userId: string,
  mimeType: string,
  projectId?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  await requireMediaUploadProject(userId, projectId);
  const fileType = resolveMediaFileType(mimeType);
  if (fileType !== "image" && fileType !== "video") return { allowed: true };
  const reason = mediaQuotaError(fileType, await getMediaLibraryCounts(userId, projectId), projectId);
  return reason ? { allowed: false, reason } : { allowed: true };
}

type MediaTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockVideoMediaQuota(tx: MediaTransaction, userId: string): Promise<void> {
  const key = JSON.stringify(["media-videos", userId]);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

async function withMediaQuota<T>(
  userId: string,
  fileType: string,
  projectId: string | undefined,
  write: (tx: MediaTransaction) => Promise<T>,
): Promise<T> {
  assertDbConfigured();
  return db.transaction(async (tx) => {
    if (fileType === "video") {
      await lockVideoMediaQuota(tx, userId);
    } else if (fileType === "image") {
      const key = JSON.stringify(["media-images", userId, projectId ?? null]);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    }
    await requireMediaUploadProject(userId, projectId, tx);
    if (fileType === "image" || fileType === "video") {
      // A separate statement after the lock sees any row committed by its previous holder.
      const reason = mediaQuotaError(fileType, await getMediaLibraryCounts(userId, projectId, tx), projectId);
      if (reason) throw new MediaUploadPolicyError(reason, 400);
    }
    return write(tx);
  }, { isolationLevel: "read committed" });
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
  const fileType = resolveMediaFileType(mimeType);
  return withMediaQuota(userId, fileType, projectId, async (tx) => {
    const [item] = await tx.insert(mediaLibrary).values({
      user_id: userId,
      filename,
      original_name: originalName,
      file_path: filePath,
      blob_url: blobUrl,
      mime_type: mimeType,
      file_type: fileType,
      size_bytes: sizeBytes,
      description: description || null,
      tags: tags || null,
      project_id: projectId || null,
      created_at: new Date(),
    }).returning();
    return item;
  });
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

export async function hasVideoGenerationStorage(executor: MediaExecutor = db): Promise<boolean> {
  const result = await executor.execute<{ available: boolean }>(
    sql`select to_regclass('public.video_generation_jobs') is not null as available`,
  );
  return result.rows[0]?.available === true;
}

export async function getMediaLibraryCounts(userId: string, projectId?: string, executor: MediaExecutor = db): Promise<MediaCounts> {
  assertDbConfigured();
  const imageTypes = sql`${mediaLibrary.file_type} in ('image', 'logo')`;
  // Legacy exports keep their images rows. The canonical paths avoid double-counting a shared asset.
  const imageCount = projectId ? sql<string>`(
    select count(*) from (
      select ${mediaLibrary.file_path} from ${mediaLibrary}
      where ${eq(mediaLibrary.user_id, userId)} and ${eq(mediaLibrary.project_id, projectId)} and ${imageTypes}
      union
      select ${images.file_path} from ${images}
      join ${appProjects} on ${eq(images.project_id, appProjects.id)}
      where ${eq(images.project_id, projectId)} and ${eq(appProjects.user_id, userId)}
    ) as owned_image_paths
  )` : sql<string>`count(*) filter (where ${imageTypes} and ${isNull(mediaLibrary.project_id)})`;
  // When the optional provider is off, support installations without its
  // migration while still reserving slots for previously submitted jobs.
  const hasReservations = getVideoGenerationCredentials() || await hasVideoGenerationStorage(executor);
  const activeReservations = hasReservations ? sql`(
    select count(*) from ${videoGenerationJobs}
    where ${eq(videoGenerationJobs.user_id, userId)}
      and ${videoGenerationJobs.status} in ('pending', 'processing')
  )` : sql`0`;
  const [row] = await executor.select({
    images: imageCount,
    videos: sql<string>`count(*) filter (where ${mediaLibrary.file_type} = 'video') + ${activeReservations}`,
    other: sql<string>`count(*) filter (where ${mediaLibrary.file_type} not in ('image', 'logo', 'video'))`,
  }).from(mediaLibrary).where(eq(mediaLibrary.user_id, userId));
  // COUNT returns int8, which node-postgres decodes as a string.
  return { images: Number(row.images), videos: Number(row.videos), other: Number(row.other) };
}

export async function getMediaLibraryItemById(
  id: number | string,
  userId?: string,
): Promise<MediaLibraryItem | null> {
  assertDbConfigured();
  const mediaId = parseMediaLibraryId(id);
  if (mediaId === null) return null;
  const matchingId = eq(mediaLibrary.id, sql`${mediaId}::bigint`);
  const condition = userId ? and(matchingId, eq(mediaLibrary.user_id, userId)) : matchingId;
  const rows = await db.select().from(mediaLibrary).where(condition).limit(1);
  return rows[0] ?? null;
}

export async function deleteMediaLibraryItem(id: number | string, userId: string): Promise<boolean> {
  assertDbConfigured();
  const mediaId = parseMediaLibraryId(id);
  if (mediaId === null) return false;
  const item = await getMediaLibraryItemById(mediaId, userId);
  if (!item) return false;

  if (item.blob_url || item.file_path) {
    await deleteBlob(item.blob_url || item.file_path);
  }

  await db
    .delete(mediaLibrary)
    .where(and(eq(mediaLibrary.id, sql`${mediaId}::bigint`), eq(mediaLibrary.user_id, userId)));
  return true;
}

export async function saveImage(
  userId: string,
  projectId: string,
  filename: string,
  filePath: string,
  originalName: string,
  mimeType: string,
  sizeBytes: number,
) {
  return withMediaQuota(userId, "image", projectId, async (tx) => {
    const [image] = await tx.insert(images).values({
      project_id: projectId,
      filename,
      file_path: filePath,
      original_name: originalName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_at: new Date(),
    }).returning();
    return image;
  });
}

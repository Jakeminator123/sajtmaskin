import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mediaLibrary, videoGenerationJobs } from "@/lib/db/schema";
import {
  getMediaLibraryCounts,
  lockVideoMediaQuota,
  requireMediaUploadProject,
} from "@/lib/db/services/media";
import { createTransaction } from "@/lib/db/services/transactions";
import { MAX_MEDIA_VIDEOS } from "@/lib/media/upload-limits";
import {
  VIDEO_GENERATION_SOURCE_MIME_TYPES,
  type VideoGenerationJob,
  type VideoGenerationOrder,
} from "./video-generation-contract";
import type { getVideoGenerationPrice } from "./video-generation-cost";
import { VideoGenerationError } from "./video-generation-error";

const ACTIVE_STATUSES = ["pending", "processing"] as const;
const LEASE_MS = 90_000;
type JobRow = typeof videoGenerationJobs.$inferSelect;

export type VideoGenerationClaim = { job: JobRow; leaseId: string };
export type StoredVideo = { filename: string; url: string; path: string; size: number };

function validSourceUrl(value: string | null | undefined): string {
  const url = value ? URL.parse(value) : null;
  if (
    !url || url.protocol !== "https:" || url.username || url.password || url.port ||
    !url.hostname.endsWith(".public.blob.vercel-storage.com")
  ) {
    throw new VideoGenerationError("Välj en bild som finns i Sajtmaskins publika medielagring.", 400);
  }
  return url.href;
}

export async function orderVideoGeneration(
  userId: string,
  input: VideoGenerationOrder,
  price: Awaited<ReturnType<typeof getVideoGenerationPrice>>,
  enabled: boolean,
) {
  return db.transaction(async (tx) => {
    // Same account lock as an ordinary video upload. The reservation and debit
    // commit together, so neither can be left over after failed admission.
    await lockVideoMediaQuota(tx, userId);
    await requireMediaUploadProject(userId, input.projectId, tx);
    const [existing] = await tx.select().from(videoGenerationJobs).where(and(
      eq(videoGenerationJobs.user_id, userId),
      eq(videoGenerationJobs.request_id, input.requestId),
    ));
    if (existing) {
      if (
        existing.project_id !== input.projectId ||
        existing.source_media_id !== input.sourceMediaId ||
        existing.prompt !== input.prompt
      ) {
        throw new VideoGenerationError("Beställnings-ID:t används redan för en annan film.", 409);
      }
      return existing.id;
    }

    if (!enabled) throw new VideoGenerationError("Filmgenerering är inte aktiverad.", 503);
    if (price.credits > input.maxCredits) {
      throw new VideoGenerationError("Priset har ändrats. Kontrollera priset och godkänn igen.", 409);
    }

    const [source] = await tx.select({
      url: mediaLibrary.blob_url,
      mimeType: mediaLibrary.mime_type,
      fileType: mediaLibrary.file_type,
    }).from(mediaLibrary).where(and(
      eq(mediaLibrary.id, input.sourceMediaId),
      eq(mediaLibrary.user_id, userId),
      or(isNull(mediaLibrary.project_id), eq(mediaLibrary.project_id, input.projectId)),
    )).for("share");
    if (!source) throw new VideoGenerationError("Startbilden hittades inte.", 404);
    if (
      !["image", "logo"].includes(source.fileType) ||
      !VIDEO_GENERATION_SOURCE_MIME_TYPES.includes(source.mimeType)
    ) {
      throw new VideoGenerationError("Välj en startbild i PNG-, JPEG- eller WebP-format.", 400);
    }
    const sourceUrl = validSourceUrl(source.url);

    const { videos } = await getMediaLibraryCounts(userId, input.projectId, tx);
    if (videos >= MAX_MEDIA_VIDEOS) {
      throw new VideoGenerationError(
        "Kontot har nått gränsen på " + MAX_MEDIA_VIDEOS + " videor inklusive pågående beställningar.",
        400,
      );
    }

    const id = randomUUID();
    await createTransaction(
      userId, "video_generation_usage", -price.credits, "Filmgenerering med Runway",
      undefined, undefined, { executor: tx, idempotencyKey: id, rejectIfNegative: true },
    );
    await tx.insert(videoGenerationJobs).values({
      id,
      user_id: userId,
      project_id: input.projectId,
      request_id: input.requestId,
      source_media_id: input.sourceMediaId,
      source_url: sourceUrl,
      prompt: input.prompt,
      credits: price.credits,
      provider_cost_ore: price.providerCostOre,
      billable_ore: price.billableOre,
    });
    return id;
  }, { isolationLevel: "read committed" });
}

function selectPublicJobs(userId: string, projectId: string, id?: string) {
  return db.select({
    id: videoGenerationJobs.id,
    projectId: videoGenerationJobs.project_id,
    status: videoGenerationJobs.status,
    credits: videoGenerationJobs.credits,
    error: videoGenerationJobs.error,
    media: {
      id: mediaLibrary.id,
      url: mediaLibrary.blob_url,
      filename: mediaLibrary.original_name,
      mimeType: mediaLibrary.mime_type,
    },
  }).from(videoGenerationJobs).leftJoin(mediaLibrary, and(
    eq(mediaLibrary.id, videoGenerationJobs.result_media_id),
    eq(mediaLibrary.user_id, videoGenerationJobs.user_id),
    eq(mediaLibrary.project_id, videoGenerationJobs.project_id),
  )).where(and(
    eq(videoGenerationJobs.user_id, userId),
    eq(videoGenerationJobs.project_id, projectId),
    id !== undefined ? eq(videoGenerationJobs.id, id) : undefined,
  ));
}

function publicJob(row: Awaited<ReturnType<typeof selectPublicJobs>>[number]): VideoGenerationJob {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    credits: row.credits,
    ...(row.media?.url ? { media: { ...row.media, url: row.media.url } } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

export async function listVideoGenerationJobs(userId: string, projectId: string) {
  const activeFirst = sql`case when ${videoGenerationJobs.status} in ('pending', 'processing') then 0 else 1 end`;
  const rows = await selectPublicJobs(userId, projectId).orderBy(activeFirst, desc(videoGenerationJobs.created_at)).limit(30);
  return rows.map(publicJob);
}

export async function getVideoGenerationJob(userId: string, projectId: string, id: string) {
  const [row] = await selectPublicJobs(userId, projectId, id).limit(1);
  return row ? publicJob(row) : null;
}

function dueJobs(now: Date) {
  return and(
    inArray(videoGenerationJobs.status, ACTIVE_STATUSES),
    lte(videoGenerationJobs.next_check_at, now),
    or(isNull(videoGenerationJobs.lease_until), lte(videoGenerationJobs.lease_until, now)),
  );
}

export async function listDueVideoGenerationIds(limit: number) {
  const rows = await db.select({ id: videoGenerationJobs.id }).from(videoGenerationJobs)
    .where(dueJobs(new Date())).orderBy(videoGenerationJobs.next_check_at).limit(limit);
  return rows.map((row) => row.id);
}

export async function claimVideoGeneration(id: string): Promise<VideoGenerationClaim | null> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(videoGenerationJobs)
      .where(and(eq(videoGenerationJobs.id, id), dueJobs(now))).for("update");
    if (!job) return null;

    const leaseId = randomUUID();
    // A pending order gets exactly one submission claim. An expired lease on
    // a processing order without a provider task ID cannot authorize a repeat.
    await tx.update(videoGenerationJobs).set({
      status: "processing",
      lease_id: leaseId,
      lease_until: new Date(Date.now() + LEASE_MS),
    }).where(eq(videoGenerationJobs.id, id));
    return { job, leaseId };
  });
}

function leaseMatches(claim: VideoGenerationClaim) {
  return and(
    eq(videoGenerationJobs.id, claim.job.id),
    eq(videoGenerationJobs.status, "processing"),
    eq(videoGenerationJobs.lease_id, claim.leaseId),
  );
}

export async function deferVideoGeneration(
  claim: VideoGenerationClaim,
  waitMs: number,
  options: { providerTaskId?: string; retry?: boolean } = {},
) {
  await db.update(videoGenerationJobs).set({
    ...(options.providerTaskId ? { provider_task_id: options.providerTaskId } : {}),
    next_check_at: new Date(Date.now() + waitMs),
    lease_id: null,
    lease_until: null,
    poll_failures: options.retry ? claim.job.poll_failures + 1 : 0,
  }).where(leaseMatches(claim));
}

export async function failVideoGeneration(claim: VideoGenerationClaim, error: string) {
  return db.transaction(async (tx) => {
    const [job] = await tx.update(videoGenerationJobs).set({
      status: "failed",
      error,
      lease_id: null,
      lease_until: null,
    }).where(leaseMatches(claim)).returning({ id: videoGenerationJobs.id });
    if (!job) return false;

    await createTransaction(
      claim.job.user_id, "video_generation_usage_refund", claim.job.credits,
      "Återbetalning för misslyckad filmgenerering", undefined, undefined,
      { executor: tx, idempotencyKey: claim.job.id },
    );
    return true;
  });
}

export async function completeVideoGeneration(claim: VideoGenerationClaim, video: StoredVideo) {
  const { id, user_id: userId, project_id: projectId } = claim.job;
  return db.transaction(async (tx) => {
    // Transfer the existing reservation to a stored video atomically. Ordinary
    // uploads see either the reservation or the finished video, never a gap.
    await lockVideoMediaQuota(tx, userId);
    const [job] = await tx.select({ id: videoGenerationJobs.id })
      .from(videoGenerationJobs).where(leaseMatches(claim)).for("update");
    if (!job) return false;

    await requireMediaUploadProject(userId, projectId, tx);
    const [item] = await tx.insert(mediaLibrary).values({
      user_id: userId,
      project_id: projectId,
      filename: video.filename,
      original_name: video.filename,
      file_path: video.path,
      blob_url: video.url,
      mime_type: "video/mp4",
      file_type: "video",
      size_bytes: video.size,
    }).returning({ id: mediaLibrary.id });

    await tx.update(videoGenerationJobs).set({
      status: "succeeded",
      result_media_id: item.id,
      lease_id: null,
      lease_until: null,
    }).where(eq(videoGenerationJobs.id, id));
    return true;
  });
}

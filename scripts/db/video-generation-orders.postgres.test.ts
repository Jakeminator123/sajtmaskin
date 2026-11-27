// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calculateCustomerCharge } from "../../src/lib/billing/model-cost";
import * as schema from "../../src/lib/db/schema";
import { MAX_MEDIA_VIDEOS } from "../../src/lib/media/upload-limits";
import {
  VIDEO_GENERATION_DURATION_SECONDS,
  VIDEO_GENERATION_MODEL,
  type VideoGenerationQuote,
} from "../../src/lib/media/video-generation-contract";
import { checkDbEnvTarget, loadDbTargets, resolveConfiguredDbUrl } from "./check-db-env-target.mjs";

const state = vi.hoisted(() => ({ db: null as NodePgDatabase<typeof schema> | null }));
vi.mock("@/lib/db/client", () => ({
  get db() { return state.db; },
  dbConfigured: true,
}));

const configured = resolveConfiguredDbUrl(process.env);
const target = configured && checkDbEnvTarget({
  expect: "dev",
  urlValue: configured.value,
  targets: loadDbTargets(),
}).ok && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(configured.value).hostname)
  ? configured.value : null;

if (!target && process.env.REQUIRE_POSTGRES_TESTS === "1") {
  throw new Error("Video order concurrency tests require isolated localhost Postgres.");
}

const initialBalance = 100;
const charge = calculateCustomerCharge({
  providerCostMicroUsd: 250_000,
  usdToSekOre: 1_000,
  markupBasisPoints: 12_000,
  sekPerCreditOre: 100,
});
const price = {
  ...charge,
  quote: {
    credits: charge.credits,
    durationSeconds: VIDEO_GENERATION_DURATION_SECONDS,
    model: VIDEO_GENERATION_MODEL,
  } satisfies VideoGenerationQuote,
};

describe.skipIf(!target)("paid video orders in isolated Postgres", () => {
  const fixtures: { userId: string; projectId: string }[] = [];
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;
  let video: typeof import("../../src/lib/media/video-generation-store");
  let media: typeof import("../../src/lib/db/services/media");

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target!,
      max: 4,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 8_000,
    });
    db = drizzle(pool, { schema });
    state.db = db;
    video = await import("../../src/lib/media/video-generation-store");
    media = await import("../../src/lib/db/services/media");
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      if (fixtures.length === 0) return;
      const userIds = fixtures.map(({ userId }) => userId);
      const projectIds = fixtures.map(({ projectId }) => projectId);
      await db.transaction(async (tx) => {
        await tx.delete(schema.videoGenerationJobs).where(inArray(schema.videoGenerationJobs.user_id, userIds));
        await tx.delete(schema.transactions).where(inArray(schema.transactions.user_id, userIds));
        await tx.delete(schema.mediaLibrary).where(inArray(schema.mediaLibrary.user_id, userIds));
        await tx.delete(schema.appProjects).where(inArray(schema.appProjects.id, projectIds));
        await tx.delete(schema.users).where(inArray(schema.users.id, userIds));
      });
    } finally {
      await pool.end();
    }
  });

  async function prepare() {
    const tag = "video-order-test-" + randomUUID();
    const userId = tag + "-owner";
    const projectId = tag + "-site";
    fixtures.push({ userId, projectId });

    const sourceMediaId = await db.transaction(async (tx) => {
      await tx.insert(schema.users).values({
        id: userId, email: userId + "@example.invalid", diamonds: initialBalance,
      });
      await tx.insert(schema.appProjects).values({ id: projectId, user_id: userId, name: "Video order test" });
      const filePath = [userId, "projects", projectId, "media-library", "source.png"].join("/");
      const [source] = await tx.insert(schema.mediaLibrary).values({
        user_id: userId,
        project_id: projectId,
        filename: "source.png",
        original_name: "source.png",
        file_path: filePath,
        blob_url: "https://test-store.public.blob.vercel-storage.com/" + filePath,
        file_type: "image",
        mime_type: "image/png",
        size_bytes: 16,
      }).returning({ id: schema.mediaLibrary.id });
      return source.id;
    });

    return {
      userId,
      projectId,
      order: {
        projectId,
        sourceMediaId,
        requestId: randomUUID(),
        prompt: "Slow pan across the garden",
        maxCredits: price.credits,
      },
    };
  }

  function saveUploadedVideo(userId: string, name: string, projectId?: string) {
    const parts = projectId ? [userId, "projects", projectId, "media-library"] : [userId];
    const filePath = [...parts, name].join("/");
    const blobUrl = "https://test-store.public.blob.vercel-storage.com/" + filePath;
    return media.saveMediaLibraryItem(userId, name, name, filePath, "video/mp4", 16, blobUrl, projectId);
  }

  async function leaveOneVideoSlot(userId: string) {
    for (let index = 0; index < MAX_MEDIA_VIDEOS - 1; index += 1) {
      await saveUploadedVideo(userId, "seed-" + index + ".mp4");
    }
  }

  function jobs(userId: string) {
    return db.select({ id: schema.videoGenerationJobs.id })
      .from(schema.videoGenerationJobs).where(eq(schema.videoGenerationJobs.user_id, userId));
  }

  function ledger(userId: string) {
    return db.select({
      type: schema.transactions.type,
      amount: schema.transactions.amount,
      key: schema.transactions.idempotency_key,
    }).from(schema.transactions).where(eq(schema.transactions.user_id, userId))
      .orderBy(schema.transactions.type);
  }

  async function balance(userId: string) {
    const [row] = await db.select({ diamonds: schema.users.diamonds })
      .from(schema.users).where(eq(schema.users.id, userId));
    return row.diamonds;
  }

  async function claimSubmitted(id: string) {
    const submitClaim = await video.claimVideoGeneration(id);
    if (!submitClaim) throw new Error("Expected a submission claim");
    await video.deferVideoGeneration(submitClaim, 0, { providerTaskId: randomUUID() });
    const claim = await video.claimVideoGeneration(id);
    if (!claim) throw new Error("Expected a settlement claim");
    return claim;
  }

  it("shares one order and one charge across simultaneous deliveries of the same request", async () => {
    const { userId, order } = await prepare();
    const [id, replay] = await Promise.all([
      video.orderVideoGeneration(userId, order, price, true),
      video.orderVideoGeneration(userId, order, price, true),
    ]);

    expect(replay).toBe(id);
    await expect(jobs(userId)).resolves.toEqual([{ id }]);
    await expect(balance(userId)).resolves.toBe(initialBalance - price.credits);
    await expect(ledger(userId)).resolves.toEqual([
      { type: "video_generation_usage", amount: -price.credits, key: id },
    ]);
  });

  it("charges only the one distinct order that reserves the final account video slot", async () => {
    const { userId, projectId, order } = await prepare();
    await leaveOneVideoSlot(userId);

    const results = await Promise.allSettled([
      video.orderVideoGeneration(userId, order, price, true),
      video.orderVideoGeneration(userId, { ...order, requestId: randomUUID() }, price, true),
    ]);

    const accepted = results.find((result) => result.status === "fulfilled");
    expect(accepted?.value).toBeDefined();
    expect(results.find((result) => result.status === "rejected")?.reason)
      .toMatchObject({ status: 400, message: expect.stringContaining("gränsen") });
    await expect(jobs(userId)).resolves.toEqual([{ id: accepted?.value }]);
    await expect(ledger(userId)).resolves.toEqual([
      { type: "video_generation_usage", amount: -price.credits, key: accepted?.value },
    ]);
    await expect(balance(userId)).resolves.toBe(initialBalance - price.credits);
    await expect(media.getMediaLibraryCounts(userId, projectId)).resolves.toMatchObject({ videos: MAX_MEDIA_VIDEOS });
  });

  it("lets either an ordinary upload or a paid order claim the last video slot", async () => {
    const { userId, projectId, order } = await prepare();
    await leaveOneVideoSlot(userId);
    const filename = "ordinary.mp4";

    const [upload, generation] = await Promise.allSettled([
      saveUploadedVideo(userId, filename, projectId),
      video.orderVideoGeneration(userId, order, price, true),
    ]);

    expect([upload, generation].filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const overQuota = { status: 400, message: expect.stringContaining("gränsen") };
    if (generation.status === "fulfilled") {
      expect(upload).toMatchObject({ status: "rejected", reason: overQuota });
      await expect(jobs(userId)).resolves.toEqual([{ id: generation.value }]);
      await expect(ledger(userId)).resolves.toEqual([
        { type: "video_generation_usage", amount: -price.credits, key: generation.value },
      ]);
      await expect(balance(userId)).resolves.toBe(initialBalance - price.credits);
    } else {
      expect(generation.reason).toMatchObject(overQuota);
      await expect(jobs(userId)).resolves.toEqual([]);
      await expect(ledger(userId)).resolves.toEqual([]);
      await expect(balance(userId)).resolves.toBe(initialBalance);
    }

    const stored = await db.select({ id: schema.mediaLibrary.id })
      .from(schema.mediaLibrary).where(and(
        eq(schema.mediaLibrary.user_id, userId),
        eq(schema.mediaLibrary.project_id, projectId),
        eq(schema.mediaLibrary.filename, filename),
      ));
    expect(stored).toEqual(upload.status === "fulfilled" ? [{ id: upload.value.id }] : []);
    await expect(media.getMediaLibraryCounts(userId, projectId))
      .resolves.toMatchObject({ videos: MAX_MEDIA_VIDEOS });
  });

  it("refunds two simultaneous failure callbacks once and releases the reservation", async () => {
    const { userId, projectId, order } = await prepare();
    const id = await video.orderVideoGeneration(userId, order, price, true);
    const claim = await claimSubmitted(id);

    const results = await Promise.all([
      video.failVideoGeneration(claim, "Provider failed"),
      video.failVideoGeneration(claim, "Provider failed"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(video.getVideoGenerationJob(userId, projectId, id)).resolves.toMatchObject({ status: "failed" });
    await expect(balance(userId)).resolves.toBe(initialBalance);
    await expect(ledger(userId)).resolves.toEqual([
      { type: "video_generation_usage", amount: -price.credits, key: id },
      { type: "video_generation_usage_refund", amount: price.credits, key: id },
    ]);
    await expect(media.getMediaLibraryCounts(userId, projectId)).resolves.toMatchObject({ videos: 0 });
  });

  it("commits one project MP4 when successful settlement is delivered twice", async () => {
    const { userId, projectId, order } = await prepare();
    const id = await video.orderVideoGeneration(userId, order, price, true);
    const claim = await claimSubmitted(id);
    const filename = "film-" + id + ".mp4";
    const path = [userId, "projects", projectId, "media-library", filename].join("/");
    const url = "https://test-store.public.blob.vercel-storage.com/" + path;
    const stored = { filename, path, url, size: 6 * 1024 * 1024 };

    const results = await Promise.all([
      video.completeVideoGeneration(claim, stored),
      video.completeVideoGeneration(claim, stored),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const saved = await db.select({ id: schema.mediaLibrary.id, url: schema.mediaLibrary.blob_url })
      .from(schema.mediaLibrary).where(and(
        eq(schema.mediaLibrary.user_id, userId),
        eq(schema.mediaLibrary.project_id, projectId),
        eq(schema.mediaLibrary.file_type, "video"),
      ));
    expect(saved).toEqual([{ id: expect.any(Number), url }]);
    await expect(video.getVideoGenerationJob(userId, projectId, id)).resolves.toMatchObject({
      status: "succeeded", media: { id: saved[0].id, url, filename, mimeType: "video/mp4" },
    });
    await expect(ledger(userId)).resolves.toEqual([
      { type: "video_generation_usage", amount: -price.credits, key: id },
    ]);
    await expect(media.getMediaLibraryCounts(userId, projectId)).resolves.toMatchObject({ videos: 1 });
  });
});

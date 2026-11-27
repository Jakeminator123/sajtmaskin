// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { mediaLibrary, videoGenerationJobs } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  quota: vi.fn(),
  owner: vi.fn(),
  ledger: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  prior: vi.fn(),
  source: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/db/services/media", () => ({
  requireMediaUploadProject: mocks.owner, lockVideoMediaQuota: mocks.lock,
  getMediaLibraryCounts: mocks.quota,
}));
vi.mock("@/lib/db/services/transactions", () => ({ createTransaction: mocks.ledger }));

import {
  completeVideoGeneration,
  failVideoGeneration,
  orderVideoGeneration,
  type VideoGenerationClaim,
} from "./video-generation-store";

const input = {
  projectId: "site", sourceMediaId: "22", prompt: "Move",
  requestId: "17f20503-6c24-4c16-946b-35dbbce2af2f", maxCredits: 2,
};
const price = {
  credits: 2, providerCostOre: 245, billableOre: 490,
  quote: { credits: 2, durationSeconds: 5, model: "gen4_turbo" } as const,
};

const tx = {
  select: () => ({
    from: (table: unknown) => ({
      where: (predicate: SQL) => {
        const sql = new PgDialect().sqlToQuery(predicate);
        if (table === videoGenerationJobs) {
          return Object.assign(Promise.resolve(mocks.prior(sql)), {
            for: (lock: string) => {
              expect(lock).toBe("update");
              return mocks.prior(sql);
            },
          });
        }
        expect(table).toBe(mediaLibrary);
        return { for: (lock: string) => {
          expect(lock).toBe("share");
          return mocks.source(sql);
        } };
      },
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: unknown) => {
      mocks.insert(table, values);
      return { returning: () => [{ id: "17" }] };
    },
  }),
  update: (table: unknown) => ({
    set: (values: unknown) => ({
      where: (condition: SQL) => {
        expect(table).toBe(videoGenerationJobs);
        const predicate = new PgDialect().sqlToQuery(condition);
        const result = mocks.update(values, predicate);
        return { returning: () => result };
      },
    }),
  }),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((callback) => callback(tx));
  mocks.prior.mockReturnValue([]);
  mocks.quota.mockResolvedValue({ videos: 2 });
  mocks.source.mockReturnValue([{
    url: "https://store.public.blob.vercel-storage.com/owner/image.png",
    fileType: "image", mimeType: "image/png",
  }]);
});

describe("paid video orders", () => {
  it("locks quota, checks the owned source and reserves/debits within one transaction", async () => {
    const id = await orderVideoGeneration("owner", input, price, true);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(tx, "owner");
    expect(mocks.owner).toHaveBeenCalledExactlyOnceWith("owner", "site", tx);
    expect(mocks.source).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      params: ["22", "owner", "site"],
      sql: expect.stringContaining('"media_library"."project_id" is null'),
    }));
    expect(mocks.quota).toHaveBeenCalledExactlyOnceWith("owner", "site", tx);
    expect(mocks.ledger).toHaveBeenCalledExactlyOnceWith(
      "owner", "video_generation_usage", -2, expect.any(String),
      undefined, undefined, { executor: tx, idempotencyKey: id, rejectIfNegative: true },
    );
    expect(mocks.insert).toHaveBeenCalledWith(videoGenerationJobs, expect.objectContaining({
      id, user_id: "owner", project_id: "site", request_id: input.requestId,
      source_media_id: 22n, credits: 2, provider_cost_ore: 245, billable_ore: 490,
    }));
  });

  it("replays the same UUID without consuming another slot or checking a new quote", async () => {
    mocks.prior.mockReturnValue([{
      id: "prior-job", source_media_id: 22n, prompt: input.prompt,
      project_id: input.projectId,
    }]);
    await expect(orderVideoGeneration("owner", input, price, false)).resolves.toBe("prior-job");
    await expect(orderVideoGeneration("owner", { ...input, prompt: "Different" }, price, true))
      .rejects.toMatchObject({ status: 409 });
    await expect(orderVideoGeneration("owner", { ...input, sourceMediaId: "23" }, price, true))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.ledger).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a changed price, foreign source and full video quota before debiting", async () => {
    await expect(orderVideoGeneration("owner", { ...input, maxCredits: 1 }, price, true))
      .rejects.toMatchObject({ status: 409 });
    mocks.source.mockReturnValueOnce([]);
    await expect(orderVideoGeneration("owner", input, price, true)).rejects.toMatchObject({ status: 404 });
    mocks.quota.mockResolvedValueOnce({ videos: 3 });
    await expect(orderVideoGeneration("owner", input, price, true)).rejects.toMatchObject({ status: 400 });
    expect(mocks.ledger).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("records a refund only for the current lease and keys it to the original order", async () => {
    const claim = {
      leaseId: "claim",
      job: { id: "job", user_id: "owner", project_id: "site", credits: 2 },
    } as VideoGenerationClaim;
    mocks.update.mockReturnValueOnce([{ id: "job" }]).mockReturnValueOnce([]);
    await expect(failVideoGeneration(claim, "Safe refund reason")).resolves.toBe(true);
    await expect(failVideoGeneration(claim, "Safe refund reason")).resolves.toBe(false);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }),
      expect.objectContaining({ params: ["job", "processing", "claim"] }));
    expect(mocks.ledger).toHaveBeenCalledExactlyOnceWith(
      "owner", "video_generation_usage_refund", 2, expect.any(String), undefined, undefined,
      { executor: tx, idempotencyKey: "job" },
    );
  });

  it("holds the account reservation while attaching stored MP4 metadata to the owned site", async () => {
    const claim = {
      leaseId: "claim",
      job: { id: "job", user_id: "owner", project_id: "site", credits: 2 },
    } as VideoGenerationClaim;
    mocks.prior.mockReturnValue([{ id: "job" }]);
    await expect(completeVideoGeneration(claim, {
      filename: "film.mp4", size: 8_000_000,
      path: "owner/projects/site/media-library/film.mp4", url: "https://blob.example/film.mp4",
    })).resolves.toBe(true);
    expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(tx, "owner");
    expect(mocks.owner).toHaveBeenCalledExactlyOnceWith("owner", "site", tx);
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(mediaLibrary, expect.objectContaining({
      user_id: "owner", project_id: "site", size_bytes: 8_000_000, file_type: "video", mime_type: "video/mp4",
    }));
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded", result_media_id: 17n }),
      expect.objectContaining({ params: ["job"] }),
    );
    expect(mocks.ledger).not.toHaveBeenCalled();
  });
});

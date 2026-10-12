import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// Exercise the real service and compile its PostgreSQL guards. No live DB.
const state = vi.hoisted(() => ({
  selected: [] as Array<Array<Record<string, unknown>>>,
  updated: [] as Array<Array<Record<string, unknown>>>,
  sets: [] as Array<Record<string, unknown>>,
  wheres: [] as unknown[],
  deletes: [] as unknown[],
  failUpdate: false,
}));
vi.mock("@/lib/vercel/blob-service", () => ({ deleteBlob: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.selected.shift() ?? [] }) }) }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        state.sets.push(value);
        return { where: (condition: unknown) => {
          state.wheres.push(condition);
          return { returning: async () => {
            if (state.failUpdate) throw new Error("offline write failed");
            return state.updated.shift() ?? [];
          } };
        } };
      },
    }),
    delete: () => ({ where: async (condition: unknown) => { state.deletes.push(condition); } }),
  },
}));

import { abandonLiveReviewRun, beginPaidLiveReviewAttempt, claimLiveReviewRun, completeLiveReviewRun } from "./live-review-runs";
import { LIVE_REVIEW_MAX_MODEL_ATTEMPTS, skippedLiveReviewResult } from "@/lib/gen/verify/live-review-claim";

const compile = (value: unknown) => new PgDialect().sqlToQuery(value as SQL);
const claimedAt = new Date("2020-01-01T00:00:00.000Z");

beforeEach(() => {
  state.selected = []; state.updated = []; state.sets = [];
  state.wheres = []; state.deletes = []; state.failUpdate = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("durable LiveReview attempt guards", () => {
  it.each([undefined, 0, 1, 2])("uses an atomic monotonic completion counter even when the supplied count is %s", async (modelAttempts) => {
    state.updated.push([{ id: "lr_1" }]);
    await expect(completeLiveReviewRun({
      id: "lr_1", result: skippedLiveReviewResult("cost_capped"), modelAttempts,
    })).resolves.toBe(true);
    const counter = compile(state.sets[0]?.modelAttempts);
    expect(counter.sql).toBe('greatest("live_review_runs"."model_attempts", $1)');
    expect(counter.params).toEqual([modelAttempts ?? 0]);
  });

  it("allows abandon only for a running unreserved claim owned by the caller", async () => {
    await abandonLiveReviewRun("lr_1", claimedAt);
    const condition = compile(state.deletes[0]);
    expect(condition.sql).toContain('"model_attempts" = $3');
    expect(condition.sql).toContain('"claimed_at" = $4');
    expect(condition.params.slice(0, 3)).toEqual(["lr_1", "running", 0]);
  });

  it("also protects reserved attempts when a legacy abandon caller omits claimedAt", async () => {
    await abandonLiveReviewRun("lr_1");
    const condition = compile(state.deletes[0]);
    expect(condition.sql).toContain('"model_attempts" = $3');
    expect(condition.params).toEqual(["lr_1", "running", 0]);
  });

  it("reserves by an atomic increment fenced by owner, running status and the existing cap", async () => {
    state.updated.push([{ modelAttempts: 2 }]);
    await expect(beginPaidLiveReviewAttempt({ id: "lr_1", claimedAt })).resolves.toBe(2);
    expect(compile(state.sets[0]?.modelAttempts).sql).toBe('"live_review_runs"."model_attempts" + 1');
    const condition = compile(state.wheres[0]);
    expect(condition.sql).toContain('"claimed_at" = $3');
    expect(condition.sql).toContain('"model_attempts" < $4');
    expect(condition.params[0]).toBe("lr_1");
    expect(condition.params[1]).toBe("running");
    expect(condition.params[3]).toBe(LIVE_REVIEW_MAX_MODEL_ATTEMPTS);
  });

  it.each([false, true])("returns no reservation on a lost/capped claim or write failure (%s)", async (failUpdate) => {
    state.failUpdate = failUpdate;
    await expect(beginPaidLiveReviewAttempt({ id: "lr_1", claimedAt })).resolves.toBeNull();
  });

  it("takes over an expired lease without resetting its reserved attempt count", async () => {
    const row = {
      id: "lr_1", chatId: "chat_1", versionId: "v1", filesRevision: "rev_a", userId: "user_1",
      status: "running", result: null, modelAttempts: 1, claimedAt,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    };
    state.selected.push([row]);
    state.updated.push([{ ...row, claimedAt: new Date() }]);
    const claim = await claimLiveReviewRun({ chatId: "chat_1", versionId: "v1", filesRevision: "rev_a", userId: "user_1" });
    expect(claim?.kind).toBe("acquired");
    expect(claim?.row.modelAttempts).toBe(1);
    expect(state.sets[0]).not.toHaveProperty("modelAttempts");
    expect(compile(state.wheres[0]).sql).toContain('"model_attempts" = $2');
    expect(compile(state.wheres[0]).params[1]).toBe(1);
  });

  it("reports a failed completion without issuing a counter-erasing delete", async () => {
    state.failUpdate = true;
    await expect(completeLiveReviewRun({ id: "lr_1", result: skippedLiveReviewResult("review_error"), modelAttempts: 1 })).resolves.toBe(false);
    expect(state.deletes).toEqual([]);
  });
});

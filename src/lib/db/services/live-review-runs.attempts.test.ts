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
  guardSelected: [] as Array<Array<Record<string, unknown>>>,
  guards: [] as unknown[],
  lockOrder: [] as string[],
  statements: [] as unknown[],
  txWrites: 0,
  failGuard: false,
  failCommit: false,
}));
vi.mock("@/lib/vercel/blob-service", () => ({ deleteBlob: vi.fn() }));
vi.mock("@/lib/db/client", () => {
  const update = () => ({
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
  });
  return {
    dbConfigured: true,
    db: {
      insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => state.selected.shift() ?? [] }) }) }),
      update,
      delete: () => ({ where: async (condition: unknown) => { state.deletes.push(condition); } }),
      transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        const result = await run({
          execute: async (statement: unknown) => {
            state.statements.push(statement);
            if (state.failGuard) throw new Error("offline guard failure");
          },
          select: () => ({ from: (table: unknown) => ({ where: (condition: unknown) => ({
            for: async (mode: string) => {
              expect(mode).toBe("update");
              state.lockOrder.push(table === engineVersions ? "version" : "job");
              state.guards.push(condition);
              return state.guardSelected.shift() ?? [];
            },
          }) }) }),
          update: () => {
            state.lockOrder.push("live-review");
            state.txWrites += 1;
            return update();
          },
        });
        if (state.failCommit) throw new Error("offline commit failure");
        return result;
      },
    },
  };
});

import { abandonLiveReviewRun, beginPaidLiveReviewAttempt, claimLiveReviewRun, completeLiveReviewRun } from "./live-review-runs";
import { LIVE_REVIEW_MAX_MODEL_ATTEMPTS, skippedLiveReviewResult } from "@/lib/gen/verify/live-review-claim";
import { engineVersions } from "@/lib/db/schema";
import { finishLiveReviewSession, type LiveReviewSession } from "@/lib/gen/verify/live-review-session";

const compile = (value: unknown) => new PgDialect().sqlToQuery(value as SQL);
const HELD = { chatId: "chat_1", versionId: "v1", filesRevision: "rev_a", holderRunId: "holder_1" };
const FUTURE = Date.now() + 900_000;
const claimedAt = new Date("2020-01-01T00:00:00.000Z");

beforeEach(() => {
  state.selected = []; state.updated = []; state.sets = [];
  state.wheres = []; state.deletes = []; state.failUpdate = false;
  state.guardSelected = []; state.guards = []; state.lockOrder = []; state.statements = [];
  state.txWrites = 0; state.failGuard = false; state.failCommit = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("LiveReview reservation under an existing versionsholder", () => {
  const held = { chatId: "chat_1", versionId: "v1", filesRevision: "rev_a", holderRunId: "holder_1" };
  const reserve = (context = held) => beginPaidLiveReviewAttempt({deadlineAt: FUTURE,  id: "lr_1", claimedAt, held: context });
  function currentTarget() {
    state.guardSelected.push([{ chatId: held.chatId, filesRevision: held.filesRevision }], [{ runId: held.holderRunId }]);
  }

  it("locks version then job and increments in the same transaction with both SQL fences and the unchanged LR CAS/cap", async () => {
    currentTarget();
    state.updated.push([{ modelAttempts: 2 }]);
    await expect(reserve()).resolves.toBe(2);
    expect(state.lockOrder).toEqual(["version", "job", "live-review"]);
    expect(state.txWrites).toBe(1);
    expect(compile(state.statements[0]).sql).toContain("set_config('lock_timeout'");
    const job = compile(state.guards[1]);
    expect(job.params).toEqual([held.versionId, held.holderRunId, "running"]);
    expect(job.sql).toContain('"lease_expires_at" > clock_timestamp()');
    const increment = compile(state.wheres[0]);
    expect(increment.sql).toContain('"live_review_runs"."claimed_at" =');
    expect(increment.sql).toContain('"live_review_runs"."model_attempts" <');
    expect(increment.params).toContain(LIVE_REVIEW_MAX_MODEL_ATTEMPTS);
    expect(increment.sql).toContain('EXISTS (SELECT 1 FROM "engine_versions"');
    expect(increment.sql).toContain('"engine_versions"."files_revision" =');
    expect(increment.sql).toContain('EXISTS (SELECT 1 FROM "engine_version_jobs"');
    expect(increment.sql).toContain('"lease_expires_at" > clock_timestamp()');
    expect(increment.params).toContain(held.holderRunId);
    expect(increment.params).toContain(held.filesRevision);
    expect(compile(state.sets[0].modelAttempts).sql).toBe('"live_review_runs"."model_attempts" + 1');
  });

  it.each([
    { reason: "unknown", versions: [] },
    { reason: "chat-mismatched", versions: [{ chatId: "other", filesRevision: "rev_a" }] },
    { reason: "replaced", versions: [{ chatId: "chat_1", filesRevision: "rev_b" }] },
  ])(
    "does not increment for a $reason version", async ({ versions }) => {
      state.guardSelected.push(versions);
      await expect(reserve()).resolves.toBeNull();
      expect(state.txWrites).toBe(0);
      expect(state.lockOrder).toEqual(["version"]);
    },
  );

  it("does not increment when the holder query finds no active unexpired job", async () => {
    state.guardSelected.push([{ chatId: "chat_1", filesRevision: "rev_a" }], []);
    await expect(reserve()).resolves.toBeNull();
    expect(state.txWrites).toBe(0);
  });

  it("also fails closed if expiry or LR takeover makes the final conditional increment miss", async () => {
    currentTarget();
    state.updated.push([]);
    await expect(reserve()).resolves.toBeNull();
    expect(state.txWrites).toBe(1);
    expect(compile(state.wheres[0]).sql).toContain("clock_timestamp()");
  });

  it.each([0, NaN, Infinity])("invalid/exhausted deadline %s cannot reserve", async deadlineAt => {
    currentTarget();
    await expect(beginPaidLiveReviewAttempt({ id: "lr_1", claimedAt, held, deadlineAt })).resolves.toBeNull();
    expect(state.statements).toEqual([]); expect(state.sets).toEqual([]);
  });

  it("an old caller omitting held is denied rather than buying unheld work", async () => {
    const input = { id: "lr_1", claimedAt, deadlineAt: FUTURE } as Parameters<typeof beginPaidLiveReviewAttempt>[0];
    await expect(beginPaidLiveReviewAttempt(input)).resolves.toBeNull();
    expect(state.statements).toEqual([]); expect(state.sets).toEqual([]);
  });

  it.each([undefined, null, {}, { ...held, holderRunId: " " }, { ...held, filesRevision: null }, { ...held, versionId: 4 }])(
    "never degrades an explicitly malformed held context (%j) to a direct reservation", async (invalid) => {
      state.updated.push([{ modelAttempts: 1 }]);
      await expect(beginPaidLiveReviewAttempt({deadlineAt: FUTURE,  id: "lr_1", claimedAt, held: invalid as typeof held })).resolves.toBeNull();
      expect(state.sets).toEqual([]);
      expect(state.statements).toEqual([]);
    },
  );

  function session(): LiveReviewSession {
    return {
        deadlineAt: FUTURE,
      captureEnabled: true, allowed: true, earlyResult: null, ...held, userId: "user_1", held,
      claim: { kind: "acquired", row: {
        id: "lr_1", chatId: held.chatId, versionId: held.versionId, filesRevision: held.filesRevision,
        userId: "user_1", status: "running", skipReason: null, result: null, modelAttempts: 1,
        desktopUrl: null, mobileUrl: null, desktopBlobPath: null, mobileBlobPath: null,
        claimedAt, completedAt: null, expiresAt: new Date(),
      } },
    };
  }

  it.each(["takeover", "unknown-holder", "expired-holder", "revision", "guard-error", "update-error", "commit-error", "conditional-miss"])(
    "stops before the model when %s occurs after target checking and before reservation", async (failure) => {
      currentTarget();
      state.updated.push([{ modelAttempts: 2 }]);
      const attachReview = vi.fn();
      const completeRun = vi.fn();
      const abandonRun = vi.fn();
      const deleteScreenshotUrls = vi.fn(async () => {});
      const screenshots = { desktopUrl: "https://blob.example/own.jpg", mobileUrl: null };
      const result = await finishLiveReviewSession(session(), {
        skipped: false, findings: [], screenshots, domSummary: null, filesJson: "[]",
        userRequest: "x", briefSummary: "",
        isTargetCurrent: async () => {
          if (["takeover", "unknown-holder", "expired-holder"].includes(failure)) state.guardSelected[1] = [];
          if (failure === "revision") state.guardSelected[0] = [{ chatId: "chat_1", filesRevision: "rev_b" }];
          if (failure === "guard-error") state.failGuard = true;
          if (failure === "update-error") state.failUpdate = true;
          if (failure === "commit-error") state.failCommit = true;
          if (failure === "conditional-miss") state.updated[0] = [];
          return true;
        },
      }, {
        beginPaidAttempt: beginPaidLiveReviewAttempt,
        attachReview, completeRun, abandonRun, deleteScreenshotUrls,
        waitForRun: async () => skippedLiveReviewResult("claim_busy"),
      });
      expect(result).toEqual(skippedLiveReviewResult("claim_busy"));
      expect(attachReview).not.toHaveBeenCalled();
      expect(completeRun).not.toHaveBeenCalled();
      expect(abandonRun).not.toHaveBeenCalled();
      expect(state.deletes).toEqual([]);
      expect(deleteScreenshotUrls).toHaveBeenCalledWith(screenshots);
    },
  );
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
    state.guardSelected.push([{ chatId: HELD.chatId, filesRevision: HELD.filesRevision }], [{ runId: HELD.holderRunId }]);
    state.updated.push([{ modelAttempts: 2 }]);
    await expect(beginPaidLiveReviewAttempt({
        held: HELD, deadlineAt: FUTURE,  id: "lr_1", claimedAt })).resolves.toBe(2);
    expect(compile(state.sets[0]?.modelAttempts).sql).toBe('"live_review_runs"."model_attempts" + 1');
    const condition = compile(state.wheres[0]);
    expect(condition.sql).toContain('"claimed_at" = $3');
    expect(condition.sql).toContain('"model_attempts" < $4');
    expect(condition.params[0]).toBe("lr_1");
    expect(condition.params[1]).toBe("running");
    expect(condition.params[3]).toBe(LIVE_REVIEW_MAX_MODEL_ATTEMPTS);
  });

  it.each([false, true])("returns no reservation on a lost/capped claim or write failure (%s)", async (failUpdate) => {
    state.guardSelected.push([{ chatId: HELD.chatId, filesRevision: HELD.filesRevision }], [{ runId: HELD.holderRunId }]);
    state.failUpdate = failUpdate;
    await expect(beginPaidLiveReviewAttempt({
        held: HELD, deadlineAt: FUTURE,  id: "lr_1", claimedAt })).resolves.toBeNull();
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

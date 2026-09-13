import { beforeEach, describe, expect, it, vi } from "vitest";
const getRedis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/redis", () => ({ getRedis }));
vi.mock("@/lib/config", () => ({ REDIS_KEY_PREFIX: "test:" }));

import { createPlanModeStream } from "./plan-mode-stream";
import { runWithGenerationWork, trackGenerationWork } from "./generation-work";
import {
  acquireUserGenerationLock,
  bindUserGenerationLockToResponse,
  resetChatGenerationLocksForTests,
} from "./generation-lock";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  getRedis.mockReturnValue(null);
  resetChatGenerationLocksForTests();
});

describe("generation execution lifecycle", () => {
  it("holds canceled plan admission through pending persistence and billing, then permits retry", async () => {
    const persistence = deferred();
    const billing = deferred();
    const persist = vi.fn(() => persistence.promise);
    const commit = vi.fn(() => billing.promise);
    const upstreamCanceled = vi.fn();
    const response = await runWithGenerationWork(async (completion) => {
      const admission = await acquireUserGenerationLock("user-1");
      if (admission.status !== "acquired") throw new Error("admission failed");
      const stream = createPlanModeStream({
        pipelineStream: new ReadableStream<Uint8Array>({ cancel: upstreamCanceled }),
        meta: {},
        resolvePlanArtifact: () => null,
        persistAssistantSummary: persist,
        buildDonePayload: () => ({}),
        commitCredits: commit,
      });
      return bindUserGenerationLockToResponse(
        new Response(stream, { headers: { "content-type": "text/event-stream" } }),
        admission.lock,
        undefined,
        completion(),
      );
    });
    await response.body!.cancel("client left");
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
    expect(upstreamCanceled).toHaveBeenCalledOnce();
    expect(await acquireUserGenerationLock("user-1")).toEqual({ status: "held" });
    persistence.resolve();
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce());
    expect(await acquireUserGenerationLock("user-1")).toEqual({ status: "held" });
    billing.resolve();
    await vi.waitFor(async () => {
      expect(await acquireUserGenerationLock("user-1")).toMatchObject({ status: "acquired" });
    });
  });

  it("keeps overlapping request executions isolated and observes rejected cleanup", async () => {
    const first = deferred();
    const second = deferred();
    const done1 = vi.fn();
    const done2 = vi.fn();
    const run1 = runWithGenerationWork(async (completion) => {
      trackGenerationWork(() => first.promise);
      await completion();
      done1();
    });
    const run2 = runWithGenerationWork(async (completion) => {
      trackGenerationWork(async () => { await second.promise; throw new Error("settlement failed"); });
      await completion();
      done2();
    });
    second.resolve();
    await run2;
    expect(done2).toHaveBeenCalledOnce();
    expect(done1).not.toHaveBeenCalled();
    first.resolve();
    await run1;
    expect(done1).toHaveBeenCalledOnce();
  });
});

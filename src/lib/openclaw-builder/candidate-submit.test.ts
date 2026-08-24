import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createCandidateSubmitStore,
  type CandidateSubmitInput,
} from "./candidate-submit";

const OVERLAY_HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);

function input(overrides: Partial<CandidateSubmitInput> = {}): CandidateSubmitInput {
  return {
    jobId: "job-1",
    idempotencyKey: "idem-1",
    baseVersionId: "ver-1",
    baseFilesRevision: "rev-1",
    overlayHash: OVERLAY_HASH,
    jobStatus: "running",
    ...overrides,
  };
}

function expectedArtifactId(value: CandidateSubmitInput): string {
  return createHash("sha256")
    .update(`${value.jobId}\0${value.idempotencyKey}\0${value.overlayHash}`, "utf8")
    .digest("hex");
}

describe("createCandidateSubmitStore", () => {
  it("submits a first candidate as a non-persisted artifact", () => {
    const store = createCandidateSubmitStore();
    const first = input();
    const result = store.submit(first);

    expect(result).toEqual({
      ok: true,
      replayed: false,
      artifact: {
        artifactId: expectedArtifactId(first),
        jobId: "job-1",
        overlayHash: OVERLAY_HASH,
        persisted: false,
      },
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.artifact.persisted).toBe(false);
    expect(result.artifact.artifactId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("replays the same key, hash, and job/base with the same artifactId", () => {
    const store = createCandidateSubmitStore();
    const first = store.submit(input());
    const replay = store.submit(input());

    expect(first.ok).toBe(true);
    expect(replay).toEqual({
      ok: true,
      replayed: true,
      artifact: first.ok ? first.artifact : undefined,
    });
    if (!first.ok || !replay.ok) throw new Error("expected ok");
    expect(replay.artifact.artifactId).toBe(first.artifact.artifactId);
    expect(replay.artifact.persisted).toBe(false);
  });

  it("conflicts when the same key is reused with a different overlayHash or base", () => {
    const store = createCandidateSubmitStore();
    expect(store.submit(input()).ok).toBe(true);

    expect(store.submit(input({ overlayHash: OTHER_HASH }))).toEqual({
      ok: false,
      code: "idempotency_conflict",
    });
    expect(store.submit(input({ baseVersionId: "ver-2" }))).toEqual({
      ok: false,
      code: "idempotency_conflict",
    });
    expect(store.submit(input({ baseFilesRevision: "rev-2" }))).toEqual({
      ok: false,
      code: "idempotency_conflict",
    });
    expect(store.submit(input({ jobId: "job-2" }))).toEqual({
      ok: false,
      code: "idempotency_conflict",
    });
  });

  it("rejects cancelled, stale, expired, and other non-running jobs", () => {
    const store = createCandidateSubmitStore();

    expect(store.submit(input({ jobStatus: "cancelled" }))).toEqual({
      ok: false,
      code: "cancelled",
    });
    expect(store.submit(input({ jobStatus: "stale" }))).toEqual({
      ok: false,
      code: "stale",
    });
    expect(store.submit(input({ jobStatus: "expired" }))).toEqual({
      ok: false,
      code: "expired",
    });

    for (const jobStatus of ["pending", "completed", "failed", "superseded"] as const) {
      expect(store.submit(input({ jobStatus }))).toEqual({
        ok: false,
        code: "job_not_running",
      });
    }
  });

  it("rejects overlayHash values that are not 64 lowercase hex", () => {
    const store = createCandidateSubmitStore();

    expect(store.submit(input({ overlayHash: "A".repeat(64) }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(store.submit(input({ overlayHash: "not-a-hash" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(store.submit(input({ overlayHash: OVERLAY_HASH.slice(0, 63) }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(store.submit(input({ overlayHash: `${OVERLAY_HASH}ff` }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("rejects empty ids without writing an artifact", () => {
    const store = createCandidateSubmitStore();

    expect(store.submit(input({ jobId: "" }))).toEqual({ ok: false, code: "invalid_input" });
    expect(store.submit(input({ idempotencyKey: "" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(store.submit(input({ baseVersionId: "" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(store.submit(input({ baseFilesRevision: "" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(store.submit(null as unknown as CandidateSubmitInput)).toEqual({
      ok: false,
      code: "invalid_input",
    });

    const later = store.submit(input());
    expect(later.ok).toBe(true);
    if (!later.ok) throw new Error("expected ok");
    expect(later.replayed).toBe(false);
  });
});

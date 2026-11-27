// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sleep: vi.fn(),
  claimVideoGeneration: vi.fn(),
  getActiveVideoGenerationSchedule: vi.fn(),
  completeVideoGeneration: vi.fn(),
  deferVideoGeneration: vi.fn(),
  failVideoGeneration: vi.fn(),
  getRunwayVideoTask: vi.fn(),
  getVideoGenerationCredentials: vi.fn(),
  storeRunwayVideo: vi.fn(),
  submitRunwayVideo: vi.fn(),
  requireMediaUploadProject: vi.fn(),
  cleanupStoredRunwayVideo: vi.fn(),
}));

vi.mock("node:timers/promises", () => ({ setTimeout: mocks.sleep }));
vi.mock("./video-generation-store", () => ({
  claimVideoGeneration: mocks.claimVideoGeneration,
  getActiveVideoGenerationSchedule: mocks.getActiveVideoGenerationSchedule,
  completeVideoGeneration: mocks.completeVideoGeneration,
  deferVideoGeneration: mocks.deferVideoGeneration,
  failVideoGeneration: mocks.failVideoGeneration,
}));
vi.mock("./video-generation-provider", () => ({
  cleanupStoredRunwayVideo: mocks.cleanupStoredRunwayVideo,
  getRunwayVideoTask: mocks.getRunwayVideoTask,
  getVideoGenerationCredentials: mocks.getVideoGenerationCredentials,
  storeRunwayVideo: mocks.storeRunwayVideo,
  submitRunwayVideo: mocks.submitRunwayVideo,
  InvalidVideoOutputError: class extends Error {},
}));
vi.mock("@/lib/db/services/media", () => ({ requireMediaUploadProject: mocks.requireMediaUploadProject }));

import { advanceVideoGeneration, startVideoGenerationWorker } from "./video-generation-runner";
import { MediaUploadPolicyError } from "./upload-policy-error";

function claim(status: "pending" | "processing", taskId: string | null = null, pollFailures = 0) {
  return {
    job: {
      id: "job", status, user_id: "owner", project_id: "site",
      source_url: "https://owner.example/source.png", prompt: "Move",
      provider_task_id: taskId, created_at: new Date(), poll_failures: pollFailures,
    },
    leaseId: "lease",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getActiveVideoGenerationSchedule.mockResolvedValue(null);
  mocks.getVideoGenerationCredentials.mockReturnValue({ apiKey: "test-api", blobToken: "test-blob" });
  mocks.submitRunwayVideo.mockResolvedValue("runway-task");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("video generation worker", () => {
  it("submits only the claimed pending job and persists the same remote ID on retry", async () => {
    const pending = claim("pending");
    mocks.claimVideoGeneration.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);
    mocks.deferVideoGeneration.mockRejectedValueOnce(new Error("database write acknowledgement lost"));
    const results = await Promise.all([advanceVideoGeneration("job"), advanceVideoGeneration("job")]);
    expect(results.some((result) => result !== null && result >= 5_000)).toBe(true);
    expect(mocks.submitRunwayVideo).toHaveBeenCalledExactlyOnceWith("test-api", {
      prompt: "Move", sourceUrl: "https://owner.example/source.png",
    });
    expect(mocks.deferVideoGeneration.mock.calls).toEqual([
      [pending, expect.any(Number), { providerTaskId: "runway-task" }],
      [pending, expect.any(Number), { providerTaskId: "runway-task" }],
    ]);
  });

  it("starts and finishes background polling without an owner polling the job", async () => {
    const pending = claim("pending");
    const processing = claim("processing", "runway-task");
    const asset = { path: "owner/film.mp4", url: "https://blob.example/film.mp4", size: 123 };
    mocks.claimVideoGeneration
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(processing);
    mocks.getRunwayVideoTask
      .mockResolvedValueOnce({ status: "RUNNING" })
      .mockResolvedValueOnce({ status: "SUCCEEDED", output: ["https://short.example/out"] });
    mocks.storeRunwayVideo.mockResolvedValue(asset);

    await startVideoGenerationWorker("job");

    expect(mocks.claimVideoGeneration.mock.calls).toEqual([["job"], ["job"], ["job"]]);
    expect(mocks.submitRunwayVideo).toHaveBeenCalledTimes(1);
    expect(mocks.sleep).toHaveBeenCalledTimes(2);
    expect(mocks.sleep.mock.calls.every(([ms]) => ms >= 5_000)).toBe(true);
    expect(mocks.completeVideoGeneration).toHaveBeenCalledExactlyOnceWith(processing, asset);
  });

  it("keeps polling after a status request defers the job past the worker's wake-up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const pending = claim("pending");
    const processing = claim("processing", "runway-task");
    const asset = { path: "owner/film.mp4", url: "https://blob.example/film.mp4", size: 123 };
    let nextCheckAt = new Date();

    mocks.deferVideoGeneration.mockImplementation(async (_claim: unknown, delayMs: number) => {
      nextCheckAt = new Date(Date.now() + delayMs);
    });
    mocks.getActiveVideoGenerationSchedule.mockImplementationOnce(async () => ({
      nextCheckAt, leaseUntil: null,
    }));
    mocks.claimVideoGeneration
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(processing)
      .mockImplementationOnce(async () => {
        expect(nextCheckAt.getTime()).toBeGreaterThan(Date.now());
        return null;
      })
      .mockImplementationOnce(async () => {
        expect(nextCheckAt.getTime()).toBeLessThanOrEqual(Date.now());
        return processing;
      });
    mocks.getRunwayVideoTask
      .mockResolvedValueOnce({ status: "RUNNING" })
      .mockResolvedValueOnce({ status: "SUCCEEDED", output: ["https://short.example/out"] });
    mocks.storeRunwayVideo.mockResolvedValue(asset);
    mocks.sleep
      .mockImplementationOnce(async (ms: number) => {
        vi.setSystemTime(Date.now() + ms);
        // The authenticated status handler also advances one poll, then leaves.
        await advanceVideoGeneration("job");
      })
      .mockImplementation(async (ms: number) => {
        vi.setSystemTime(Date.now() + ms);
      });

    await startVideoGenerationWorker("job");

    expect(mocks.claimVideoGeneration).toHaveBeenCalledTimes(4);
    expect(mocks.sleep).toHaveBeenCalledTimes(2);
    expect(mocks.sleep.mock.calls.every(([ms]) => ms >= 5_000)).toBe(true);
    expect(mocks.submitRunwayVideo).toHaveBeenCalledTimes(1);
    expect(mocks.completeVideoGeneration).toHaveBeenCalledExactlyOnceWith(processing, asset);
  });

  it("briefly waits for a held lease and retries before that lease would expire", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const processing = claim("processing", "runway-task");
    const now = Date.now();
    mocks.claimVideoGeneration.mockResolvedValueOnce(null).mockResolvedValueOnce(processing);
    mocks.getActiveVideoGenerationSchedule.mockResolvedValueOnce({
      nextCheckAt: new Date(now - 1_000),
      leaseUntil: new Date(now + 90_000),
    });
    mocks.getRunwayVideoTask.mockResolvedValue({ status: "CANCELED" });

    await startVideoGenerationWorker("job");

    expect(mocks.sleep).toHaveBeenCalledExactlyOnceWith(5_100);
    expect(mocks.failVideoGeneration).toHaveBeenCalledExactlyOnceWith(processing, expect.any(String));
    expect(mocks.submitRunwayVideo).not.toHaveBeenCalled();
  });

  it("stops for a missing or terminal job or when its next poll is outside the window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mocks.claimVideoGeneration.mockResolvedValue(null);

    await startVideoGenerationWorker("terminal");
    mocks.getActiveVideoGenerationSchedule.mockResolvedValueOnce({
      nextCheckAt: new Date(Date.now() + 239_950),
      leaseUntil: null,
    });
    await startVideoGenerationWorker("later");

    expect(mocks.claimVideoGeneration.mock.calls).toEqual([["terminal"], ["later"]]);
    expect(mocks.sleep).not.toHaveBeenCalled();
    expect(mocks.getRunwayVideoTask).not.toHaveBeenCalled();
  });

  it("refunds an expired submit lease without starting a replacement remote task", async () => {
    const ambiguous = claim("processing");
    mocks.claimVideoGeneration.mockResolvedValue(ambiguous);
    await expect(advanceVideoGeneration("job")).resolves.toBeNull();
    expect(mocks.failVideoGeneration).toHaveBeenCalledExactlyOnceWith(ambiguous, expect.stringContaining("återförts"));
    expect(mocks.submitRunwayVideo).not.toHaveBeenCalled();
  });

  it("recovers a known task by checking status then saving the stored video", async () => {
    const known = claim("processing", "runway-task");
    const asset = { path: "owner/film.mp4", url: "https://blob.example/film.mp4", size: 123 };
    mocks.claimVideoGeneration.mockResolvedValue(known);
    mocks.getRunwayVideoTask.mockResolvedValue({ status: "SUCCEEDED", output: ["https://short.example/out"] });
    mocks.storeRunwayVideo.mockResolvedValue(asset);

    await expect(advanceVideoGeneration("job")).resolves.toBeNull();
    expect(mocks.getRunwayVideoTask).toHaveBeenCalledExactlyOnceWith("test-api", "runway-task");
    expect(mocks.storeRunwayVideo).toHaveBeenCalledWith("test-blob", "https://short.example/out", {
      id: "job", userId: "owner", projectId: "site",
    });
    expect(mocks.completeVideoGeneration).toHaveBeenCalledExactlyOnceWith(known, asset);
    expect(mocks.submitRunwayVideo).not.toHaveBeenCalled();
  });

  it("keeps the uploaded Blob when the database outcome is unknown and retries the same result", async () => {
    const known = claim("processing", "runway-task");
    mocks.claimVideoGeneration.mockResolvedValue(known);
    mocks.getRunwayVideoTask.mockResolvedValue({ status: "SUCCEEDED", output: ["https://short.example/out"] });
    mocks.storeRunwayVideo.mockResolvedValue({ url: "https://blob.example/film.mp4" });
    mocks.completeVideoGeneration.mockRejectedValueOnce(new Error("DB acknowledgement lost"))
      .mockResolvedValueOnce(true);
    const wait = await advanceVideoGeneration("job");
    expect(wait).toBeGreaterThanOrEqual(10_000);
    expect(mocks.deferVideoGeneration).toHaveBeenCalledWith(known, wait, { retry: true });
    expect(mocks.cleanupStoredRunwayVideo).not.toHaveBeenCalled();
    await expect(advanceVideoGeneration("job")).resolves.toBeNull();
    expect(mocks.storeRunwayVideo.mock.calls[0]).toEqual(mocks.storeRunwayVideo.mock.calls[1]);
    expect(mocks.submitRunwayVideo).not.toHaveBeenCalled();
  });

  it("cleans the exact stored project Blob after a terminal owned-site rejection", async () => {
    const known = claim("processing", "runway-task");
    mocks.claimVideoGeneration.mockResolvedValue(known);
    mocks.getRunwayVideoTask.mockResolvedValue({ status: "SUCCEEDED", output: ["https://short.example/out"] });
    mocks.storeRunwayVideo.mockResolvedValue({ url: "https://blob.example/film.mp4" });
    mocks.completeVideoGeneration.mockRejectedValue(new MediaUploadPolicyError("Sajten hittades inte.", 404));
    mocks.failVideoGeneration.mockResolvedValue(true);
    await expect(advanceVideoGeneration("job")).resolves.toBeNull();
    expect(mocks.failVideoGeneration).toHaveBeenCalledExactlyOnceWith(known, expect.stringContaining("återförts"));
    expect(mocks.cleanupStoredRunwayVideo).toHaveBeenCalledExactlyOnceWith({
      id: "job", userId: "owner", projectId: "site",
    });
  });

  it("backs off if checking a known task fails and reserves the order for recovery", async () => {
    const known = claim("processing", "runway-task", 2);
    mocks.claimVideoGeneration.mockResolvedValue(known);
    mocks.getRunwayVideoTask.mockRejectedValue(new Error("temporary provider hiccup"));
    const wait = await advanceVideoGeneration("job");
    expect(wait).toBeGreaterThanOrEqual(40_000);
    expect(mocks.deferVideoGeneration).toHaveBeenCalledExactlyOnceWith(known, wait, { retry: true });
    expect(mocks.failVideoGeneration).not.toHaveBeenCalled();
    expect(mocks.submitRunwayVideo).not.toHaveBeenCalled();
  });
});

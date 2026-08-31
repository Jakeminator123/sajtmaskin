import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS,
  waitForProductPostcheckPreviewRunning,
  type ProductPostcheckPreviewProbe,
} from "./product-postcheck-preview-wait";

function probe(
  overrides: Partial<ProductPostcheckPreviewProbe> = {},
): ProductPostcheckPreviewProbe {
  return {
    running: false,
    versionId: "v1",
    filesRevision: "rev_1",
    previewSessionId: "ps_1",
    lifecycleToken: "life_1",
    previewUrl: "https://preview.example/v1",
    readinessState: "starting",
    ...overrides,
  };
}

describe("waitForProductPostcheckPreviewRunning", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately when the first probe is already running for the version", async () => {
    const read = vi.fn(async () => probe({ running: true, readinessState: "ready" }));
    const sleep = vi.fn(async () => undefined);

    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      probe: read,
      sleep,
    });

    expect(result).toEqual({
      ok: true,
      probe: expect.objectContaining({ running: true, versionId: "v1" }),
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries until running for the expected versionId (fake timers)", async () => {
    vi.useFakeTimers();
    const reads: ProductPostcheckPreviewProbe[] = [
      probe({ running: false, readinessState: "starting" }),
      probe({ running: false, readinessState: "starting" }),
      probe({ running: true, readinessState: "ready" }),
    ];
    let index = 0;
    const pending = waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      timeoutMs: 30_000,
      pollIntervalMs: PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS,
      probe: async () => reads[Math.min(index++, reads.length - 1)]!,
    });

    await vi.advanceTimersByTimeAsync(PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS * 2);
    const result = await pending;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.probe.running).toBe(true);
      expect(result.probe.versionId).toBe("v1");
    }
    expect(index).toBe(3);
  });

  it("skips with preview_not_running when the budget ends before running", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const pending = waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      timeoutMs: PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS * 2,
      pollIntervalMs: PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS,
      probe: async () => {
        calls += 1;
        return probe({ running: false, readinessState: "starting" });
      },
    });

    await vi.advanceTimersByTimeAsync(PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS * 2);
    const result = await pending;

    expect(result).toEqual({
      ok: false,
      reason: "preview_not_running",
      lastProbe: expect.objectContaining({ running: false, versionId: "v1" }),
    });
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("treats a session bound to another version as superseded without waiting", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      probe: async () => probe({ versionId: "v2", running: true }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_superseded",
      lastProbe: expect.objectContaining({ versionId: "v2" }),
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("keeps waiting when the same version is still on the previous filesRevision", async () => {
    vi.useFakeTimers();
    const reads: ProductPostcheckPreviewProbe[] = [
      probe({ running: false, filesRevision: "rev_0" }),
      probe({ running: true, filesRevision: "rev_1" }),
    ];
    let index = 0;
    const pending = waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      timeoutMs: 30_000,
      pollIntervalMs: PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS,
      probe: async () => reads[Math.min(index++, reads.length - 1)]!,
    });

    await vi.advanceTimersByTimeAsync(PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS);
    const result = await pending;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.probe.filesRevision).toBe("rev_1");
    }
  });
});

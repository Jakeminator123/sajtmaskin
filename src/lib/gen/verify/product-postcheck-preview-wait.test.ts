import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPreviewHostReadinessVerdict } from "@/lib/gen/preview/preview-host-client";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";
import {
  PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS,
  PRODUCT_POSTCHECK_PREVIEW_WAIT_MS,
  productPostcheckPreviewWaitBudgetMs,
  readProductPostcheckPreviewProbe,
  waitForProductPostcheckPreviewRunning,
  type ProductPostcheckPreviewProbe,
} from "./product-postcheck-preview-wait";

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  fetchPreviewHostReadinessVerdict: vi.fn(),
}));
vi.mock("@/lib/gen/preview/session-store", () => ({
  getActivePreviewSessionAsync: vi.fn(),
}));

function probe(
  overrides: Partial<ProductPostcheckPreviewProbe> = {},
): ProductPostcheckPreviewProbe {
  return {
    running: false,
    versionId: "v1",
    filesRevision: "rev_1",
    previewSessionId: "ps_1",
    lifecycleToken: "life_1",
    mutationRevision: 1,
    previewUrl: "https://preview.example/v1",
    readinessState: "starting",
    httpReady: null,
    ...overrides,
  };
}

function readyProbe(
  overrides: Partial<ProductPostcheckPreviewProbe> = {},
): ProductPostcheckPreviewProbe {
  return probe({
    running: true,
    readinessState: "ready",
    httpReady: true,
    ...overrides,
  });
}

describe("waitForProductPostcheckPreviewRunning", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately when the first probe matches the full tuple", async () => {
    const read = vi.fn(async () => readyProbe());
    const sleep = vi.fn(async () => undefined);

    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      expectedPreviewSessionId: "ps_1",
      expectedLifecycleToken: "life_1",
      expectedMutationRevision: 1,
      probe: read,
      sleep,
    });

    expect(result).toEqual({
      ok: true,
      probe: expect.objectContaining({
        running: true,
        versionId: "v1",
        filesRevision: "rev_1",
        previewSessionId: "ps_1",
        lifecycleToken: "life_1",
        mutationRevision: 1,
        readinessState: "ready",
        httpReady: true,
      }),
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries until the full tuple is ready (fake timers)", async () => {
    vi.useFakeTimers();
    const reads: ProductPostcheckPreviewProbe[] = [
      probe({ running: false, readinessState: "starting", httpReady: false }),
      probe({ running: true, readinessState: "starting", httpReady: false }),
      readyProbe(),
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
      expect(result.probe.httpReady).toBe(true);
      expect(result.probe.readinessState).toBe("ready");
    }
    expect(index).toBe(3);
  });

  it("L7 (a): running:true but httpReady:false stays pending without preview_not_running", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      timeoutMs: 0,
      probe: async () =>
        probe({ running: true, readinessState: "ready", httpReady: false }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_not_ready",
      lastProbe: expect.objectContaining({
        running: true,
        readinessState: "ready",
        httpReady: false,
      }),
    });
    expect(result.ok === false && result.reason).not.toBe("preview_not_running");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("L7 (b): readinessState starting stays pending", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      timeoutMs: 0,
      probe: async () =>
        probe({ running: true, readinessState: "starting", httpReady: false }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_not_ready",
      lastProbe: expect.objectContaining({
        running: true,
        readinessState: "starting",
      }),
    });
  });

  it("L7 (c): right version but wrong filesRevision is superseded, not attested pending", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      timeoutMs: 30_000,
      probe: async () => readyProbe({ filesRevision: "rev_0" }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_superseded",
      lastProbe: expect.objectContaining({ versionId: "v1", filesRevision: "rev_0" }),
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("L7 (d): timeout is pending without preview_not_running", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const pending = waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      timeoutMs: PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS * 2,
      pollIntervalMs: PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS,
      probe: async () => {
        calls += 1;
        return probe({ running: true, readinessState: "starting", httpReady: false });
      },
    });

    await vi.advanceTimersByTimeAsync(PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS * 2);
    const result = await pending;

    expect(result).toEqual({
      ok: false,
      reason: "preview_not_ready",
      lastProbe: expect.objectContaining({ running: true, versionId: "v1" }),
    });
    expect(result.ok === false && result.reason).not.toBe("preview_not_running");
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("does not treat a missing probe filesRevision as ready", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      timeoutMs: 0,
      probe: async () => readyProbe({ filesRevision: null }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_not_ready",
      lastProbe: expect.objectContaining({ filesRevision: null, running: true }),
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("treats a session bound to another version as superseded without waiting", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      probe: async () => readyProbe({ versionId: "v2" }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_superseded",
      lastProbe: expect.objectContaining({ versionId: "v2" }),
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("supersedes when the preview session rotates", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      expectedPreviewSessionId: "ps_1",
      probe: async () => readyProbe({ previewSessionId: "ps_other" }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_superseded",
      lastProbe: expect.objectContaining({ previewSessionId: "ps_other" }),
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("supersedes when the lifecycle token rotates", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      expectedLifecycleToken: "life_1",
      probe: async () => readyProbe({ lifecycleToken: "life_other" }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_superseded",
      lastProbe: expect.objectContaining({ lifecycleToken: "life_other" }),
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("supersedes when a supplied mutationRevision differs", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      expectedMutationRevision: 2,
      probe: async () => readyProbe({ mutationRevision: 1 }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_superseded",
      lastProbe: expect.objectContaining({ mutationRevision: 1 }),
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not require mutationRevision when the caller omitted the expectation", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      probe: async () => readyProbe({ mutationRevision: 9 }),
      sleep,
    });

    expect(result.ok).toBe(true);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("requires mutationRevision when the caller supplied one and the probe has it", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      expectedMutationRevision: 4,
      probe: async () => readyProbe({ mutationRevision: 4 }),
      sleep,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.probe.mutationRevision).toBe(4);
  });

  it("aborts immediately when readinessState is failed — still pending, not attested", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      probe: async () => probe({ running: false, readinessState: "failed" }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_not_ready",
      lastProbe: expect.objectContaining({ readinessState: "failed" }),
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not treat a legacy host that omitted readinessState/httpReady as ready", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await waitForProductPostcheckPreviewRunning({
      expectedVersionId: "v1",
      expectedFilesRevision: "rev_1",
      timeoutMs: 0,
      probe: async () =>
        probe({ running: true, readinessState: null, httpReady: null }),
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      reason: "preview_not_ready",
      lastProbe: expect.objectContaining({
        running: true,
        readinessState: null,
        httpReady: null,
      }),
    });
  });

  it("reserves capture and live-review time inside the route budget", () => {
    expect(
      productPostcheckPreviewWaitBudgetMs({ liveReviewReserveMs: 90_000 }),
    ).toBeLessThan(PRODUCT_POSTCHECK_PREVIEW_WAIT_MS);
    expect(productPostcheckPreviewWaitBudgetMs({ liveReviewReserveMs: 90_000 })).toBe(145_000);
    expect(productPostcheckPreviewWaitBudgetMs({ liveReviewReserveMs: 0 })).toBe(150_000);
  });
});

/**
 * Injected-probe tests cannot catch the reader dropping the host traffic
 * gate. If `httpReady` is not copied from the verdict, `readinessState:
 * "ready"` alone used to count as ready and the stale-HTML hole reopened.
 */
describe("readProductPostcheckPreviewProbe", () => {
  function mockHost(verdict: Record<string, unknown>) {
    vi.mocked(getActivePreviewSessionAsync).mockResolvedValue({
      versionId: "v1",
      previewSessionId: "ps_1",
      lifecycleToken: "life_1",
      mutationRevision: 1,
      filesRevision: "rev_1",
      previewUrl: "https://preview.example/v1",
    } as never);
    vi.mocked(fetchPreviewHostReadinessVerdict).mockResolvedValue(verdict as never);
  }

  async function waitOnRealProbe(expected: {
    expectedFilesRevision?: string;
    expectedMutationRevision?: number;
  } = {}) {
    const read = await readProductPostcheckPreviewProbe({
      chatId: "chat-1",
      expectedVersionId: "v1",
    });
    return {
      read,
      result: await waitForProductPostcheckPreviewRunning({
        expectedVersionId: "v1",
        expectedFilesRevision: expected.expectedFilesRevision ?? "rev_1",
        expectedPreviewSessionId: "ps_1",
        expectedLifecycleToken: "life_1",
        ...(expected.expectedMutationRevision != null
          ? { expectedMutationRevision: expected.expectedMutationRevision }
          : {}),
        probe: async () => read,
        sleep: async () => undefined,
        timeoutMs: 0,
      }),
    };
  }

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("carries httpReady: false so a host still gating traffic is not ready", async () => {
    mockHost({
      running: true,
      versionId: "v1",
      readinessState: "ready",
      httpReady: false,
      lifecycleToken: "life_1",
      mutationRevision: 1,
    });

    const { read, result } = await waitOnRealProbe();

    expect(read.httpReady).toBe(false);
    expect(read.readinessState).toBe("ready");
    expect(read.mutationRevision).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("preview_not_ready");
  });

  it("carries httpReady: true so a genuinely ready host is accepted", async () => {
    mockHost({
      running: true,
      versionId: "v1",
      readinessState: "ready",
      httpReady: true,
      lifecycleToken: "life_1",
      mutationRevision: 1,
    });

    const { read, result } = await waitOnRealProbe({ expectedMutationRevision: 1 });

    expect(read.httpReady).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("L7 (c) via the real reader: session filesRevision drift is superseded", async () => {
    vi.mocked(getActivePreviewSessionAsync).mockResolvedValue({
      versionId: "v1",
      previewSessionId: "ps_1",
      lifecycleToken: "life_1",
      mutationRevision: 1,
      filesRevision: "rev_stale",
      previewUrl: "https://preview.example/v1",
    } as never);
    vi.mocked(fetchPreviewHostReadinessVerdict).mockResolvedValue({
      running: true,
      versionId: "v1",
      readinessState: "ready",
      httpReady: true,
      lifecycleToken: "life_1",
      mutationRevision: 1,
    } as never);

    const { read, result } = await waitOnRealProbe({ expectedFilesRevision: "rev_1" });

    expect(read.filesRevision).toBe("rev_stale");
    expect(read.httpReady).toBe(true);
    expect(result).toEqual({
      ok: false,
      reason: "preview_superseded",
      lastProbe: expect.objectContaining({ filesRevision: "rev_stale" }),
    });
  });
});

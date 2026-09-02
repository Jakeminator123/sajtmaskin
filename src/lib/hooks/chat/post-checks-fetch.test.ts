/**
 * `triggerImageMaterialization` is on the serialized generation tail (it
 * writes `files_json`). Its timeout is load-bearing: the abort is forwarded
 * so the route can skip persist, and `replaced` without `persisted` is
 * retried until the cap then reported as retryable.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IMAGE_MATERIALIZATION_TIMEOUT_MS,
  canProceedToPostcheckAfterMaterialization,
  triggerImageMaterialization,
} from "./post-checks-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("triggerImageMaterialization", () => {
  it("gives up after the cap and degrades to timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );

    const pending = triggerImageMaterialization({
      chatId: "chat_1",
      versionId: "ver_1",
      enabled: true,
    });
    await vi.advanceTimersByTimeAsync(IMAGE_MATERIALIZATION_TIMEOUT_MS + 10);

    expect(await pending).toMatchObject({
      attempted: true,
      persisted: false,
      error: "timeout",
    });
  });

  it("aborts immediately when the caller's signal is already aborted", async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await triggerImageMaterialization({
      chatId: "chat_1",
      versionId: "ver_1",
      enabled: true,
      signal: AbortSignal.abort(),
    });

    expect(result).toMatchObject({ attempted: true, persisted: false, error: "aborted" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries replaced-without-persisted until a durable revision lands", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            imageMaterialization: {
              attempted: true,
              strategy: "blob",
              replaced: 2,
              uploaded: 2,
              skipped: 0,
              warningCount: 0,
              persisted: false,
              filesRevision: "rev_old",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            imageMaterialization: {
              attempted: true,
              strategy: "blob",
              replaced: 2,
              uploaded: 2,
              skipped: 0,
              warningCount: 0,
              persisted: true,
              filesRevision: "rev_new",
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const pending = triggerImageMaterialization({
      chatId: "chat_1",
      versionId: "ver_1",
      enabled: true,
    });
    await vi.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toMatchObject({
      replaced: 2,
      persisted: true,
      filesRevision: "rev_new",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the payload untouched on a healthy no-op response", async () => {
    const status = {
      attempted: true,
      strategy: "blob",
      replaced: 0,
      uploaded: 0,
      skipped: 0,
      warningCount: 0,
      persisted: true,
      filesRevision: "rev_n",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ imageMaterialization: status }))),
    );

    await expect(
      triggerImageMaterialization({ chatId: "chat_1", versionId: "ver_1", enabled: true }),
    ).resolves.toMatchObject(status);
  });

  it("does not call the network when materialization is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      triggerImageMaterialization({ chatId: "chat_1", versionId: "ver_1", enabled: false }),
    ).resolves.toMatchObject({ attempted: false, reason: "disabled", persisted: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("canProceedToPostcheckAfterMaterialization", () => {
  it("blocks replaced without persisted", () => {
    expect(
      canProceedToPostcheckAfterMaterialization(
        {
          attempted: true,
          strategy: "blob",
          replaced: 1,
          uploaded: 1,
          skipped: 0,
          warningCount: 0,
          persisted: false,
          filesRevision: "rev_old",
        },
        true,
      ),
    ).toBe(false);
  });

  it("blocks timeout", () => {
    expect(
      canProceedToPostcheckAfterMaterialization(
        {
          attempted: true,
          strategy: "blob",
          replaced: 0,
          uploaded: 0,
          skipped: 0,
          warningCount: 0,
          persisted: false,
          error: "timeout",
        },
        true,
      ),
    ).toBe(false);
  });
});

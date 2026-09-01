/**
 * `triggerImageMaterialization` moved from a parallel `void` call to the head
 * of the serialized generation tail (it writes `files_json`, so it must not
 * race Product Postcheck's revision). That makes its timeout load-bearing:
 * without a cap a hung `/files?materialize=1` stalls the whole tail and the
 * postcheck never runs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IMAGE_MATERIALIZATION_TIMEOUT_MS,
  triggerImageMaterialization,
} from "./post-checks-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("triggerImageMaterialization", () => {
  it("gives up after the cap and degrades to network_error", async () => {
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

    expect(await pending).toMatchObject({ attempted: true, error: "network_error" });
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

    // `addEventListener` never fires for an already-aborted signal, so this
    // would otherwise hang for the full cap.
    const result = await triggerImageMaterialization({
      chatId: "chat_1",
      versionId: "ver_1",
      enabled: true,
      signal: AbortSignal.abort(),
    });

    expect(result).toMatchObject({ attempted: true, error: "network_error" });
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("returns the payload untouched on a healthy response", async () => {
    const status = {
      attempted: true,
      strategy: "blob",
      replaced: 2,
      uploaded: 2,
      skipped: 0,
      warningCount: 0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ imageMaterialization: status }))),
    );

    await expect(
      triggerImageMaterialization({ chatId: "chat_1", versionId: "ver_1", enabled: true }),
    ).resolves.toEqual(status);
  });

  it("does not call the network when materialization is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      triggerImageMaterialization({ chatId: "chat_1", versionId: "ver_1", enabled: false }),
    ).resolves.toMatchObject({ attempted: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

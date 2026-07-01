import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VersionStatus } from "@/lib/logging/event-bus-types";
import { useVersionStatus } from "./useVersionStatus";

/**
 * Finding A (område 6-3) regression coverage for {@link useVersionStatus}.
 *
 * The hook must NOT stop polling on the first `done: true` projection,
 * because the client product-postcheck flow runs after finalize and can
 * emit a *late* `version.degraded` event. It should keep polling until the
 * projection is STABLE (`done` + an unchanged `eventCount`) so that late
 * degradation is observed before polling ends — otherwise the preview
 * panel renders a degraded version as solid green (a false-green).
 */

const POLL = 1_000;

function vs(overrides: Partial<VersionStatus>): VersionStatus {
  return {
    runId: "root",
    phase: "done",
    previewBlocked: false,
    verificationBlocked: false,
    repairPassIndex: 0,
    lastBuildError: null,
    eventCount: 0,
    done: false,
    verifierOutcome: null,
    degradations: [],
    ...overrides,
  };
}

/**
 * Mocked `fetch` returning a fixed sequence of `version-status` payloads.
 * The last entry is repeated for any further polls — so a "stable" tail
 * (same `eventCount` twice) falls out naturally from a 1-element clamp.
 */
function sequenceFetch(statuses: VersionStatus[]) {
  let i = 0;
  return vi.fn(async () => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i += 1;
    return {
      ok: true,
      json: async () => ({ ok: true, versionId: "v1", status }),
    } as unknown as Response;
  });
}

/** Drain the promise microtask queue so the initial (timer-less) fetch settles. */
async function flushMicrotasks() {
  for (let n = 0; n < 10; n += 1) {
    await Promise.resolve();
  }
}

function renderStatus(pollIntervalMs = POLL) {
  return renderHook(() =>
    useVersionStatus({ chatId: "c1", versionId: "v1", pollIntervalMs }),
  );
}

describe("useVersionStatus — Finding A (poll until stable)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps polling past a green done and surfaces a late degradation", async () => {
    const greenN = vs({ done: true, verifierOutcome: "passed", eventCount: 5, degradations: [] });
    const degradedN1 = vs({
      done: true,
      verifierOutcome: "passed",
      eventCount: 6,
      degradations: [{ kind: "product_postcheck_skipped", message: "F2 Product Postcheck skipped." }],
    });
    // [green N] -> [degraded N+1] -> [degraded N+1] (clamped tail = stable)
    const fetchMock = sequenceFetch([greenN, degradedN1, degradedN1]);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderStatus();

    // Initial fetch: green, no degradation yet — but polling must continue.
    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status?.done).toBe(true);
    expect(result.current.status?.degradations).toEqual([]);

    // First poll: the late degradation lands. Proves polling did NOT stop
    // after the first green fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status?.degradations.length).toBeGreaterThan(0);
    expect(result.current.status?.degradations[0]?.kind).toBe("product_postcheck_skipped");

    // Second poll: eventCount unchanged → stable → polling stops here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // No further polling once stable, and the degraded status sticks.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL * 5);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.status?.degradations.length).toBeGreaterThan(0);
  });

  it("stops after a stable confirmation for a genuinely green version", async () => {
    const green = vs({ done: true, verifierOutcome: "passed", eventCount: 4, degradations: [] });
    const fetchMock = sequenceFetch([green, green]);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderStatus();

    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // One confirmation poll: same eventCount → stable → stop.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // No infinite polling.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL * 5);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status?.done).toBe(true);
    expect(result.current.status?.degradations).toEqual([]);
  });

  it("hard-stops immediately on a failed projection (no grace polls)", async () => {
    const failed = vs({
      phase: "failed",
      done: false,
      verifierOutcome: "failed",
      eventCount: 3,
      verificationBlocked: true,
      lastBuildError: { stage: "verify", message: "verifier failed" },
    });
    const fetchMock = sequenceFetch([failed]);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderStatus();

    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status?.phase).toBe("failed");

    // A failed version must never be grace-polled — no further fetches.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL * 10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops at the safety cap when eventCount never settles", async () => {
    let counter = 10;
    // `done` stays true but eventCount keeps changing every poll.
    const fetchMock = vi.fn(async () => {
      const status = vs({
        done: true,
        verifierOutcome: "passed",
        eventCount: counter,
        degradations: [{ kind: "product_postcheck_skipped", message: "flapping" }],
      });
      counter += 1;
      return {
        ok: true,
        json: async () => ({ ok: true, versionId: "v1", status }),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    renderStatus();

    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Even though eventCount keeps moving, polling must terminate at the
    // MAX_DONE_CONFIRM_POLLS safety cap (5) rather than run forever.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL * 20);
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // Confirm it really stopped (no more fetches after the cap).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL * 20);
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

/**
 * Område 6-3 punkt 1 — deterministic post-check completion → refetch.
 *
 * Poll-until-stable (above) is a cheap *secondary* guard. The *primary*
 * guarantee is now deterministic: when the client post-check flow finishes,
 * `runPostGenerationChecks` fires `onComplete`, which bumps the hook's
 * `refreshNonce`. Because `/product-postcheck` emits any late
 * `version.degraded` *before* it returns (and the client awaits that
 * response), the nonce-driven refetch is guaranteed to read the final,
 * possibly-degraded projection — even if poll-until-stable already stopped.
 */
describe("useVersionStatus — deterministic post-check refetch (område 6-3 punkt 1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refetches on a refreshNonce bump and surfaces a degradation that landed after polling stopped", async () => {
    const greenN = vs({ done: true, verifierOutcome: "passed", eventCount: 5, degradations: [] });
    const degradedN1 = vs({
      done: true,
      verifierOutcome: "passed",
      eventCount: 6,
      degradations: [
        { kind: "product_postcheck_skipped", message: "F2 Product Postcheck skipped." },
      ],
    });
    // nonce 0: [green, green] → stabilizes & stops with NO degradation. The
    // post-check then finishes, `/product-postcheck` emits the late
    // degradation, and the bumped nonce makes the next fetch read it.
    const fetchMock = sequenceFetch([greenN, greenN, degradedN1, degradedN1]);
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ nonce }: { nonce: number }) =>
        useVersionStatus({
          chatId: "c1",
          versionId: "v1",
          pollIntervalMs: POLL,
          refreshNonce: nonce,
        }),
      { initialProps: { nonce: 0 } },
    );

    // Initial fetch: green, no degradation.
    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status?.degradations).toEqual([]);

    // One confirmation poll: same eventCount → stable → polling stops.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Heuristic has stopped; the late degradation is NOT visible yet. This is
    // exactly the window the deterministic refetch closes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL * 5);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status?.degradations).toEqual([]);

    // Post-check completes → onComplete bumps the nonce → guaranteed refetch.
    await act(async () => {
      rerender({ nonce: 1 });
      await flushMicrotasks();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.status?.degradations.length).toBeGreaterThan(0);
    expect(result.current.status?.degradations[0]?.kind).toBe("product_postcheck_skipped");
  });
});

/**
 * Perpetual-spinner backstop (fix/verify-status-single-source).
 *
 * The builder spinner reads the bus projection; a background verify job that
 * dies without a terminal event would otherwise leave `useVersionStatus`
 * polling a non-terminal phase forever. The server-side stale watchdog settles
 * such a row to `failed` first, but as an ultimate client net the hook stops
 * polling after `maxNonTerminalMs` and surfaces a timeout instead of spinning /
 * churning network forever.
 */
describe("useVersionStatus — perpetual-spinner client backstop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stops polling and surfaces a timeout when the projection never becomes terminal", async () => {
    const spinning = vs({ phase: "verifying", done: false, verifierOutcome: null, eventCount: 1 });
    const fetchMock = sequenceFetch([spinning]); // clamped tail = always spinning
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useVersionStatus({
        chatId: "c1",
        versionId: "v1",
        pollIntervalMs: POLL,
        maxNonTerminalMs: 2_500,
      }),
    );

    // Initial fetch at t0 starts the non-terminal window.
    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();

    // Polls at t=1000 and t=2000 are still within the 2500ms cap.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL * 2);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBeNull();

    // Poll at t=3000 exceeds the cap → stop polling + surface the timeout.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.error).toBe("verification_status_timeout");

    // No further polling after the cap trips.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL * 10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("never trips the cap once the projection reaches a terminal phase", async () => {
    const failed = vs({ phase: "failed", done: false, verifierOutcome: "failed", eventCount: 2 });
    const fetchMock = sequenceFetch([failed]);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useVersionStatus({
        chatId: "c1",
        versionId: "v1",
        pollIntervalMs: POLL,
        maxNonTerminalMs: 1_000,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // `failed` hard-stops immediately; the cap is irrelevant and no error is set.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL * 5);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.status?.phase).toBe("failed");
  });
});

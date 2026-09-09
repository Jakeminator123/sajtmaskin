import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FRESH_VERSION_GRACE_MS,
  isPendingCreatedVersionFresh,
  markPendingCreatedVersion,
  useBuilderVersionSelectionSync,
  type PendingCreatedVersion,
} from "./useBuilderVersionSelectionSync";

type HookParams = Parameters<typeof useBuilderVersionSelectionSync>[0];

function makeParams(overrides: Partial<HookParams> = {}): HookParams {
  return {
    chatId: "chat_1",
    chatIdParam: "chat_1",
    chatExternalProjectId: null,
    entryIntentActive: false,
    externalProjectId: null,
    hasEntryParams: false,
    isIntentionalReset: false,
    selectedVersionId: null,
    versionIdSet: new Set<string>(),
    pendingCreatedVersionRef: { current: null },
    router: { replace: vi.fn() },
    setChatId: vi.fn(),
    setExternalProjectId: vi.fn(),
    setIsIntentionalReset: vi.fn(),
    setSelectedVersionId: vi.fn(),
    ...overrides,
  };
}

describe("markPendingCreatedVersion / isPendingCreatedVersionFresh", () => {
  it("records a trimmed id with the given timestamp", () => {
    const ref: { current: PendingCreatedVersion | null } = { current: null };
    markPendingCreatedVersion(ref, "  ver_3  ", 1_000);
    expect(ref.current).toEqual({ id: "ver_3", ts: 1_000 });
  });

  it("ignores missing refs and empty ids", () => {
    const ref: { current: PendingCreatedVersion | null } = { current: null };
    markPendingCreatedVersion(undefined, "ver_3");
    markPendingCreatedVersion(ref, "   ");
    markPendingCreatedVersion(ref, null);
    expect(ref.current).toBeNull();
  });

  it("is fresh only for the same id inside the grace window", () => {
    const pending = { id: "ver_3", ts: 10_000 };
    expect(isPendingCreatedVersionFresh(pending, "ver_3", 10_000 + FRESH_VERSION_GRACE_MS - 1)).toBe(true);
    expect(isPendingCreatedVersionFresh(pending, "ver_3", 10_000 + FRESH_VERSION_GRACE_MS)).toBe(false);
    expect(isPendingCreatedVersionFresh(pending, "ver_2", 10_001)).toBe(false);
    expect(isPendingCreatedVersionFresh(null, "ver_3", 10_001)).toBe(false);
  });
});

// Prod 2026-09-08 (chat 4a2aa301): generation `done` selected v3 before the
// `/versions` refetch contained it; the guard cleared the selection and
// `activeVersionId` fell back to the stale latest for ~1 s (v3 → v2 → v3).
//
// The hook also resets a NON-fresh selection once on mount (chat-change
// effect), so for stale ids the guard's own clear is the SECOND
// `setSelectedVersionId(null)` call. A grace-marked id is not reset on mount.
const MOUNT_RESET_CALLS = 1;

describe("useBuilderVersionSelectionSync — fresh-version guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T20:54:52Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears a selection the versions list does not know and nothing marked as fresh", () => {
    const setSelectedVersionId = vi.fn();
    renderHook(() =>
      useBuilderVersionSelectionSync(
        makeParams({
          selectedVersionId: "ver_deleted",
          versionIdSet: new Set(["ver_1", "ver_2"]),
          setSelectedVersionId,
        }),
      ),
    );
    expect(setSelectedVersionId).toHaveBeenCalledTimes(MOUNT_RESET_CALLS + 1);
    expect(setSelectedVersionId).toHaveBeenLastCalledWith(null);
  });

  it("keeps a freshly created selection while the /versions refetch is in flight", () => {
    const setSelectedVersionId = vi.fn();
    const pendingCreatedVersionRef: { current: PendingCreatedVersion | null } = { current: null };
    markPendingCreatedVersion(pendingCreatedVersionRef, "ver_3");

    // Same render as `setSelectedVersionId(v3)` in handleGenerationComplete:
    // the list still only has v1/v2. Setters are stable across the rerender
    // (as in the real controller) so the chat-change reset runs once.
    const initialProps = makeParams({
      selectedVersionId: "ver_3",
      versionIdSet: new Set(["ver_1", "ver_2"]),
      pendingCreatedVersionRef,
      setSelectedVersionId,
    });
    const { rerender } = renderHook(
      (params: HookParams) => useBuilderVersionSelectionSync(params),
      { initialProps },
    );
    // Neither the chat-change reset nor the guard bounced the fresh id.
    expect(setSelectedVersionId).not.toHaveBeenCalled();

    // Refetch lands ~1 s later: id is canonical, grace marker is released.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    rerender({
      ...initialProps,
      versionIdSet: new Set(["ver_1", "ver_2", "ver_3"]),
    });
    expect(setSelectedVersionId).not.toHaveBeenCalled();
    expect(pendingCreatedVersionRef.current).toBeNull();

    // The expiry timer was cancelled by the rerender: nothing fires later.
    act(() => {
      vi.advanceTimersByTime(FRESH_VERSION_GRACE_MS * 2);
    });
    expect(setSelectedVersionId).not.toHaveBeenCalled();
  });

  it("stops protecting a fresh id once the grace window has expired", () => {
    const setSelectedVersionId = vi.fn();
    const pendingCreatedVersionRef: { current: PendingCreatedVersion | null } = { current: null };
    markPendingCreatedVersion(pendingCreatedVersionRef, "ver_3");
    vi.advanceTimersByTime(FRESH_VERSION_GRACE_MS + 1);

    renderHook(() =>
      useBuilderVersionSelectionSync(
        makeParams({
          selectedVersionId: "ver_3",
          versionIdSet: new Set(["ver_1", "ver_2"]),
          pendingCreatedVersionRef,
          setSelectedVersionId,
        }),
      ),
    );
    expect(setSelectedVersionId).toHaveBeenCalledTimes(MOUNT_RESET_CALLS + 1);
    expect(setSelectedVersionId).toHaveBeenLastCalledWith(null);
  });

  it("clears a fresh selection at expiry even when the versions list never changes", () => {
    const setSelectedVersionId = vi.fn();
    const pendingCreatedVersionRef: { current: PendingCreatedVersion | null } = { current: null };
    markPendingCreatedVersion(pendingCreatedVersionRef, "ver_3");
    // Same Set reference for the whole test: SWR returns identical data, so
    // the effect deps never change — only the expiry timer can clear.
    const versionIdSet = new Set(["ver_1", "ver_2"]);

    renderHook(() =>
      useBuilderVersionSelectionSync(
        makeParams({
          selectedVersionId: "ver_3",
          versionIdSet,
          pendingCreatedVersionRef,
          setSelectedVersionId,
        }),
      ),
    );
    expect(setSelectedVersionId).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(FRESH_VERSION_GRACE_MS - 10);
    });
    expect(setSelectedVersionId).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(setSelectedVersionId).toHaveBeenCalledTimes(1);
    expect(setSelectedVersionId).toHaveBeenLastCalledWith(null);
  });

  it("does not let the chat-change reset wipe a grace-marked selection set in the same tick", () => {
    // New chat: stream `done` sets chatId AND selects v1 in the same batch.
    const setSelectedVersionId = vi.fn();
    const pendingCreatedVersionRef: { current: PendingCreatedVersion | null } = { current: null };
    markPendingCreatedVersion(pendingCreatedVersionRef, "ver_1");

    renderHook(() =>
      useBuilderVersionSelectionSync(
        makeParams({
          chatId: "chat_new",
          selectedVersionId: "ver_1",
          versionIdSet: new Set<string>(),
          pendingCreatedVersionRef,
          setSelectedVersionId,
        }),
      ),
    );
    // Neither the chat-change reset nor the guard may clear the fresh id.
    expect(setSelectedVersionId).not.toHaveBeenCalled();
  });

  it("still resets a selection carried over from another chat", () => {
    const setSelectedVersionId = vi.fn();
    renderHook(() =>
      useBuilderVersionSelectionSync(
        makeParams({
          chatId: "chat_new",
          selectedVersionId: "ver_from_old_chat",
          versionIdSet: new Set<string>(),
          setSelectedVersionId,
        }),
      ),
    );
    expect(setSelectedVersionId).toHaveBeenCalledWith(null);
  });

  it("does not let a fresh marker for another id protect a stale selection", () => {
    const setSelectedVersionId = vi.fn();
    const pendingCreatedVersionRef: { current: PendingCreatedVersion | null } = { current: null };
    markPendingCreatedVersion(pendingCreatedVersionRef, "ver_3");

    renderHook(() =>
      useBuilderVersionSelectionSync(
        makeParams({
          selectedVersionId: "ver_other",
          versionIdSet: new Set(["ver_1", "ver_2"]),
          pendingCreatedVersionRef,
          setSelectedVersionId,
        }),
      ),
    );
    expect(setSelectedVersionId).toHaveBeenCalledTimes(MOUNT_RESET_CALLS + 1);
    expect(setSelectedVersionId).toHaveBeenLastCalledWith(null);
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VersionStatus } from "@/lib/logging/event-bus-types";
import type { BuilderViewModel } from "../useBuilderPageController";
import { useShellVersionFollowup } from "./use-version-followup";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("read-only server completion observation", () => {
  it("refreshes late server status from the versions projection after stable polling stopped", async () => {
    vi.useFakeTimers();
    const green: VersionStatus = {
      runId: "root", phase: "done", previewBlocked: false, verificationBlocked: false,
      repairPassIndex: 0, lastBuildError: null, eventCount: 5, done: true,
      verifierOutcome: "passed", degradations: [],
    };
    const late: VersionStatus = {
      ...green, eventCount: 6,
      degradations: [{ kind: "product_postcheck_skipped", message: "Server postcheck pending" }],
    };
    let serverStatus = green;
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ok: true, versionId: "v1", status: serverStatus,
    })));
    vi.stubGlobal("fetch", fetchMock);
    const sendMessage = vi.fn();
    const vm = (status: VersionStatus) => ({
      chatId: "c1", activeVersionId: "v1", latestVersionId: "v1",
      versionStatusNonce: 0, sendMessage,
      effectiveVersionsList: [{
        id: "v1", versionId: "v1", releaseState: "promoted",
        verificationState: "passed", busStatus: status,
      }],
    }) as unknown as BuilderViewModel;
    const { result, rerender } = renderHook(
      ({ status }) => useShellVersionFollowup(vm(status)),
      { initialProps: { status: green } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(result.current.activeVersionBusStatus?.degradations).toEqual([]);
    const stableCalls = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(fetchMock).toHaveBeenCalledTimes(stableCalls);
    serverStatus = late;
    await act(async () => { rerender({ status: late }); });
    expect(fetchMock).toHaveBeenCalledTimes(stableCalls + 1);
    expect(result.current.activeVersionBusStatus?.degradations).toEqual(late.degradations);
    expect(fetchMock.mock.calls.every(call => String(call[0]).includes("/version-status?"))).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

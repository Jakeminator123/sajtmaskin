import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import type { VersionSummary } from "./types";
import { useVersionHistoryActions } from "./use-version-history-actions";

vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
vi.mock("@/lib/hooks/useVersions", () => ({
  useVersions: () => ({ versions: [], isLoading: false, mutate: vi.fn() }),
}));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({ user: null, isAuthenticated: true, hasGitHub: false, isInitialized: true, fetchUser: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("manual server repair acceptance", () => {
  it("does not accept on reopen; the explicit click accepts and clears loading", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      success: true, versionId: "v_repaired", previewUrl: "https://preview.example/repaired",
    })));
    vi.stubGlobal("fetch", fetchMock);
    const onVersionSelect = vi.fn();
    const mutateVersions = vi.fn();
    const version = {
      id: "v1", versionId: "v1", canPin: false, verificationState: "repair_available",
      hasPendingRepair: true,
    } as VersionSummary;
    const { result } = renderHook(() => useVersionHistoryActions({
      chatId: "c1", selectedVersionId: "v1", versions: [version],
      onVersionSelect, mutateVersions,
    }));
    expect(result.current.primaryRepairVersion?.id).toBe("v1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onVersionSelect).not.toHaveBeenCalled();
    const stopPropagation = vi.fn();
    await act(async () => {
      await result.current.handleAcceptRepair({ stopPropagation } as unknown as MouseEvent, version);
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/engine/chats/c1/accept-repair");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: '{"versionId":"v1"}' });
    expect(mutateVersions).toHaveBeenCalledOnce();
    expect(onVersionSelect).toHaveBeenCalledWith("v_repaired", "https://preview.example/repaired");
    expect(result.current.acceptingRepairVersionId).toBeNull();
  });
});

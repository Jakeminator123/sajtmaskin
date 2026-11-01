import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import type { VersionSummary } from "./types";
import { useVersionHistoryActions } from "./use-version-history-actions";

const swr = vi.hoisted(() => vi.fn((_key: unknown, _fetcher: unknown, _config: unknown) => ({ data: undefined })));
vi.mock("swr", () => ({ default: swr }));
vi.mock("@/lib/hooks/useVersions", () => ({
  useVersions: () => ({ versions: [], isLoading: false, mutate: vi.fn() }),
}));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({ user: null, isAuthenticated: true, hasGitHub: false, isInitialized: true, fetchUser: vi.fn() }),
}));

afterEach(() => { vi.unstubAllGlobals(); swr.mockClear(); });

it("connects the history's IDs and chat to the bounded summary fetcher", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
    summaries: { v1: { approvalStatus: "approved", unresolvedCount: 1 } },
  }));
  vi.stubGlobal("fetch", fetchMock);
  renderHook(() => useVersionHistoryActions({
    chatId: "chat_actual", selectedVersionId: null,
    versions: [{ id: "v1" }, { versionId: "v2" }] as VersionSummary[],
    onVersionSelect: vi.fn(),
  }));
  const [key, fetcher] = swr.mock.calls.find(([key]) =>
    Array.isArray(key) && key[0] === "collaboration-summaries")!;
  const result = await (fetcher as (key: unknown) => Promise<unknown>)(key);
  expect(result).toEqual({ summaries: { v1: { approvalStatus: "approved", unresolvedCount: 1 } } });
  const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
  expect(url.pathname).toBe("/api/engine/chats/chat_actual/versions/collaboration-summaries");
  expect(url.searchParams.get("versionIds")).toBe("v1,v2");
});

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

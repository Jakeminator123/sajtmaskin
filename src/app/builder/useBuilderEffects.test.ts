import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: toastError,
    warning: toastWarning,
  }),
}));

vi.mock("@/lib/projects/project-client", () => ({
  saveProjectData,
}));

import { useBuilderEffects } from "./useBuilderEffects";

function makeArgs(
  overrides: Partial<Parameters<typeof useBuilderEffects>[0]> = {},
): Parameters<typeof useBuilderEffects>[0] {
  return {
    auditPromptLoaded: true,
    templateId: "tmpl_1",
    chatId: null,
    isCreatingChat: false,
    isAnyStreaming: false,
    selectedModelTier: "max",
    appProjectId: "proj_1",
    applyAppProjectId: vi.fn(),
    searchParams: new URLSearchParams(
      "project=proj_1&templateId=tmpl_1",
    ) as unknown as ReadonlyURLSearchParams,
    router: { replace: vi.fn() },
    setChatId: vi.fn(),
    setCurrentPreviewUrl: vi.fn(),
    setIsTemplateLoading: vi.fn(),
    templateInitAttemptKeyRef: { current: null },
    ...overrides,
  };
}

describe("useBuilderEffects template init", () => {
  beforeEach(() => {
    toastError.mockReset();
    toastWarning.mockReset();
    saveProjectData.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sätter explicit felläge när POST /api/template misslyckas", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: "Template init failed" }),
    } as Response);

    const args = makeArgs();
    const { result } = renderHook(() => useBuilderEffects(args));

    await waitFor(() => {
      expect(result.current.templateInitError).toBe("Template init failed");
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalled();
  });

  it("retryar samma projectId+templateId och skapar inte en ny klientnyckel", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: "nätfel" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          chatId: "chat_replay",
          projectId: "proj_1",
          previewUrl: null,
        }),
      } as Response);

    const setChatId = vi.fn();
    const args = makeArgs({ setChatId });
    const { result } = renderHook(() => useBuilderEffects(args));

    await waitFor(() => {
      expect(result.current.templateInitError).toBe("nätfel");
    });

    await act(async () => {
      result.current.retryTemplateInit();
    });

    await waitFor(() => {
      expect(setChatId).toHaveBeenCalledWith("chat_replay");
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies).toEqual([
      { templateId: "tmpl_1", quality: "max", projectId: "proj_1" },
      { templateId: "tmpl_1", quality: "max", projectId: "proj_1" },
    ]);
    expect(args.templateInitAttemptKeyRef.current).toBe("tmpl_1:max");
  });
});

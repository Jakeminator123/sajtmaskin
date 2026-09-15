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

import { buildTemplateInitAttemptKey, useBuilderEffects } from "./useBuilderEffects";

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonResponse<T>(payload: T, ok = true) {
  return {
    ok,
    json: async () => payload,
  } as Response;
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
    expect(args.templateInitAttemptKeyRef.current).toBe(
      buildTemplateInitAttemptKey("proj_1", "tmpl_1", "max"),
    );
  });

  it("tillämpar inte ett fördröjt success efter projektbyte", async () => {
    const first = deferred<{ success: boolean; chatId: string; previewUrl: string | null }>();
    const second = deferred<{ success: boolean; chatId: string; previewUrl: string | null }>();
    let calls = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      calls += 1;
      const pending = calls === 1 ? first : second;
      return {
        ok: true,
        json: () => pending.promise,
      } as Response;
    });

    const setChatId = vi.fn();
    const setCurrentPreviewUrl = vi.fn();
    const setIsTemplateLoading = vi.fn();
    const applyAppProjectId = vi.fn();
    const attemptRef = { current: null as string | null };
    const { rerender } = renderHook((props) => useBuilderEffects(props), {
      initialProps: makeArgs({
        setChatId,
        setCurrentPreviewUrl,
        setIsTemplateLoading,
        applyAppProjectId,
        templateInitAttemptKeyRef: attemptRef,
      }),
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    rerender(
      makeArgs({
        appProjectId: "proj_2",
        searchParams: new URLSearchParams(
          "project=proj_2&templateId=tmpl_1",
        ) as unknown as ReadonlyURLSearchParams,
        setChatId,
        setCurrentPreviewUrl,
        setIsTemplateLoading,
        applyAppProjectId,
        templateInitAttemptKeyRef: attemptRef,
      }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(attemptRef.current).toBe(buildTemplateInitAttemptKey("proj_2", "tmpl_1", "max"));

    await act(async () => {
      first.resolve({
        success: true,
        chatId: "chat_stale",
        previewUrl: "https://preview.example/stale",
      });
    });

    expect(setChatId).not.toHaveBeenCalledWith("chat_stale");
    expect(applyAppProjectId).not.toHaveBeenCalledWith("proj_1", { chatId: "chat_stale" });
    expect(setCurrentPreviewUrl).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve({
        success: true,
        chatId: "chat_fresh",
        previewUrl: null,
      });
    });

    await waitFor(() => {
      expect(setChatId).toHaveBeenCalledWith("chat_fresh");
    });
    expect(applyAppProjectId).toHaveBeenCalledWith("proj_2", { chatId: "chat_fresh" });
  });

  it("sätter inte felläge eller släcker loading från ett fördröjt error efter projektbyte", async () => {
    const first = deferred<never>();
    const second = deferred<{ success: boolean; error: string }>();
    let calls = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          json: () => first.promise,
        } as unknown as Response;
      }
      return {
        ok: false,
        json: () => second.promise,
      } as unknown as Response;
    });

    const setIsTemplateLoading = vi.fn();
    const attemptRef = { current: null as string | null };
    const { result, rerender } = renderHook((props) => useBuilderEffects(props), {
      initialProps: makeArgs({
        setIsTemplateLoading,
        templateInitAttemptKeyRef: attemptRef,
      }),
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    rerender(
      makeArgs({
        appProjectId: "proj_2",
        setIsTemplateLoading,
        templateInitAttemptKeyRef: attemptRef,
      }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      first.reject(new Error("stale network"));
    });

    expect(result.current.templateInitError).toBeNull();
    expect(toastError).not.toHaveBeenCalled();

    const loadingAfterStale = setIsTemplateLoading.mock.calls.length;

    await act(async () => {
      second.resolve({ success: false, error: "nytt fel" });
    });

    await waitFor(() => {
      expect(result.current.templateInitError).toBe("nytt fel");
    });
    expect(setIsTemplateLoading.mock.calls.slice(loadingAfterStale)).toContainEqual([false]);
  });

  it("startar separata försök för samma template+tier i två olika projekt", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, chatId: "chat_x" }));
    const attemptRef = { current: null as string | null };
    const { rerender } = renderHook((props) => useBuilderEffects(props), {
      initialProps: makeArgs({ templateInitAttemptKeyRef: attemptRef }),
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(attemptRef.current).toBe(buildTemplateInitAttemptKey("proj_1", "tmpl_1", "max"));

    rerender(makeArgs({ appProjectId: "proj_2", templateInitAttemptKeyRef: attemptRef }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(attemptRef.current).toBe(buildTemplateInitAttemptKey("proj_2", "tmpl_1", "max"));
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.map((body: { projectId?: string }) => body.projectId)).toEqual([
      "proj_1",
      "proj_2",
    ]);
  });

  it("tillämpar inte ett sent svar efter chattbyte under pågående init", async () => {
    const pending = deferred<{ success: boolean; chatId: string; previewUrl: null }>();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => pending.promise,
    } as Response);

    const setChatId = vi.fn();
    const applyAppProjectId = vi.fn();
    const { rerender } = renderHook((props) => useBuilderEffects(props), {
      initialProps: makeArgs({ setChatId, applyAppProjectId }),
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    rerender(makeArgs({ chatId: "chat_other", setChatId, applyAppProjectId }));

    await act(async () => {
      pending.resolve({ success: true, chatId: "chat_template", previewUrl: null });
    });

    expect(setChatId).not.toHaveBeenCalled();
    expect(applyAppProjectId).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ogiltigförklarar unmount och låter remount starta en legitim init", async () => {
    const resolveFetch: Array<(payload: { success: boolean; chatId: string; previewUrl: null }) => void> =
      [];
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch.push((payload) => {
            resolve(jsonResponse(payload));
          });
        }),
    );

    const setChatId = vi.fn();
    const attemptRef = { current: null as string | null };
    const first = renderHook(() =>
      useBuilderEffects(makeArgs({ setChatId, templateInitAttemptKeyRef: attemptRef })),
    );

    await waitFor(() => expect(resolveFetch.length).toBeGreaterThanOrEqual(1));
    const startedBeforeUnmount = resolveFetch.length;
    first.unmount();

    await act(async () => {
      resolveFetch[0]({ success: true, chatId: "chat_unmounted", previewUrl: null });
    });
    expect(setChatId).not.toHaveBeenCalled();
    expect(attemptRef.current).toBeNull();

    renderHook(() =>
      useBuilderEffects(makeArgs({ setChatId, templateInitAttemptKeyRef: attemptRef })),
    );

    await waitFor(() => expect(resolveFetch.length).toBeGreaterThan(startedBeforeUnmount));

    await act(async () => {
      resolveFetch[resolveFetch.length - 1]({
        success: true,
        chatId: "chat_remount",
        previewUrl: null,
      });
    });

    await waitFor(() => {
      expect(setChatId).toHaveBeenCalledWith("chat_remount");
    });
    expect(setChatId).not.toHaveBeenCalledWith("chat_unmounted");
  });

  it("tillämpar ett normalt lyckat försök i samma kontext", async () => {
    const setChatId = vi.fn();
    const setCurrentPreviewUrl = vi.fn();
    const applyAppProjectId = vi.fn();
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        chatId: "chat_ok",
        previewUrl: "https://vm.example/chat_ok",
      }),
    );

    renderHook(() =>
      useBuilderEffects(makeArgs({ setChatId, setCurrentPreviewUrl, applyAppProjectId })),
    );

    await waitFor(() => {
      expect(setChatId).toHaveBeenCalledWith("chat_ok");
    });
    expect(applyAppProjectId).toHaveBeenCalledWith("proj_1", { chatId: "chat_ok" });
    expect(setCurrentPreviewUrl).toHaveBeenCalledWith("https://vm.example/chat_ok");
    expect(saveProjectData).toHaveBeenCalled();
  });
});

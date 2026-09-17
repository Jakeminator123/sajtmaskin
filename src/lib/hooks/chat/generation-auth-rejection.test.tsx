import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import type { ChatMessagingParams } from "./types";
import { useCreateChat } from "./useCreateChat";
import { useSendMessage } from "./useSendMessage";
import { requestBuilderAuthentication } from "@/lib/auth/builder-auth-events";
import { clearCreateChatLock } from "./helpers";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() }) }));
vi.mock("@/lib/auth/builder-auth-events", () => ({ requestBuilderAuthentication: vi.fn() }));
vi.mock("@/lib/builder/init-build-choices", () => ({
  buildInitBuildChoicesInstructions: () => "",
  buildInitBuildChoicesMeta: () => ({}),
  getCurrentInitBuildChoices: () => ({}),
  resetInitBuildChoices: vi.fn(),
}));
vi.mock("@/lib/gen/plan/schema", () => ({ normalizePlanArtifact: vi.fn() }));
vi.mock("@/lib/gen/preview/legacy/compatibility-shim", () => ({ isCompatibilityShimPreviewUrl: () => false }));
vi.mock("@/lib/models/catalog", () => ({
  MODEL_LABELS: { max: "Test" }, canonicalizeModelId: () => "max",
  canonicalModelIdToOwnModelId: () => "test-model", getBuildProfileId: () => "test-profile",
}));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));
vi.mock("./helpers", () => ({
  appendAttachmentPrompt: (text: string) => text,
  appendModelInfoPart: vi.fn(), appendPromptStrategyPart: vi.fn(),
  resolveDeepBriefModelInfoFields: vi.fn(), resolveDeepBriefVisibilityFields: vi.fn(),
  buildApiErrorMessage: () => "generic API error should not be reached",
  buildCreateChatKey: () => "key", clearCreateChatLock: vi.fn(),
  CREATE_CHAT_CONNECTION_BROKEN_MESSAGE: "network error", getActiveCreateChatLock: () => null,
  isAbortLikeError: () => false, isClientInitiatedAbort: () => false, isNetworkError: () => false,
  updateCreateChatLockChatId: vi.fn(), writeCreateChatLock: vi.fn(),
}));
vi.mock("./stream-handlers-post-stream", () => ({ runSerializedGenerationTail: vi.fn() }));
vi.mock("./post-checks-preview", () => ({ readPreviewPreflight: vi.fn() }));
vi.mock("./stream-handlers", () => ({ handleSseStream: vi.fn() }));
vi.mock("./post-checks", () => ({ abortPostChecksForChat: vi.fn() }));
vi.mock("@/lib/api/preview-url-contract", () => ({ resolveInboundPreviewUrl: vi.fn() }));
vi.mock("@/lib/builder/f3-finalize-action", () => ({ runF3FinalizeAction: vi.fn() }));
vi.mock("@/lib/builder/project-env-events", () => ({ dispatchF3Requirements: vi.fn(), dispatchF3Status: vi.fn() }));

function dependencies() {
  return {
    buildBuilderParams: () => new URLSearchParams(),
    streamAbortRef: { current: null as AbortController | null },
    autoFixHandlerRef: { current: vi.fn() },
    lastSentSystemPromptRef: { current: "previous system" as string | null },
    startStreamSafetyTimer: vi.fn(), touchStreamSafetyTimer: vi.fn(), clearStreamSafetyTimer: vi.fn(),
    createNewChat: vi.fn(async () => false),
  };
}
function params(setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>, chatId: string | null): ChatMessagingParams {
  // Unrelated generation branches never run for the pre-stream 401 fixture.
  return {
    chatId, activeVersionId: chatId ? "v1" : null, setChatId: vi.fn(), chatIdParam: chatId,
    router: { replace: vi.fn() }, appProjectId: "p1", promptHandoffId: "h1",
    selectedModelTier: "max", enableImageGenerations: false, enableThinking: false,
    systemPrompt: "test instructions", buildIntent: "website", buildMethod: "freeform",
    scaffoldMode: "auto", paletteState: { selections: [] },
    pendingBriefRef: { current: { companyName: "Test" } },
    mutateVersions: vi.fn(), setCurrentPreviewUrl: vi.fn(), setMessages, resetBeforeCreateChat: vi.fn(),
  } as unknown as ChatMessagingParams;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    success: false, requiresAuth: true, insufficientCredits: false,
    error: "Skapa ett konto eller logga in för att generera.",
  }), { status: 401, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("pre-stream app authentication rejection", () => {
  it("rejects create without consuming the composer draft, showing API errors, or retaining a busy lock", async () => {
    const deps = dependencies();
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      return { ...useCreateChat(params(setMessages, null), deps), messages };
    });
    let accepted: boolean | undefined;
    await act(async () => { accepted = await result.current.createNewChat("Behåll min prompt"); });
    expect(accepted).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.isCreatingChat).toBe(false);
    expect(result.current.createChatInFlightRef.current).toBe(false);
    expect(result.current.pendingCreateKeyRef.current).toBeNull();
    expect(clearCreateChatLock).toHaveBeenCalled();
    expect(deps.clearStreamSafetyTimer).toHaveBeenCalled();
    expect(deps.lastSentSystemPromptRef.current).toBeNull();
    expect(requestBuilderAuthentication).toHaveBeenCalledWith({ message: "Behåll min prompt", projectId: "p1", promptHandoffId: "h1" });
    expect(toast.error).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a follow-up without deleting prior history or consuming the draft", async () => {
    const deps = dependencies();
    const previous: ChatMessage = { id: "previous", role: "assistant", content: "Befintlig sajt" };
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>([previous]);
      return { ...useSendMessage(params(setMessages, "c1"), deps), messages };
    });
    await act(async () => {
      expect(await result.current.sendMessage("Behåll min ändring")).toEqual({
        status: "rejected", reason: "auth_required", turnRecorded: false,
      });
    });
    expect(result.current.messages).toEqual([previous]);
    expect(deps.lastSentSystemPromptRef.current).toBeNull();
    expect(requestBuilderAuthentication).toHaveBeenCalledWith({ message: "Behåll min ändring", chatId: "c1", projectId: "p1" });
    expect(toast.error).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

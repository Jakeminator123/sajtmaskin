import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import { PROMPT_SOURCE_UI_PART_TYPE, type ChatMessage } from "@/lib/builder/types";
import { DEFAULT_MODEL_TIER } from "@/lib/builder/defaults";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { CREATE_CHAT_CONNECTION_BROKEN_MESSAGE } from "./helpers-errors";
import type {
  AutoFixPayload,
  ChatMessagingParams,
  MessageOptions,
  SendMessageOutcome,
} from "./types";

const handleSseStream = vi.hoisted(() => vi.fn());
const dispatchF3Requirements = vi.hoisted(() => vi.fn());
const dispatchF3Status = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => {
  const fn = vi.fn();
  return Object.assign(fn, {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  });
});

vi.mock("sonner", () => ({ toast }));
vi.mock("./stream-handlers", () => ({ handleSseStream }));
vi.mock("./post-checks", () => ({
  runPostGenerationChecks: vi.fn(),
  abortPostChecksForChat: vi.fn(),
}));
vi.mock("./post-checks-fetch", () => ({ triggerImageMaterialization: vi.fn() }));
vi.mock("./post-checks-preview", () => ({ readPreviewPreflight: vi.fn(() => null) }));
vi.mock("@/lib/builder/project-env-events", () => ({
  dispatchF3Requirements,
  dispatchF3Status,
}));
vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
  warnLog: vi.fn(),
}));

import { useSendMessage } from "./useSendMessage";

let capturedBody: Record<string, unknown> | null = null;
const fetchMock = vi.fn();

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse() {
  return new Response("event: meta\ndata: {}\n\n", {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function isMessagesUrl(url: unknown): boolean {
  return String(url).includes("/messages");
}

function createHarness(
  overrides?: Partial<ChatMessagingParams>,
  depsOverrides?: { createNewChat?: () => Promise<boolean> },
) {
  const messagesBox = { current: [] as ChatMessage[] };
  const setMessages = vi.fn((next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    messagesBox.current = typeof next === "function" ? next(messagesBox.current) : next;
  });
  const mutateVersions = vi.fn();

  const params: ChatMessagingParams = {
    chatId: "chat_1",
    activeVersionId: undefined,
    latestKnownVersionId: undefined,
    setChatId: vi.fn(),
    chatIdParam: null,
    router: { replace: vi.fn() },
    selectedModelTier: DEFAULT_MODEL_TIER,
    enableImageGenerations: false,
    enableThinking: false,
    mutateVersions,
    setCurrentPreviewUrl: vi.fn(),
    setPreviewBuildError: vi.fn(),
    setPreviewProdBuild: vi.fn(),
    setPreviewPending: vi.fn(),
    setMessages,
    resetBeforeCreateChat: vi.fn(),
    ...overrides,
  };

  const deps = {
    createNewChat: vi.fn(depsOverrides?.createNewChat ?? (async () => true)),
    streamAbortRef: { current: null } as MutableRefObject<AbortController | null>,
    autoFixHandlerRef: { current: vi.fn() } as MutableRefObject<(payload: AutoFixPayload) => void>,
    lastSentSystemPromptRef: { current: null } as MutableRefObject<string | null>,
    startStreamSafetyTimer: vi.fn(),
    touchStreamSafetyTimer: vi.fn(),
    clearStreamSafetyTimer: vi.fn(),
  };

  const { result } = renderHook(() => useSendMessage(params, deps));
  return { result, messagesBox, mutateVersions, streamAbortRef: deps.streamAbortRef };
}

async function send(
  result: {
    current: {
      sendMessage: (text: string, options?: MessageOptions) => Promise<SendMessageOutcome>;
    };
  },
  text: string,
  options?: MessageOptions,
): Promise<SendMessageOutcome> {
  let outcome: SendMessageOutcome | null = null;
  await act(async () => {
    outcome = await result.current.sendMessage(text, options);
  });
  if (!outcome) throw new Error("sendMessage did not resolve to an outcome");
  return outcome;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedBody = null;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSendMessage 5-2 stale-base gate (client half)", () => {
  // Fast-edit robustness (2026-07-23): the FIRST 409 stale_base_version is
  // auto-rebased — the send retries once against the server's latest version
  // so a quick follow-up prompt survives an autofix/repair that advanced the
  // head. Only a SECOND consecutive 409 falls back to the reload toast.
  it("auto-rebases onto the server's latest version on a 409 stale_base_version", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (bodies.length === 1) {
        return jsonResponse(409, {
          error: "stale_base_version",
          reason: "stale_base_version",
          latestVersionId: "ver_new",
        });
      }
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result, mutateVersions } = createHarness({
      activeVersionId: "ver_old",
      latestKnownVersionId: "ver_old",
    });

    await send(result, "Uppdatera hero copy");

    expect(bodies).toHaveLength(2);
    const retryMeta = (bodies[1]?.meta ?? {}) as Record<string, unknown>;
    expect(retryMeta.engineBaseVersionId).toBe("ver_new");
    expect(retryMeta.engineLatestKnownVersionId).toBe("ver_new");
    expect(handleSseStream).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.message).toHaveBeenCalledWith(
      "Byggde vidare på senaste versionen",
      expect.anything(),
    );
    expect(mutateVersions).toHaveBeenCalled();
  });

  // S5 (fallback): if the head moves AGAIN between rebase and retry, the
  // second 409 must surface the reload toast and leave the chat state
  // consistent — no duplicate/stuck optimistic user message and the
  // assistant turn stops streaming.
  it("surfaces a reload toast and resets state when the auto-rebase retry also hits 409", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: "stale_base_version",
        reason: "stale_base_version",
        latestVersionId: "ver_new",
      }),
    );

    const { result, messagesBox, mutateVersions } = createHarness({
      activeVersionId: "ver_old",
      latestKnownVersionId: "ver_old",
    });

    await send(result, "Uppdatera hero copy");

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(String(toast.error.mock.calls[0]?.[0])).toMatch(/ladda om/i);
    expect(mutateVersions).toHaveBeenCalled();
    expect(handleSseStream).not.toHaveBeenCalled();

    const messages = messagesBox.current;
    // The gate returns BEFORE the server persists anything, so the optimistic
    // user row is a client-only ghost and is dropped — the composer keeps the
    // draft for a `rejected` outcome, so the prompt must not also sit in the
    // thread as a turn that never happened (bugbot on #610).
    expect(messages.filter((m) => m.role === "user")).toEqual([]);

    const assistant = messages.find((m) => m.role === "assistant");
    expect(assistant?.isStreaming).toBe(false);
    expect(assistant?.content).toMatch(/nyare version/i);
    expect(messages.every((m) => !m.isStreaming)).toBe(true);
  });

  // S4: with no known-latest version the client must NOT send the stale-base
  // signal, so the follow-up proceeds normally (no false 409 on a first/
  // signal-less message).
  it("omits engineLatestKnownVersionId and proceeds when the client has no known-latest", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result } = createHarness({
      activeVersionId: undefined,
      latestKnownVersionId: undefined,
    });

    await send(result, "Lägg till en sektion");

    expect(handleSseStream).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    const meta = (capturedBody?.meta ?? {}) as Record<string, unknown>;
    expect(meta.engineLatestKnownVersionId).toBeUndefined();
    expect(meta.engineBaseVersionId).toBeUndefined();
  });

  // S1/S2 client half: a regular follow-up forwards the known-latest version
  // so the server gate can actually engage (or pass) for the up-to-date case.
  it("forwards engineLatestKnownVersionId on a regular follow-up", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result } = createHarness({
      activeVersionId: "ver_current",
      latestKnownVersionId: "ver_current",
    });

    await send(result, "Uppdatera CTA");

    const meta = (capturedBody?.meta ?? {}) as Record<string, unknown>;
    expect(meta.engineBaseVersionId).toBe("ver_current");
    expect(meta.engineLatestKnownVersionId).toBe("ver_current");
  });

  // S3 client half: an explicit base override (F3 "Bygg integrationer" /
  // autofix) deliberately targets a specific version, so it must skip the
  // known-latest signal and stay exempt from the gate.
  it("omits the signal when an explicit engineBaseVersionId override is used", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result } = createHarness({
      activeVersionId: "ver_current",
      latestKnownVersionId: "ver_current",
    });

    await send(result, "Reparera bygget", { engineBaseVersionIdOverride: "ver_old" });

    const meta = (capturedBody?.meta ?? {}) as Record<string, unknown>;
    expect(meta.engineBaseVersionId).toBe("ver_old");
    expect(meta.engineLatestKnownVersionId).toBeUndefined();
  });

  // OpenClaw prepared-prompt fast lane: the composer-resolved tag must reach
  // the follow-up stream request body as a TOP-LEVEL `promptSource` field
  // (not meta — the prompt-log meta already has a different promptSource key).
  it("forwards options.promptSource as a top-level body field", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result } = createHarness();

    await send(result, "Mål:\n- Ny hero\n- Mörkt tema", {
      promptSource: "openclaw-prepared",
    });

    expect(capturedBody?.promptSource).toBe("openclaw-prepared");
    const meta = (capturedBody?.meta ?? {}) as Record<string, unknown>;
    expect(meta.promptSource).toBeUndefined();
  });

  it("omits the promptSource body field when the option is not set", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result } = createHarness();

    await send(result, "Uppdatera CTA-knappen");

    expect(capturedBody).not.toBeNull();
    expect("promptSource" in (capturedBody ?? {})).toBe(false);
  });

  // C2 (empty-output tool feedback fix): verifies the UI→server leg of the
  // "Bygg integrationer" chain — `BuilderShellContent.onF3Ready` calls
  // `sendMessage(..., { lifecycleStageOverride: "integrations", ... })`, and
  // the request body must actually carry `meta.lifecycleStage: "integrations"`
  // + `meta.parentVersionId` for the server (`parseChatRequestMeta.ts` →
  // `orchestrate.ts` → `buildSpec.previewPolicy: "fidelity3"`) to route the
  // stream into the F3 lane instead of silently defaulting to F2.
  it("forwards lifecycleStageOverride + parentVersionIdOverride as meta.lifecycleStage/parentVersionId (F3 'Bygg integrationer' kick)", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result } = createHarness({
      activeVersionId: "ver_f2_parent",
      latestKnownVersionId: "ver_f2_parent",
    });

    await send(result, "Bygg integrationer nu utifrån den finaliserade designversionen.", {
      lifecycleStageOverride: "integrations",
      parentVersionIdOverride: "ver_f2_parent",
      engineBaseVersionIdOverride: "ver_f2_parent",
    });

    const meta = (capturedBody?.meta ?? {}) as Record<string, unknown>;
    expect(meta.lifecycleStage).toBe("integrations");
    expect(meta.parentVersionId).toBe("ver_f2_parent");
    expect(meta.engineBaseVersionId).toBe("ver_f2_parent");
  });

  it("attaches an f3-kick uiPart on the optimistic user row and skips promptMeta.promptSourceKind", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result, messagesBox } = createHarness({
      activeVersionId: "ver_f2_parent",
      latestKnownVersionId: "ver_f2_parent",
    });

    await send(result, "Bygg integrationer nu utifrån den finaliserade designversionen.", {
      lifecycleStageOverride: "integrations",
      parentVersionIdOverride: "ver_f2_parent",
      engineBaseVersionIdOverride: "ver_f2_parent",
      promptSourceMeta: { sourceKind: "f3-kick" },
    });

    const userRow = messagesBox.current.find((m) => m.role === "user");
    expect(userRow?.uiParts).toEqual([{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "f3-kick" }]);

    const meta = (capturedBody?.meta ?? {}) as Record<string, unknown>;
    expect(meta.lifecycleStage).toBe("integrations");
    expect(meta.promptSourceKind).toBeUndefined();
    expect(meta.promptSourceTechnical).toBeUndefined();
    expect(meta.promptSourcePreservePayload).toBeUndefined();
  });

  it("still forwards promptMeta.promptSourceKind for an autofix send", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result, messagesBox } = createHarness({
      activeVersionId: "ver_current",
      latestKnownVersionId: "ver_current",
    });

    await send(result, "AUTO-FIX REQUEST — TARGETED REPAIR", {
      promptSourceMeta: {
        sourceKind: "autofix",
        isTechnical: true,
        preservePayload: true,
      },
    });

    const userRow = messagesBox.current.find((m) => m.role === "user");
    expect(userRow?.uiParts).toEqual([{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "autofix" }]);

    const meta = (capturedBody?.meta ?? {}) as Record<string, unknown>;
    expect(meta.promptSourceKind).toBe("autofix");
    expect(meta.promptSourceTechnical).toBe(true);
    expect(meta.promptSourcePreservePayload).toBe(true);
  });

  it("binds an approved plan to its server-issued design lineage", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result } = createHarness({ activeVersionId: "ver_current" });
    await send(result, "Utför den godkända planen", {
      promptSourceMeta: {
        sourceKind: "approved-plan",
        isTechnical: true,
        preservePayload: true,
        planDesignLineageHash: "plan-lineage-123",
      },
    });

    const meta = (capturedBody?.meta ?? {}) as Record<string, unknown>;
    expect(meta.promptSourceKind).toBe("approved-plan");
    expect(meta.planDesignLineageHash).toBe("plan-lineage-123");
  });

  it("handles the deterministic F3 stream backstop via finalize-design and ReleaseGate", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/stream")) {
        return jsonResponse(409, {
          error: "f3_deterministic_release_required",
          ready: false,
          parentVersionId: "ver_f2_parent",
        });
      }
      if (url.endsWith("/finalize-design")) {
        return jsonResponse(200, {
          ready: true,
          action: "deterministic_release",
          parentVersionId: "ver_f2_parent",
          versionId: "ver_f3_exact",
          gateRequired: true,
          releaseState: "draft",
          verificationState: "pending",
        });
      }
      if (url.endsWith("/quality-gate")) {
        return jsonResponse(200, {
          passed: true,
          promoted: true,
          vmGatePassed: true,
          checks: [
            { check: "typecheck", passed: true },
            { check: "build", passed: true },
            { check: "lint", passed: true },
          ],
        });
      }
      return jsonResponse(404, { error: "unexpected" });
    });
    const onDeterministicF3Settled = vi.fn();
    const { result, messagesBox } = createHarness({
      activeVersionId: "ver_f2_parent",
      onDeterministicF3Settled,
    });

    await send(result, "Bygg integrationer nu.", {
      lifecycleStageOverride: "integrations",
      parentVersionIdOverride: "ver_f2_parent",
      engineBaseVersionIdOverride: "ver_f2_parent",
    });

    expect(onDeterministicF3Settled).toHaveBeenCalledWith({
      versionId: "ver_f3_exact",
      selectVersion: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(toast.success).toHaveBeenCalledWith("ReleaseGate godkänd.");
    expect(messagesBox.current.at(-1)?.content).toContain("exakt samma filer");
  });

  // Restlistan R1: den underkända ReleaseGate-toasten är borta. Den här lanen
  // har ingen `onStatus`-callback, så verdiktet måste nå den diskreta
  // statusraden via eventet — annars säger chattexten "se versionsdiagnostiken"
  // utan att någon länk dit finns (bugbot på #639).
  it("routes a failed ReleaseGate from the stream lane to the status row instead of a toast", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/stream")) {
        return jsonResponse(409, {
          error: "f3_deterministic_release_required",
          ready: false,
          parentVersionId: "ver_f2_parent",
        });
      }
      if (url.endsWith("/finalize-design")) {
        return jsonResponse(200, {
          ready: true,
          action: "deterministic_release",
          parentVersionId: "ver_f2_parent",
          versionId: "ver_f3_exact",
          gateRequired: true,
          releaseState: "draft",
          verificationState: "pending",
        });
      }
      if (url.endsWith("/quality-gate")) {
        return jsonResponse(200, {
          passed: false,
          promoted: false,
          vmGatePassed: false,
          checks: [
            { check: "typecheck", passed: false },
            { check: "build", passed: true },
            { check: "lint", passed: true },
          ],
        });
      }
      return jsonResponse(404, { error: "unexpected" });
    });
    const { result } = createHarness({ activeVersionId: "ver_f2_parent" });

    await send(result, "Bygg integrationer nu.", {
      lifecycleStageOverride: "integrations",
      parentVersionIdOverride: "ver_f2_parent",
      engineBaseVersionIdOverride: "ver_f2_parent",
    });

    expect(dispatchF3Status).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_f3_exact",
        tone: "error",
        title: "ReleaseGate behöver åtgärdas",
      }),
    );
    expect(toast.warning).not.toHaveBeenCalledWith("ReleaseGate behöver åtgärdas.");
  });

  it("surfaces a direct F3 stream 412 in the persistent requirements surface", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(412, {
        error: "tier3_env_not_ready",
        parentVersionId: "ver_f2_parent",
        projectId: "project_1",
        missingByIntegration: [
          {
            key: "clerk",
            name: "Clerk",
            missing: ["CLERK_SECRET_KEY"],
          },
        ],
      }),
    );
    const { result } = createHarness({ activeVersionId: "ver_f2_parent" });

    await send(result, "Bygg integrationer nu.", {
      lifecycleStageOverride: "integrations",
      parentVersionIdOverride: "ver_f2_parent",
      engineBaseVersionIdOverride: "ver_f2_parent",
    });

    expect(dispatchF3Requirements).toHaveBeenCalledWith({
      parentVersionId: "ver_f2_parent",
      chatId: "chat_1",
      requestStartedAt: expect.any(Number),
      projectId: "project_1",
      missingByIntegration: [
        {
          key: "clerk",
          name: "Clerk",
          missing: ["CLERK_SECRET_KEY"],
        },
      ],
    });
  });

  it("surfaces missing env returned by the deterministic backstop", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/stream")) {
        return jsonResponse(409, {
          error: "f3_deterministic_release_required",
          parentVersionId: "ver_f2_parent",
        });
      }
      return jsonResponse(412, {
        ready: false,
        parentVersionId: "ver_f2_parent",
        projectId: "project_1",
        missingByIntegration: [
          {
            key: "clerk",
            name: "Clerk",
            missing: ["CLERK_SECRET_KEY"],
          },
        ],
      });
    });
    const { result } = createHarness({ activeVersionId: "ver_f2_parent" });

    await send(result, "Bygg integrationer nu.", {
      lifecycleStageOverride: "integrations",
      parentVersionIdOverride: "ver_f2_parent",
      engineBaseVersionIdOverride: "ver_f2_parent",
    });

    expect(dispatchF3Requirements).toHaveBeenCalledWith({
      parentVersionId: "ver_f2_parent",
      chatId: "chat_1",
      requestStartedAt: expect.any(Number),
      projectId: "project_1",
      missingByIntegration: [
        {
          key: "clerk",
          name: "Clerk",
          missing: ["CLERK_SECRET_KEY"],
        },
      ],
    });
  });

  // Regular follow-ups (free text, no F3 button) must NOT carry a
  // lifecycleStage at all — the server default ("design"/F2) is what makes
  // the malformed-tool-call fix (C1/C3) reachable in the first place.
  it("omits meta.lifecycleStage on a regular follow-up (defaults to F2 server-side)", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 200 });
    });
    handleSseStream.mockResolvedValue(undefined);

    const { result } = createHarness({
      activeVersionId: "ver_current",
      latestKnownVersionId: "ver_current",
    });

    await send(result, "Bygg integrationer nu");

    const meta = (capturedBody?.meta ?? {}) as Record<string, unknown>;
    expect(meta.lifecycleStage).toBeUndefined();
  });
});

/**
 * Outcome contract (BB#shadcn-lane1). The hook handles every failure path
 * itself and resolves instead of rejecting, so before this a caller could not
 * tell "generation started" from "rejected but handled" — the insert cards had
 * to fall back to neutral copy and still marked a rejected insert as sent.
 * Every exit path of `sendMessage` is pinned here.
 */
describe("useSendMessage outcome contract", () => {
  it("reports started/stream when the SSE turn runs", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    handleSseStream.mockResolvedValue(undefined);
    const { result } = createHarness();

    expect(await send(result, "Uppdatera hero copy")).toEqual({
      status: "started",
      via: "stream",
    });
  });

  it("reports started/new_chat when no chat existed yet", async () => {
    const { result } = createHarness({ chatId: null });

    expect(await send(result, "Bygg en portfoliosajt")).toEqual({
      status: "started",
      via: "new_chat",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports rejected/create_chat_failed when chat creation fails", async () => {
    const { result } = createHarness({ chatId: null }, { createNewChat: async () => false });

    expect(await send(result, "Bygg en portfoliosajt")).toEqual({
      status: "rejected",
      reason: "create_chat_failed",
      turnRecorded: false,
    });
  });

  it("reports rejected/empty_message for a blank prompt", async () => {
    const { result } = createHarness();

    expect(await send(result, "   ")).toEqual({
      status: "rejected",
      reason: "empty_message",
      turnRecorded: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports rejected/stale_base_version when the rebase retry also hits 409", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: "stale_base_version",
        reason: "stale_base_version",
        latestVersionId: "ver_new",
      }),
    );
    const { result } = createHarness({
      activeVersionId: "ver_old",
      latestKnownVersionId: "ver_old",
    });

    expect(await send(result, "Uppdatera hero copy")).toEqual({
      status: "rejected",
      reason: "stale_base_version",
      turnRecorded: false,
    });
  });

  it("does not rebase on a 409 generation_in_progress", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: "generation_in_progress",
        reason: "generation_in_progress",
      }),
    );
    const { result, mutateVersions } = createHarness({
      activeVersionId: "ver_old",
      latestKnownVersionId: "ver_old",
    });

    expect(await send(result, "Uppdatera hero copy")).toEqual({
      status: "rejected",
      reason: "generation_in_progress",
      turnRecorded: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(handleSseStream).not.toHaveBeenCalled();
    expect(mutateVersions).not.toHaveBeenCalled();
    expect(String(toast.error.mock.calls[0]?.[0])).toMatch(/generation pågår/i);
  });

  it("reports rejected/generation_lock_unavailable on a 503 from the lock", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, {
        error: "generation_lock_unavailable",
        reason: "generation_lock_unavailable",
      }),
    );
    const { result } = createHarness({
      activeVersionId: "ver_old",
      latestKnownVersionId: "ver_old",
    });

    expect(await send(result, "Uppdatera hero copy")).toEqual({
      status: "rejected",
      reason: "generation_lock_unavailable",
      turnRecorded: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(handleSseStream).not.toHaveBeenCalled();
    expect(String(toast.error.mock.calls[0]?.[0])).toMatch(/försök igen/i);
  });

  it("reports rejected/tier3_env_not_ready on a 412 from the F3 stream", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(412, {
        error: "tier3_env_not_ready",
        parentVersionId: "ver_f2_parent",
        projectId: "project_1",
        missingByIntegration: [{ key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] }],
      }),
    );
    const { result, messagesBox } = createHarness({ activeVersionId: "ver_f2_parent" });

    expect(
      await send(result, "Bygg integrationer nu.", {
        lifecycleStageOverride: "integrations",
        parentVersionIdOverride: "ver_f2_parent",
        engineBaseVersionIdOverride: "ver_f2_parent",
      }),
    ).toEqual({
      status: "rejected",
      reason: "tier3_env_not_ready",
      turnRecorded: false,
    });
    // The 412 also returns before the server persists the user row, so the
    // optimistic ghost goes away and only the assistant notice remains.
    expect(messagesBox.current.filter((m) => m.role === "user")).toEqual([]);
    expect(messagesBox.current.at(-1)?.content).toMatch(/build-nycklar/i);
  });

  // Not `rejected`: the nested finalize consumed the prompt (and promoted a
  // version here), so the composer must still clear its draft.
  it("reports settled/f3_deterministic_release when the turn becomes a ReleaseGate round", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/stream")) {
        return jsonResponse(409, {
          error: "f3_deterministic_release_required",
          parentVersionId: "ver_f2_parent",
        });
      }
      if (url.endsWith("/finalize-design")) {
        return jsonResponse(200, {
          ready: true,
          action: "deterministic_release",
          parentVersionId: "ver_f2_parent",
          versionId: "ver_f3_exact",
          gateRequired: true,
          releaseState: "draft",
          verificationState: "pending",
        });
      }
      return jsonResponse(200, {
        passed: true,
        promoted: true,
        vmGatePassed: true,
        checks: [{ check: "build", passed: true }],
      });
    });
    const { result, messagesBox } = createHarness({ activeVersionId: "ver_f2_parent" });

    expect(
      await send(result, "Bygg integrationer nu.", {
        lifecycleStageOverride: "integrations",
        parentVersionIdOverride: "ver_f2_parent",
        engineBaseVersionIdOverride: "ver_f2_parent",
      }),
    ).toEqual({ status: "settled", as: "f3_deterministic_release" });
    // Mirror image of the rejected paths: this one DOES persist the user row
    // server-side (`f3-readiness-gate.ts` addMessage), so the bubble stays.
    expect(messagesBox.current.filter((m) => m.role === "user")).toHaveLength(1);
  });

  /**
   * The nested finalize round has four verdicts and only the deterministic
   * release consumed the prompt. Collapsing the rest into `settled` told the
   * composer to clear a draft for a turn that built nothing (bugbot on #610).
   */
  describe("nested finalize verdicts are classified per verdict", () => {
    function stubFinalize(
      finalizeResponse: Response | (() => Response),
      // The gate reports whether it persisted the user row before its 409; the
      // auto-kick path (default) never does, the approve continuation does.
      userTurnPersisted = false,
    ) {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith("/stream")) {
          return jsonResponse(409, {
            error: "f3_deterministic_release_required",
            parentVersionId: "ver_f2_parent",
            userTurnPersisted,
          });
        }
        return typeof finalizeResponse === "function" ? finalizeResponse() : finalizeResponse;
      });
    }

    async function sendF3(result: Parameters<typeof send>[0]) {
      return send(result, "Bygg integrationer nu.", {
        lifecycleStageOverride: "integrations",
        parentVersionIdOverride: "ver_f2_parent",
        engineBaseVersionIdOverride: "ver_f2_parent",
      });
    }

    it("maps a missing_env verdict to the same rejection as a direct 412", async () => {
      stubFinalize(() =>
        jsonResponse(412, {
          ready: false,
          parentVersionId: "ver_f2_parent",
          projectId: "project_1",
          missingByIntegration: [{ key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] }],
        }),
      );
      const { result, messagesBox } = createHarness({ activeVersionId: "ver_f2_parent" });

      expect(await sendF3(result)).toEqual({
        status: "rejected",
        reason: "tier3_env_not_ready",
        turnRecorded: false,
      });
      expect(dispatchF3Requirements).toHaveBeenCalledTimes(1);
      // Auto-kick path: the gate persisted nothing, so the optimistic row is a
      // ghost and goes — keeping it would show a turn no reload can confirm
      // (Vercel Agent on #610).
      expect(messagesBox.current.filter((m) => m.role === "user")).toEqual([]);
      expect(messagesBox.current.at(-1)?.content).toMatch(/build-nycklar/i);
    });

    it("maps an llm_ready verdict to a rejection (user starts the build manually)", async () => {
      stubFinalize(() =>
        jsonResponse(200, {
          ready: true,
          action: "llm_build",
          parentVersionId: "ver_f2_parent",
          requirements: [],
        }),
      );
      const { result, messagesBox } = createHarness({ activeVersionId: "ver_f2_parent" });

      expect(await sendF3(result)).toEqual({
        status: "rejected",
        reason: "f3_build_required",
        turnRecorded: false,
      });
      expect(messagesBox.current.filter((m) => m.role === "user")).toEqual([]);
      expect(messagesBox.current.at(-1)?.content).toMatch(/previewpanelen/i);
    });

    // Mirror case: the approve continuation DID write the row, so the bubble
    // stays and the caller clears its draft instead (bugbot on #610). The two
    // cases differ only by what the gate reports.
    it("keeps the bubble when the gate reports it persisted the turn", async () => {
      stubFinalize(
        () =>
          jsonResponse(412, {
            ready: false,
            parentVersionId: "ver_f2_parent",
            projectId: "project_1",
            missingByIntegration: [{ key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] }],
          }),
        true,
      );
      const { result, messagesBox } = createHarness({ activeVersionId: "ver_f2_parent" });

      expect(await sendF3(result)).toEqual({
        status: "rejected",
        reason: "tier3_env_not_ready",
        turnRecorded: true,
      });
      expect(messagesBox.current.filter((m) => m.role === "user")).toHaveLength(1);
    });

    it("maps a finalize error to failed and keeps the user row", async () => {
      stubFinalize(() => jsonResponse(500, { error: "finalize blew up" }));
      const { result, messagesBox } = createHarness({ activeVersionId: "ver_f2_parent" });

      const outcome = await sendF3(result);
      expect(outcome.status).toBe("failed");
      // The prompt WAS sent, so the thread keeps it (only rejections drop it).
      expect(messagesBox.current.filter((m) => m.role === "user")).toHaveLength(1);
    });
  });

  it("does not start a second codegen when fetch fails with a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result, messagesBox } = createHarness();

    const outcome = await send(result, "Uppdatera hero copy");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${engineChatBaseUrl("chat_1")}/stream`);
    expect(fetchMock.mock.calls.some(([url]) => isMessagesUrl(url))).toBe(false);
    expect(outcome).toEqual({
      status: "failed",
      message: CREATE_CHAT_CONNECTION_BROKEN_MESSAGE,
    });
    expect(toast.error).toHaveBeenCalledWith(CREATE_CHAT_CONNECTION_BROKEN_MESSAGE);
    expect(String(toast.error.mock.calls[0]?.[0])).not.toMatch(/Failed to send message/i);
    const assistant = messagesBox.current.find((m) => m.role === "assistant");
    expect(assistant?.content).toContain(CREATE_CHAT_CONNECTION_BROKEN_MESSAGE);
    expect(assistant?.content).not.toMatch(/Failed to send message/i);
  });

  it("does not start a second codegen when an opened SSE stream disconnects", async () => {
    fetchMock.mockResolvedValue(sseResponse());
    handleSseStream.mockRejectedValue(new TypeError("network error"));
    const { result, messagesBox } = createHarness();

    const outcome = await send(result, "Uppdatera hero copy");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${engineChatBaseUrl("chat_1")}/stream`);
    expect(fetchMock.mock.calls.some(([url]) => isMessagesUrl(url))).toBe(false);
    expect(handleSseStream).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      status: "failed",
      message: CREATE_CHAT_CONNECTION_BROKEN_MESSAGE,
    });
    expect(toast.error).toHaveBeenCalledWith(CREATE_CHAT_CONNECTION_BROKEN_MESSAGE);
    expect(String(toast.error.mock.calls[0]?.[0])).not.toMatch(/Failed to send message/i);
    const assistant = messagesBox.current.find((m) => m.role === "assistant");
    expect(assistant?.content).toContain(CREATE_CHAT_CONNECTION_BROKEN_MESSAGE);
  });

  it("reports aborted/client when this client cancelled the stream", async () => {
    const { result, streamAbortRef } = createHarness();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    handleSseStream.mockImplementation(async () => {
      // Mirror `cancelActiveGeneration` / a newer send: our own controller is
      // aborted, then fetch/stream rejects with an abort-shaped error.
      streamAbortRef.current?.abort();
      throw new DOMException("The operation was aborted.", "AbortError");
    });

    expect(await send(result, "Uppdatera hero copy")).toEqual({
      status: "aborted",
      by: "client",
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports aborted/server when the stream dies without a client abort", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    handleSseStream.mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));
    const { result } = createHarness();

    expect(await send(result, "Uppdatera hero copy")).toEqual({
      status: "aborted",
      by: "server",
    });
    expect(String(toast.error.mock.calls[0]?.[0])).toMatch(/avbröts av servern/i);
  });

  it("reports failed with the surfaced message on an unexpected error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "boom" }));
    const { result } = createHarness();

    const outcome = await send(result, "Uppdatera hero copy");
    expect(outcome.status).toBe("failed");
    expect(outcome).toMatchObject({ message: expect.stringContaining("boom") });
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { ChatMessage } from "@/lib/builder/types";
import { DEFAULT_MODEL_TIER } from "@/lib/builder/defaults";
import type { AutoFixPayload, ChatMessagingParams, MessageOptions } from "./types";

const handleSseStream = vi.hoisted(() => vi.fn());
const dispatchF3Requirements = vi.hoisted(() => vi.fn());
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
vi.mock("./post-checks", () => ({ runPostGenerationChecks: vi.fn() }));
vi.mock("./post-checks-fetch", () => ({ triggerImageMaterialization: vi.fn() }));
vi.mock("./post-checks-preview", () => ({ readPreviewPreflight: vi.fn(() => null) }));
vi.mock("@/lib/builder/project-env-events", () => ({
  dispatchF3Requirements,
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

function createHarness(overrides?: Partial<ChatMessagingParams>) {
  const messagesBox = { current: [] as ChatMessage[] };
  const setMessages = vi.fn((next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    messagesBox.current =
      typeof next === "function" ? next(messagesBox.current) : next;
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
    createNewChat: vi.fn(async () => true),
    streamAbortRef: { current: null } as MutableRefObject<AbortController | null>,
    autoFixHandlerRef: { current: vi.fn() } as MutableRefObject<
      (payload: AutoFixPayload) => void
    >,
    lastSentSystemPromptRef: { current: null } as MutableRefObject<string | null>,
    startStreamSafetyTimer: vi.fn(),
    touchStreamSafetyTimer: vi.fn(),
    clearStreamSafetyTimer: vi.fn(),
  };

  const { result } = renderHook(() => useSendMessage(params, deps));
  return { result, messagesBox, mutateVersions };
}

async function send(
  result: { current: { sendMessage: (text: string, options?: MessageOptions) => Promise<void> } },
  text: string,
  options?: MessageOptions,
) {
  await act(async () => {
    await result.current.sendMessage(text, options);
  });
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
    const userMessages = messages.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]?.content).toBe("Uppdatera hero copy");

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
    expect(messagesBox.current.at(-1)?.content).toContain(
      "exakt samma filer",
    );
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

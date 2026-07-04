import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSSEBuffer } from "@/lib/gen/stream/sse-parser";
import { formatSSEEvent } from "@/lib/streaming";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";

const finalizeAndSaveVersionMock = vi.hoisted(() => vi.fn());
const addMessageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get() { return vi.fn(); } }),
  dbConfigured: false,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  addMessage: addMessageMock,
  failVersionVerification: vi.fn(),
}));

vi.mock("@/lib/gen/stream/finalize-version", () => ({
  EmptyGenerationError: class EmptyGenerationError extends Error {
    readonly chatId: string;
    readonly scaffoldId: string | null;
    constructor(chatId: string, scaffoldId: string | null) {
      super("Generation produced no code output");
      this.name = "EmptyGenerationError";
      this.chatId = chatId;
      this.scaffoldId = scaffoldId;
    }
  },
  finalizeAndSaveVersion: finalizeAndSaveVersionMock,
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
  devLogFinalizeSite: vi.fn(),
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  warnLog: vi.fn(),
}));

import { createOwnEngineGenerationStream } from "./generation-stream";
import { devLogAppend } from "@/lib/logging/devLog";

async function collectSseEvents(stream: ReadableStream<Uint8Array>): Promise<
  Array<{ event: string; data: unknown }>
> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  const events: Array<{ event: string; data: unknown }> = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const parsed = parseSSEBuffer(buffer);
    events.push(...parsed.events);
    buffer = parsed.remaining;
  }
  buffer += dec.decode();
  if (buffer.trim()) {
    const parsed = parseSSEBuffer(`${buffer}\n`);
    events.push(...parsed.events);
  }
  return events;
}

function pipelineStreamFromSsePayload(payload: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
}

describe("createOwnEngineGenerationStream (golden SSE)", () => {
  const commitCredits = vi.fn().mockResolvedValue(undefined);

  const mockFinalizeResult: FinalizeResult = {
    version: { id: "ver_golden_1" } as FinalizeResult["version"],
    messageId: "msg_golden_1",
    telemetryRecordId: null,
    previewUrl: "https://preview.example/golden",
    tier2PreviewUrl: null,
    filesJson: "{}",
    contentForVersion: "golden-content",
    preflight: {
      previewBlocked: false,
      verificationBlocked: false,
      previewBlockingReason: null,
      primaryPreviewTarget: "none",
      previewStart: {
        canStartPreview: false,
        primaryPreviewTarget: "none",
        shimBlocked: false,
        requiresEnvConfig: false,
        hasCriticalInstallRisk: false,
        hasCriticalCodeFailure: false,
        compatibilityPreviewAllowed: false,
        issueCounts: {
          code_structure_failure: 0,
          dependency_install_failure: 0,
          env_config_missing: 0,
          shim_preview_failure: 0,
          non_blocking_quality_warning: 0,
        },
        blockingCategories: [],
      },
      issueCount: 0,
      errorCount: 0,
      warningCount: 0,
    },
    rejectedShrinks: [],
    rejectedStructural: [],
    crossFileStubs: [],
  };

  beforeEach(() => {
    finalizeAndSaveVersionMock.mockReset();
    finalizeAndSaveVersionMock.mockResolvedValue(mockFinalizeResult);
    addMessageMock.mockReset();
    addMessageMock.mockResolvedValue(null);
    commitCredits.mockClear();
    commitCredits.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("emits chatId, meta, forwarded content, then done with version after pipeline done", async () => {
    const pipelinePayload =
      formatSSEEvent("content", { text: "### Out\n\nHello from pipeline." }) +
      formatSSEEvent("done", { promptTokens: 3, completionTokens: 4 });

    const out = createOwnEngineGenerationStream({
      chatId: "chat_golden",
      pipelineStream: pipelineStreamFromSsePayload(pipelinePayload),
      meta: {
        modelId: "gpt-5.4",
        modelTier: "pro",
        buildProfileId: "default",
        buildProfileLabel: "Default",
        enginePath: "own-engine",
        thinking: false,
      },
      engineModel: "gpt-5.4",
      optimizedMessage: "build me a page",
      engineIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 48_000,
          refsChars: 24_000,
          systemContextChars: 96_000,
        },
      },
      routePlan: null,
      resolvedScaffold: null,
      urlMap: {},
      commitCredits,
    });

    const events = await collectSseEvents(out);
    const names = events.map((e) => e.event);

    expect(names[0]).toBe("chatId");
    expect(names[1]).toBe("meta");
    expect(names[names.length - 1]).toBe("done");

    expect(events[0]?.data).toEqual({ id: "chat_golden" });
    expect((events[1]?.data as Record<string, unknown>).enginePath).toBe("own-engine");
    const contentPayload = events
      .filter((e) => e.event === "content")
      .map((e) => e.data)
      .join("");
    expect(contentPayload).toContain("Hello from pipeline.");

    const doneData = events.at(-1)?.data as Record<string, unknown>;
    expect(doneData.chatId).toBe("chat_golden");
    expect(doneData.versionId).toBe("ver_golden_1");
    expect(doneData.messageId).toBe("msg_golden_1");
    expect(doneData.previewUrl).toBeNull();
    expect(doneData.previewBlocked).toBe(false);
    expect(doneData.verificationBlocked).toBe(false);

    expect(finalizeAndSaveVersionMock).toHaveBeenCalledTimes(1);
    const finalizeArg = finalizeAndSaveVersionMock.mock.calls[0]?.[0] as {
      accumulatedContent: string;
      chatId: string;
    };
    expect(finalizeArg.chatId).toBe("chat_golden");
    expect(finalizeArg.accumulatedContent).toContain("Hello from pipeline.");

    expect(commitCredits).toHaveBeenCalled();
  });

  it("forwards accumulatedThinkingRef.current into finalize at done time", async () => {
    const pipelinePayload =
      formatSSEEvent("content", { text: "code" }) +
      formatSSEEvent("done", { promptTokens: 1, completionTokens: 1 });

    // Simulates the pipeline reporting the accumulated reasoning before
    // the SSE consumer processes the `done` event (matches the real
    // ordering enforced in `stream-format.ts`).
    const ref = { current: "I picked the hero scaffold because…" };

    const out = createOwnEngineGenerationStream({
      chatId: "chat_thinking",
      pipelineStream: pipelineStreamFromSsePayload(pipelinePayload),
      meta: {
        modelId: "gpt-5.4",
        modelTier: "pro",
        buildProfileId: "default",
        buildProfileLabel: "Default",
        enginePath: "own-engine",
        thinking: true,
      },
      engineModel: "gpt-5.4",
      optimizedMessage: "build me a page",
      engineIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 48_000,
          refsChars: 24_000,
          systemContextChars: 96_000,
        },
      },
      routePlan: null,
      resolvedScaffold: null,
      urlMap: {},
      commitCredits,
      accumulatedThinkingRef: ref,
    });

    await collectSseEvents(out);

    expect(finalizeAndSaveVersionMock).toHaveBeenCalledTimes(1);
    const finalizeArg = finalizeAndSaveVersionMock.mock.calls[0]?.[0] as {
      accumulatedThinking?: string | null;
    };
    expect(finalizeArg.accumulatedThinking).toBe("I picked the hero scaffold because…");
  });

  it("turns tool-only suggestIntegration output into explicit awaiting input", async () => {
    const EmptyGenerationError = (await import("@/lib/gen/stream/finalize-version"))
      .EmptyGenerationError;
    finalizeAndSaveVersionMock.mockRejectedValueOnce(
      new EmptyGenerationError("chat_tool_only", null),
    );
    const pipelinePayload =
      formatSSEEvent("tool-call", {
        toolName: "suggestIntegration",
        args: {
          provider: "stripe",
          name: "Stripe",
          envVars: ["STRIPE_SECRET_KEY"],
        },
      }) +
      formatSSEEvent("done", { promptTokens: 2, completionTokens: 1 });

    const out = createOwnEngineGenerationStream({
      chatId: "chat_tool_only",
      pipelineStream: pipelineStreamFromSsePayload(pipelinePayload),
      meta: {
        modelId: "gpt-5.4",
        modelTier: "pro",
        buildProfileId: "default",
        buildProfileLabel: "Default",
        enginePath: "own-engine",
        thinking: false,
      },
      engineModel: "gpt-5.4",
      optimizedMessage: "bygg integrationer",
      engineIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "local-layout",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity3",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 48_000,
          refsChars: 24_000,
          systemContextChars: 96_000,
        },
      },
      routePlan: null,
      resolvedScaffold: null,
      urlMap: {},
      commitCredits,
      lifecycleParentVersionId: "ver_f2_parent",
    });

    const events = await collectSseEvents(out);
    const doneData = events.find((event) => event.event === "done")?.data as Record<
      string,
      unknown
    >;

    expect(doneData.versionId).toBeNull();
    expect(doneData.awaitingInput).toBe(true);
    expect(doneData.reason).toBe("tool_only_empty_generation");
    expect(doneData.toolCalls).toEqual(["suggestIntegration"]);
    expect(String(doneData.awaitingInputPrompt)).toContain("Integrationer signalerades");
    expect(events.some((event) => event.event === "integration")).toBe(true);
    expect(events.some((event) => event.event === "content")).toBe(true);
    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({
        type: "site.awaiting_input",
        chatId: "chat_tool_only",
        reason: "tool_only_empty_generation",
        toolCalls: ["suggestIntegration"],
      }),
    );

    // P1 F3-entry: the awaiting-input question is persisted WITH the
    // F3-continuation marker so the follow-up route can inherit the
    // integrations stage server-side for the user's direct reply.
    expect(addMessageMock).toHaveBeenCalledTimes(1);
    const [persistChatId, persistRole, persistContent, , persistUiParts] =
      addMessageMock.mock.calls[0] as [
        string,
        string,
        string,
        unknown,
        Array<Record<string, unknown>>,
      ];
    expect(persistChatId).toBe("chat_tool_only");
    expect(persistRole).toBe("assistant");
    expect(persistContent).toContain("Integrationer signalerades");
    const markerOutput = persistUiParts?.[0]?.output as Record<string, unknown>;
    expect(persistUiParts?.[0]?.type).toBe("tool:awaiting-input");
    expect(markerOutput.f3Continuation).toBe(true);
    expect(markerOutput.lifecycleStage).toBe("integrations");
    expect(markerOutput.parentVersionId).toBe("ver_f2_parent");
    // P2 F3-loop: the marker carries the signaled providers (approval →
    // dossier-capability injection) and the loop-breaker round counter.
    expect(markerOutput.suggestedProviders).toEqual(["stripe"]);
    expect(markerOutput.toolOnlyRounds).toBe(1);
    // Canonical quick-replies persisted (server classifies against these) and
    // a toolName that must not trip the client's integration/env filters.
    expect(markerOutput.options).toEqual(["Godkänn förslag", "Avvisa förslag", "Annat"]);
    expect(String(persistUiParts?.[0]?.toolName).toLowerCase()).not.toContain("integration");
  });

  it("does NOT persist an F3-continuation marker for an F2 (fidelity2) tool-only run", async () => {
    const EmptyGenerationError = (await import("@/lib/gen/stream/finalize-version"))
      .EmptyGenerationError;
    finalizeAndSaveVersionMock.mockRejectedValueOnce(
      new EmptyGenerationError("chat_f2_tool_only", null),
    );
    // In F2 a well-formed suggestIntegration is still REGISTERED (the SSE is
    // dropped — F2-mute net) so the run parks in the same awaiting-input
    // prompt. The F3-continuation marker must NOT be persisted here: an F2
    // reply must never inherit the integrations stage.
    const pipelinePayload =
      formatSSEEvent("tool-call", {
        toolName: "suggestIntegration",
        args: {
          provider: "stripe",
          name: "Stripe",
          envVars: ["STRIPE_SECRET_KEY"],
        },
      }) +
      formatSSEEvent("done", { promptTokens: 2, completionTokens: 1 });

    const out = createOwnEngineGenerationStream({
      chatId: "chat_f2_tool_only",
      pipelineStream: pipelineStreamFromSsePayload(pipelinePayload),
      meta: {
        modelId: "gpt-5.4",
        modelTier: "pro",
        buildProfileId: "default",
        buildProfileLabel: "Default",
        enginePath: "own-engine",
        thinking: false,
      },
      engineModel: "gpt-5.4",
      optimizedMessage: "uppdatera hero",
      engineIntent: "website",
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "local-layout",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 48_000,
          refsChars: 24_000,
          systemContextChars: 96_000,
        },
      },
      routePlan: null,
      resolvedScaffold: null,
      urlMap: {},
      commitCredits,
    });

    const events = await collectSseEvents(out);
    const doneData = events.find((event) => event.event === "done")?.data as Record<
      string,
      unknown
    >;

    expect(doneData.versionId).toBeNull();
    // Same awaiting-input contract as before (pinned by stream/route.test.ts)…
    expect(doneData.reason).toBe("tool_only_empty_generation");
    // …but no F3 marker: the reply to an F2 run must not inherit F3.
    expect(addMessageMock).not.toHaveBeenCalled();
  });

  // ── P2 F3-loop: loop-breaker rounds (BUG-SWARM-BACKLOG åtgärd 3) ─────────
  const f3ToolOnlyBuildSpec = {
    buildIntent: "website",
    generationMode: "followUp",
    changeScope: "local-layout",
    scaffoldId: null,
    routePlanSummary: "prompt:one-page:/",
    stylePack: "brand-led",
    qualityTarget: "standard",
    previewPolicy: "fidelity3",
    verificationPolicy: "standard",
    contextPolicy: "normal",
    referenceCategories: ["marketing-sites"],
    forbiddenPatterns: ["leave_bracket_placeholders"],
    tokenBudgets: {
      scaffoldChars: 48_000,
      refsChars: 24_000,
      systemContextChars: 96_000,
    },
  } as Parameters<typeof createOwnEngineGenerationStream>[0]["buildSpec"];

  function f3ToolOnlyStreamParams(
    chatId: string,
    priorRounds: number,
  ): Parameters<typeof createOwnEngineGenerationStream>[0] {
    const pipelinePayload =
      formatSSEEvent("tool-call", {
        toolName: "suggestIntegration",
        args: {
          provider: "stripe",
          name: "Stripe",
          envVars: ["STRIPE_SECRET_KEY"],
        },
      }) + formatSSEEvent("done", { promptTokens: 2, completionTokens: 1 });
    return {
      chatId,
      pipelineStream: pipelineStreamFromSsePayload(pipelinePayload),
      meta: {
        modelId: "gpt-5.4",
        modelTier: "pro",
        buildProfileId: "default",
        buildProfileLabel: "Default",
        enginePath: "own-engine",
        thinking: false,
      },
      engineModel: "gpt-5.4",
      optimizedMessage: "Godkänn förslag",
      engineIntent: "website",
      buildSpec: f3ToolOnlyBuildSpec,
      routePlan: null,
      resolvedScaffold: null,
      urlMap: {},
      commitCredits,
      lifecycleParentVersionId: "ver_f2_parent",
      f3PriorToolOnlyRounds: priorRounds,
    };
  }

  it("round 2 (approval STILL tool-only): persists a closure-offering marker, not the identical question", async () => {
    const EmptyGenerationError = (await import("@/lib/gen/stream/finalize-version"))
      .EmptyGenerationError;
    finalizeAndSaveVersionMock.mockRejectedValueOnce(
      new EmptyGenerationError("chat_loop_2", null),
    );

    const out = createOwnEngineGenerationStream(f3ToolOnlyStreamParams("chat_loop_2", 1));
    const events = await collectSseEvents(out);
    const doneData = events.find((e) => e.event === "done")?.data as Record<string, unknown>;

    expect(doneData.reason).toBe("tool_only_empty_generation");
    expect(doneData.awaitingInput).toBe(true);
    // Honest loop-breaker copy — offers closure instead of an identical loop.
    expect(String(doneData.awaitingInputPrompt)).toContain("försöka en sista gång");
    expect(String(doneData.awaitingInputPrompt)).not.toContain(
      "Integrationer signalerades",
    );

    expect(addMessageMock).toHaveBeenCalledTimes(1);
    const [, , persistContent, , persistUiParts] = addMessageMock.mock.calls[0] as [
      string,
      string,
      string,
      unknown,
      Array<Record<string, unknown>>,
    ];
    expect(persistContent).toContain("försöka en sista gång");
    const markerOutput = persistUiParts?.[0]?.output as Record<string, unknown>;
    expect(markerOutput.f3Continuation).toBe(true);
    expect(markerOutput.toolOnlyRounds).toBe(2);
    expect(markerOutput.suggestedProviders).toEqual(["stripe"]);
  });

  it("round 3 (second repeated tool-only): terminal calm close — NO new marker, no awaiting-input", async () => {
    const EmptyGenerationError = (await import("@/lib/gen/stream/finalize-version"))
      .EmptyGenerationError;
    finalizeAndSaveVersionMock.mockRejectedValueOnce(
      new EmptyGenerationError("chat_loop_3", null),
    );

    const out = createOwnEngineGenerationStream(f3ToolOnlyStreamParams("chat_loop_3", 2));
    const events = await collectSseEvents(out);
    const doneData = events.find((e) => e.event === "done")?.data as Record<string, unknown>;

    expect(doneData.reason).toBe("tool_only_rounds_exhausted");
    expect(doneData.awaitingInput).toBe(false);
    expect(doneData.versionId).toBeNull();

    // A terminal assistant message IS persisted — but WITHOUT any
    // F3-continuation marker (no ui_parts), so the next user message runs
    // as a plain F2 follow-up instead of a third identical dialog.
    expect(addMessageMock).toHaveBeenCalledTimes(1);
    const persistArgs = addMessageMock.mock.calls[0] as unknown[];
    expect(String(persistArgs[2])).toContain("Integrationsbygget avslutades");
    expect(persistArgs[4]).toBeUndefined();

    const contentPayload = events
      .filter((e) => e.event === "content")
      .map((e) => e.data)
      .join("");
    expect(contentPayload).toContain("Integrationsbygget avslutades");
  });

  it("does NOT claim 'Integrationer signalerades' when every suggestIntegration was malformed (P2 F3-loop åtgärd 5 residual)", async () => {
    const EmptyGenerationError = (await import("@/lib/gen/stream/finalize-version"))
      .EmptyGenerationError;
    finalizeAndSaveVersionMock.mockRejectedValueOnce(
      new EmptyGenerationError("chat_malformed_only", null),
    );
    // Malformed: no provider, generic name, no envVars — the #375 guard
    // drops it and must NOT register it in toolCallNames.
    const pipelinePayload =
      formatSSEEvent("tool-call", {
        toolName: "suggestIntegration",
        args: { name: "integration" },
      }) + formatSSEEvent("done", { promptTokens: 2, completionTokens: 1 });

    const out = createOwnEngineGenerationStream({
      ...f3ToolOnlyStreamParams("chat_malformed_only", 0),
      pipelineStream: pipelineStreamFromSsePayload(pipelinePayload),
    });
    const events = await collectSseEvents(out);
    const doneData = events.find((e) => e.event === "done")?.data as Record<string, unknown>;

    // Nothing survived → honest generic empty-generation copy, no ghost
    // "Integrationer signalerades" question and no F3 marker.
    expect(doneData.toolCalls).toEqual([]);
    expect(doneData.awaitingInput).toBe(false);
    expect(addMessageMock).not.toHaveBeenCalled();
    const contentPayload = events
      .filter((e) => e.event === "content")
      .map((e) => e.data)
      .join("");
    expect(contentPayload).not.toContain("Integrationer signalerades");
    expect(contentPayload).toContain("Ingen kod genererades");
  });
});

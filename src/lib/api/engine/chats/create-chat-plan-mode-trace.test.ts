/**
 * Init-turens plan-läge måste lämna samma entry/exit-spår som follow-up.
 *
 * Bakgrund (prod chat `f550445e`, 2026-09-15): tre `plan_mode_turn_exit`
 * syntes, men init-turen saknade rader och fick rekonstrueras ur DB.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  addMessage: vi.fn(),
}));
vi.mock("@/lib/db/services/prompt-logs", () => ({ createPromptLog: vi.fn() }));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/own-engine/session/own-engine-plan-mode", () => ({
  createPlanModePipelineStream: vi.fn(),
  resolvePlanModePlannerSettings: vi.fn(),
}));

import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createPromptLog } from "@/lib/db/services/prompt-logs";
import { createPlanModePipelineStream } from "@/lib/own-engine/session/own-engine-plan-mode";
import { formatSSEEvent } from "@/lib/streaming";
import {
  CREATE_CHAT_PLAN_MODE_FOLLOW_UP_INTENT,
  startTracedCreateChatPlanModeResponse,
} from "./create-chat-plan-mode-trace";
import {
  PLAN_MODE_TURN_ENTRY_EVENT,
  PLAN_MODE_TURN_EXIT_EVENT,
} from "./chat-message-stream/plan-mode-trace";

const CHAT_ID = "chat_init_plan_1";

function pipelineStream(
  events: Array<{ event: string; data: unknown }>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(encoder.encode(formatSSEEvent(evt.event, evt.data)));
      }
      controller.close();
    },
  });
}

function initParams(): Parameters<typeof startTracedCreateChatPlanModeResponse>[0] {
  return {
    chatId: CHAT_ID,
    sessionId: "sess_1",
    userId: "user_1",
    appProjectId: "app_1",
    modelTier: "max",
    buildProfileId: "max",
    buildProfileLabel: "Max",
    plannerSettings: {
      modelId: "test-planner-model",
      thinking: true,
      reasoningEffort: "medium",
    },
    planModel: "test-planner-model",
    message: "Planera en marknadssajt",
    optimizedMessage: "Planera en marknadssajt",
    planSystemPrompt: "PLAN SYSTEM",
    abortSignal: new AbortController().signal,
    referenceAttachments: [],
    promptStrategyMeta: { strategy: "none", promptType: "freeform" },
    buildSpec: {
      buildIntent: "website",
      generationMode: "init",
      changeScope: "redesign",
      scaffoldId: "landing-page",
      routePlanSummary: "prompt:one-page:/",
      stylePack: "brand-led",
      qualityTarget: "standard",
      previewPolicy: "fidelity2",
      verificationPolicy: "standard",
      contextPolicy: "normal",
      referenceCategories: ["marketing-sites"],
      forbiddenPatterns: ["leave_bracket_placeholders"],
      tokenBudgets: { scaffoldChars: 48000, refsChars: 24000, systemContextChars: 96000 },
    } as Parameters<typeof startTracedCreateChatPlanModeResponse>[0]["buildSpec"],
    resolvedScaffold: null,
    variantTemplateId: null,
    scaffoldMode: "auto",
    promptSourceKind: "user",
    commitCredits: vi.fn(),
    promptStartedAt: Date.now(),
  };
}

async function runInit(
  events: Array<{ event: string; data: unknown }>,
): Promise<string> {
  vi.mocked(createPlanModePipelineStream).mockReturnValue(
    pipelineStream(events) as unknown as ReturnType<typeof createPlanModePipelineStream>,
  );
  const response = await startTracedCreateChatPlanModeResponse(initParams());
  return await response.text();
}

function traceRow(event: string): Record<string, unknown> | undefined {
  return vi
    .mocked(createPromptLog)
    .mock.calls.map(([payload]) => payload as unknown as Record<string, unknown>)
    .find((payload) => payload.event === event);
}

function assistantMessageCall(): unknown[] | undefined {
  return vi.mocked(chatRepo.addMessage).mock.calls.find((call) => call[1] === "assistant");
}

function resetInitMocks(): void {
  vi.clearAllMocks();
  vi.mocked(chatRepo.addMessage).mockReset();
  vi.mocked(createPromptLog).mockReset();
}

describe("startTracedCreateChatPlanModeResponse — init-spår", () => {
  beforeEach(resetInitMocks);

  it("skriver entry+exit med plan_persisted när init-planen lyckas", async () => {
    const body = await runInit([
      {
        event: "tool-call",
        data: {
          toolName: "emitPlanArtifact",
          toolCallId: "call_1",
          args: {
            goal: "Bygg en marknadssajt",
            scope: ["hero"],
            pages: [{ path: "/", name: "Start", intent: "sälja" }],
          },
        },
      },
      { event: "done", data: {} },
    ]);

    const entry = traceRow(PLAN_MODE_TURN_ENTRY_EVENT);
    expect(entry).toMatchObject({
      chatId: CHAT_ID,
      sessionId: "sess_1",
      userId: "user_1",
      appProjectId: "app_1",
      modelTier: "max",
    });
    expect(entry?.meta).toMatchObject({
      planMode: true,
      phase: "entry",
      plannerModel: "test-planner-model",
      followUpIntent: CREATE_CHAT_PLAN_MODE_FOLLOW_UP_INTENT,
      hasFollowUpBase: false,
      previousFilesCount: 0,
      promptSourceKind: "user",
    });
    expect(entry?.meta).not.toHaveProperty("prompt");
    expect(entry?.meta).not.toHaveProperty("optimizedPrompt");

    expect(assistantMessageCall()?.[2]).toContain("Plan skapad");
    expect(traceRow(PLAN_MODE_TURN_EXIT_EVENT)?.meta).toMatchObject({
      planMode: true,
      phase: "exit",
      outcome: "plan_persisted",
      assistantMessagePersisted: true,
      hasPlanArtifact: true,
    });
    expect(body).toContain("event: done");
  });

  it("skriver ändå en exit när planner-anropet kastar", async () => {
    vi.mocked(createPlanModePipelineStream).mockImplementation(() => {
      throw new Error("planner boom");
    });

    await expect(startTracedCreateChatPlanModeResponse(initParams())).rejects.toThrow(
      "planner boom",
    );

    expect(traceRow(PLAN_MODE_TURN_ENTRY_EVENT)).toBeDefined();
    expect(assistantMessageCall()?.[2]).toBe(
      "Planeringen kunde inte slutföras: planner boom",
    );
    expect(traceRow(PLAN_MODE_TURN_EXIT_EVENT)?.meta).toMatchObject({
      outcome: "planner_error_persisted",
      assistantMessagePersisted: true,
      hasPlanArtifact: false,
      hasBlockers: true,
      contentChars: 0,
      upstreamError: "planner boom",
    });
  });
});

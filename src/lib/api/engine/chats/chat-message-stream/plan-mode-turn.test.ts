/**
 * Plan-lägets follow-up-tur måste alltid lämna EN assistentrad och EN
 * spårrad efter sig.
 *
 * Bakgrund (prod chat `785c8d7a`, 2026-07-30): turen persisterade bara ett svar
 * när planner-utdatan gick att läsa som plan. En icke-plan-utdata fanns bara i
 * SSE-strömmen och försvann vid reload, medan raden som sparades påstod att en
 * plan skapats. Tre sändningar lämnade dessutom inget spår alls — därav
 * entry/exit-raderna i `plan-mode-trace.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  addMessage: vi.fn(),
  updateChatScaffoldId: vi.fn(),
}));
vi.mock("@/lib/db/services/prompt-logs", () => ({ createPromptLog: vi.fn() }));
vi.mock("@/lib/logging/devLog", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn() }));
vi.mock("@/lib/gen/orchestrate", () => ({ prepareGenerationContext: vi.fn() }));
vi.mock("../follow-up-orchestration-input", () => ({
  buildFollowUpOrchestrationInput: vi.fn(() => ({})),
}));
vi.mock("@/lib/observability/prompt-to-done-stream", () => ({
  withPromptToDoneMetricResponse: (response: Response) => response,
}));
vi.mock("@/lib/own-engine/session/own-engine-plan-mode", () => ({
  computePlanModePlannerPrompts: vi.fn(() => ({
    planPreamble: "PREAMBLE",
    planSystemPrompt: "PLAN SYSTEM",
  })),
  createPlanModePipelineStream: vi.fn(),
  dumpPlanModePlannerPrompts: vi.fn(),
  logPlanModeGenerationStart: vi.fn(),
  resolvePlanModePlannerSettings: vi.fn(() => ({
    modelId: "test-planner-model",
    thinking: true,
    reasoningEffort: "medium",
  })),
}));

import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createPromptLog } from "@/lib/db/services/prompt-logs";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import { createPlanModePipelineStream } from "@/lib/own-engine/session/own-engine-plan-mode";
import { formatSSEEvent } from "@/lib/streaming";
import {
  PLAN_MODE_TURN_ENTRY_EVENT,
  PLAN_MODE_TURN_EXIT_EVENT,
} from "./plan-mode-trace";
import { runPlanModeTurn } from "./plan-mode-turn";

const CHAT_ID = "chat_plan_1";

/** Fejkad planner-pipeline: samma SSE-format som den riktiga strömmen. */
function pipelineStream(events: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
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

function turnParams(): Parameters<typeof runPlanModeTurn>[0] {
  return {
    chatId: CHAT_ID,
    engineChat: { id: CHAT_ID, messages: [], orchestration_snapshot: null },
    message: "Hur går det?",
    optimizedMessage: "Hur går det?",
    followUpIntentMessage: "Hur går det?",
    metaBuildIntent: "website",
    metaScaffoldMode: "auto",
    parsedMeta: {
      scaffoldMode: "auto",
      scaffoldId: null,
      appProjectId: "app_1",
      promptSourceKind: "autofix",
    },
    resolvedImageGenerations: true,
    resolvedModelTier: "max",
    resolvedThinking: true,
    buildProfileId: "max",
    designReferences: null,
    persistedScaffoldId: null,
    importedRepoMode: false,
    previousFiles: [],
    hasFollowUpBase: false,
    ignorePersistedScaffoldForMatch: false,
    promptOrchestration: { strategyMeta: {} },
    existingRoutePaths: [],
    existingShellRoutePaths: [],
    followUpCapabilityDetection: { capabilities: [], capabilityIds: [] },
    followUpIntent: "neutral",
    requestAttachments: [],
    commitCreditsOnce: vi.fn(),
    promptStartedAt: Date.now(),
    sessionId: "sess_1",
    usageOwnerId: "user_1",
    req: new Request("https://example.com/api/engine/chats/chat_plan_1/stream", {
      method: "POST",
    }),
    attachSessionCookie: (response: Response) => response,
  } as unknown as Parameters<typeof runPlanModeTurn>[0];
}

/** Kör turen till slut — strömmen persisterar först när den är helt läst. */
async function runTurn(
  events: Array<{ event: string; data: unknown }>,
): Promise<string> {
  vi.mocked(createPlanModePipelineStream).mockReturnValue(
    pipelineStream(events) as unknown as ReturnType<typeof createPlanModePipelineStream>,
  );
  const response = await runPlanModeTurn(turnParams());
  return await response.text();
}

function traceRow(event: string): Record<string, unknown> | undefined {
  return vi
    .mocked(createPromptLog)
    .mock.calls.map(([payload]) => payload as unknown as Record<string, unknown>)
    .find((payload) => payload.event === event);
}

function assistantMessageCall(): unknown[] | undefined {
  return vi
    .mocked(chatRepo.addMessage)
    .mock.calls.find((call) => call[1] === "assistant");
}

/** `clearAllMocks` nollar bara anropslistorna — implementationer läcker annars. */
function resetTurnMocks(): void {
  vi.clearAllMocks();
  vi.mocked(chatRepo.addMessage).mockReset();
  vi.mocked(createPromptLog).mockReset();
  vi.mocked(prepareGenerationContext).mockResolvedValue({
    buildSpec: { qualityTarget: "f2", contextPolicy: "follow-up" },
    resolvedScaffold: null,
    variantTemplateReferenceAttachments: [],
  } as unknown as Awaited<ReturnType<typeof prepareGenerationContext>>);
}

describe("runPlanModeTurn — persistering av planner-svaret", () => {
  beforeEach(resetTurnMocks);

  it("persisterar planner-prosan när utdatan INTE är en plan", async () => {
    const body = await runTurn([
      { event: "content", data: { text: "Bygget är klart, men previewen svarar inte." } },
      { event: "done", data: {} },
    ]);

    const call = assistantMessageCall();
    expect(call).toBeDefined();
    expect(call?.[2]).toBe("Bygget är klart, men previewen svarar inte.");
    // Ingen plan-uiPart för en icke-plan-utdata.
    expect(call?.[4]).toBeUndefined();
    // Den gamla lögnen får inte tillbaka: ingen påhittad plansummering.
    expect(call?.[2]).not.toContain("Plan skapad");
    expect(body).toContain("event: done");
  });

  it("persiterar en förklaring när planner-turen varken gav plan eller text", async () => {
    await runTurn([{ event: "done", data: {} }]);

    const call = assistantMessageCall();
    expect(call?.[2]).toBe("Planeraren returnerade inget svar. Skicka meddelandet igen.");
    expect(traceRow(PLAN_MODE_TURN_EXIT_EVENT)?.meta).toMatchObject({
      outcome: "planner_empty_persisted",
      assistantMessagePersisted: true,
    });
  });

  it("persisterar felet i stället för en plansummering när strömmen fallerar", async () => {
    await runTurn([{ event: "error", data: { message: "planner timeout" } }]);

    expect(assistantMessageCall()?.[2]).toBe(
      "Planeringen kunde inte slutföras: planner timeout",
    );
    expect(traceRow(PLAN_MODE_TURN_EXIT_EVENT)?.meta).toMatchObject({
      outcome: "planner_error_persisted",
      upstreamError: "planner timeout",
    });
  });

  it("behåller plansummering + plan-uiPart när utdatan ÄR en plan", async () => {
    await runTurn([
      {
        event: "tool-call",
        data: {
          toolName: "emitPlanArtifact",
          toolCallId: "call_1",
          args: {
            goal: "Bygg om startsidan",
            scope: ["hero", "priser"],
            pages: [{ path: "/", name: "Start", intent: "sälja" }],
          },
        },
      },
      { event: "done", data: {} },
    ]);

    const call = assistantMessageCall();
    expect(call?.[2]).toContain("Plan skapad");
    expect(Array.isArray(call?.[4])).toBe(true);
    expect((call?.[4] as Array<{ type: string }>)[0].type).toBe("plan");
    expect(traceRow(PLAN_MODE_TURN_EXIT_EVENT)?.meta).toMatchObject({
      outcome: "plan_persisted",
      hasPlanArtifact: true,
    });
  });
});

describe("runPlanModeTurn — spår som gör en tyst sändning synlig", () => {
  beforeEach(resetTurnMocks);

  it("skriver en entry-rad innan planner-strömmen returneras", async () => {
    await runTurn([{ event: "done", data: {} }]);

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
      promptSourceKind: "autofix",
    });
  });

  it("rapporterar persist_failed i stället för att svälja ett misslyckat insert", async () => {
    vi.mocked(chatRepo.addMessage).mockImplementation(async (_chatId, role) => {
      if (role === "assistant") throw new Error("insert failed");
      return undefined as unknown as Awaited<ReturnType<typeof chatRepo.addMessage>>;
    });

    const body = await runTurn([
      { event: "content", data: { text: "svar" } },
      { event: "done", data: {} },
    ]);

    expect(traceRow(PLAN_MODE_TURN_EXIT_EVENT)?.meta).toMatchObject({
      outcome: "persist_failed",
      assistantMessagePersisted: false,
      persistError: "insert failed",
    });
    // Ett misslyckat insert får inte fälla strömmen.
    expect(body).toContain("event: done");
  });

  it("faller aldrig på att spårskrivningen misslyckas", async () => {
    vi.mocked(createPromptLog).mockRejectedValue(new Error("db down"));

    const body = await runTurn([
      { event: "content", data: { text: "svar" } },
      { event: "done", data: {} },
    ]);

    expect(assistantMessageCall()?.[2]).toBe("svar");
    expect(body).toContain("event: done");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import type { SetMessages } from "./types";

const consumeSseResponse = vi.hoisted(() => vi.fn());
const runPostGenerationChecks = vi.hoisted(() => vi.fn());
const triggerImageMaterialization = vi.hoisted(() => vi.fn());
const readPreviewPreflight = vi.hoisted(() => vi.fn(() => null));
const toast = vi.hoisted(() => {
  const fn = vi.fn();
  return Object.assign(fn, {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  });
});

vi.mock("@/lib/builder/sse", () => ({
  consumeSseResponse,
}));

vi.mock("@/lib/builder/prompt-assist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/builder/prompt-assist")>();
  return {
    ...actual,
    isPromptAssistOff: vi.fn(() => false),
    resolvePromptAssistProvider: vi.fn(() => "openai"),
  };
});

vi.mock("sonner", () => ({
  toast,
}));

vi.mock("./post-checks", () => ({
  runPostGenerationChecks,
}));

vi.mock("./post-checks-fetch", () => ({
  triggerImageMaterialization,
}));

vi.mock("./post-checks-preview", () => ({
  readPreviewPreflight,
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  warnLog: vi.fn(),
}));

import { handleSseStream, type StreamContext } from "./stream-handlers";

function createMessageStore() {
  let messages: ChatMessage[] = [
    {
      id: "assistant_1",
      role: "assistant",
      content: "",
      isStreaming: true,
      uiParts: [],
    },
  ];

  const setMessages: SetMessages = (next) => {
    messages = typeof next === "function" ? next(messages) : next;
  };

  return {
    setMessages,
    getMessages: () => messages,
  };
}

function createContext(setMessages: SetMessages) {
  const setChatId = vi.fn();
  const setCurrentPreviewUrl = vi.fn();
  const setPreviewPending = vi.fn();
  const onGenerationComplete = vi.fn();
  const mutateVersions = vi.fn();
  const touchStreamSafetyTimer = vi.fn();

  const ctx: StreamContext = {
    streamType: "create",
    assistantMessageId: "assistant_1",
    selectedModelTier: "gpt-5.4",
    chatId: null,
    setMessages,
    touchStreamSafetyTimer,
    setChatId,
    setCurrentPreviewUrl,
    setPreviewPending,
    onGenerationComplete,
    mutateVersions,
    enableImageMaterialization: true,
    autoFixHandlerRef: { current: vi.fn() },
    promptAssistModel: null,
    promptAssistDeep: false,
  };

  return {
    ctx,
    spies: {
      setChatId,
      setCurrentPreviewUrl,
      setPreviewPending,
      onGenerationComplete,
      mutateVersions,
      touchStreamSafetyTimer,
    },
  };
}

describe("handleSseStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runPostGenerationChecks.mockResolvedValue(undefined);
    triggerImageMaterialization.mockResolvedValue(undefined);
  });

  it("recovers when an SSE error is followed by a rescued done event", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("content", { text: "<main>Hello runtime lane</main>" }, "");
        onEvent("error", { message: "Engine generation failed" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: "https://preview.example/chat_1/ver_1",
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    const result = await handleSseStream(
      new Response(null),
      ctx,
      new AbortController().signal,
    );

    expect(result.chatIdFromStream).toBe("chat_1");
    expect(result.streamQuality.hasCriticalAnomaly).toBe(false);
    expect(result.streamQuality.reasons).toContain("error_event_recovered");
    expect(spies.setCurrentPreviewUrl).toHaveBeenCalledWith(
      "https://preview.example/chat_1/ver_1",
    );
    expect(spies.setChatId).toHaveBeenCalledWith("chat_1");
    expect(spies.mutateVersions).toHaveBeenCalledTimes(1);
    expect(spies.onGenerationComplete).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "ver_1",
      previewUrl: "https://preview.example/chat_1/ver_1",
      onlySelectVersionIfWasLatest: false,
    });
    expect(triggerImageMaterialization).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "ver_1",
      enabled: true,
    });
    await vi.waitFor(() => {
      expect(runPostGenerationChecks).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: "chat_1",
          versionId: "ver_1",
          assistantMessageId: "assistant_1",
          streamQuality: expect.objectContaining({
            hasCriticalAnomaly: false,
            reasons: expect.arrayContaining(["error_event_recovered"]),
          }),
        }),
      );
    });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(store.getMessages()[0]?.isStreaming).toBe(false);
  });

  it("awaitar triggerImageMaterialization innan runPostGenerationChecks", async () => {
    let releaseMaterialize!: () => void;
    const blockedMaterialize = new Promise<void>((resolve) => {
      releaseMaterialize = () => resolve();
    });
    triggerImageMaterialization.mockImplementation(async () => {
      await blockedMaterialize;
      return {
        attempted: true,
        strategy: "blob",
        replaced: 1,
        uploaded: 1,
        skipped: 0,
        warningCount: 0,
      };
    });

    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: "https://preview.example/chat_1/ver_1",
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(triggerImageMaterialization).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "ver_1",
      enabled: true,
    });
    expect(runPostGenerationChecks).not.toHaveBeenCalled();

    releaseMaterialize();
    await vi.waitFor(() => {
      expect(runPostGenerationChecks).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: "chat_1",
          versionId: "ver_1",
        }),
      );
    });
    expect(triggerImageMaterialization.mock.invocationCallOrder[0]).toBeLessThan(
      runPostGenerationChecks.mock.invocationCallOrder[0],
    );
  });

  it("kör post-checks även när bildmaterialiseringen kastar", async () => {
    triggerImageMaterialization.mockRejectedValue(new Error("blob down"));
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: "https://preview.example/chat_1/ver_1",
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);
    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    await vi.waitFor(() => {
      expect(runPostGenerationChecks).toHaveBeenCalled();
    });
  });

  it("throws when an SSE error is followed by done without a recovered artifact", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("error", { message: "Stream kaputt" }, "");
        onEvent("done", { chatId: "chat_1" }, "");
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);

    await expect(
      handleSseStream(new Response(null), ctx, new AbortController().signal),
    ).rejects.toThrow("Stream kaputt");
    expect(runPostGenerationChecks).not.toHaveBeenCalled();
    expect(triggerImageMaterialization).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("surfaces an explicit empty-generation failure when done has no version or preview", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("done", { chatId: "chat_1", reason: "done_empty_output" }, "");
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    const result = await handleSseStream(
      new Response(null),
      ctx,
      new AbortController().signal,
    );

    expect(result.chatIdFromStream).toBe("chat_1");
    expect(spies.onGenerationComplete).not.toHaveBeenCalled();
    expect(spies.mutateVersions).not.toHaveBeenCalled();
    expect(runPostGenerationChecks).not.toHaveBeenCalled();
    expect(triggerImageMaterialization).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Own-engine genererade ingen användbar kod i det här försöket.",
    );
    expect(store.getMessages()[0]?.content).toContain("Own-engine genererade ingen användbar kod");
    expect(store.getMessages()[0]?.isStreaming).toBe(false);
  });

  // Row A/B (bug-swarm 2026-08-01): innehåll som strömmades till chatten men
  // aldrig blev en version är inte "tom utdata". Användaren ser texten, så
  // feltoasten "inget kom tillbaka" och empty-output-fasen får inte fyra —
  // progresspart:en ska i stället spegla serverns reason.
  it("skippar feltoasten och empty-output-fasen när innehåll strömmades men ingen version sparades", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("content", { text: "<main>Här är sajten du bad om</main>" }, "");
        onEvent(
          "done",
          { chatId: "chat_1", versionId: null, reason: "stream_ended_without_version" },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    const result = await handleSseStream(
      new Response(null),
      ctx,
      new AbortController().signal,
    );

    expect(result.chatIdFromStream).toBe("chat_1");
    // Ingen riktig artefakt — Byggval-reset i useCreateChat ska inte luras.
    expect(result.hasRecoveredArtifact).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
    expect(spies.onGenerationComplete).not.toHaveBeenCalled();
    expect(runPostGenerationChecks).not.toHaveBeenCalled();
    // Den strömmade texten behålls som meddelandeinnehåll.
    expect(store.getMessages()[0]?.content).toContain("Här är sajten du bad om");
    expect(store.getMessages()[0]?.isStreaming).toBe(false);
    const generationPart = (store.getMessages()[0]?.uiParts ?? []).find(
      (part) => (part as { type?: string }).type === "tool:engine-generation",
    ) as { output?: { phase?: string; reason?: string; steps?: unknown } } | undefined;
    expect(generationPart?.output?.phase).toBe("stream-without-version");
    expect(generationPart?.output?.reason).toBe("stream_ended_without_version");
    expect(
      Array.isArray(generationPart?.output?.steps) ? generationPart.output.steps : [],
    ).toContain(
      "Innehåll strömmades till chatten men kunde inte sparas som version — texten ovan finns kvar",
    );
  });

  // Plan-läget avslutar utan version och utan preview — planen är resultatet.
  // Utan planArtifact i `hasRecoveredArtifact` tog empty-output-grenen över och
  // visade ett fel för en fullt lyckad plan.
  it("behandlar en plan utan blockerare som lyckad i stället för tom generering", async () => {
    const planArtifact = {
      goal: "Koppla på nyhetsbrev",
      scope: ["components/newsletter-signup-form.tsx"],
      steps: [{ title: "Lägg till formulär", description: "I sidfoten", phase: "build" }],
      blockers: [],
      assumptions: ["Mailchimp-nycklar kommer senare"],
    };
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("content", { text: "Här är planen." }, "");
        onEvent("done", { chatId: "chat_1", planMode: true, planArtifact, versionId: null }, "");
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    const result = await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(result.chatIdFromStream).toBe("chat_1");
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Plan skapad!");
    // Planen ska monteras som eget uiPart, inte skrivas över av felmeddelandet.
    expect(store.getMessages()[0]?.uiParts?.some((part) => part.type === "plan")).toBe(true);
    expect(store.getMessages()[0]?.content).toContain("Här är planen.");
    expect(store.getMessages()[0]?.isStreaming).toBe(false);
    // Ingen version finns, så inga versionsberoende efterkontroller ska köras.
    expect(runPostGenerationChecks).not.toHaveBeenCalled();
    expect(spies.onGenerationComplete).toHaveBeenCalled();
  });

  // Bugbot på MVP-svepet: serverns persist-beslut räknar pages/scope som
  // plansubstans (`planArtifactHasSubstance`) — klienten måste använda samma
  // predikat, annars får en sidplan utan steg fel-toasten trots att servern
  // sparade en riktig plan.
  it("behandlar en pages/scope-only-plan (utan steg) som lyckad", async () => {
    const planArtifact = {
      goal: "Ny sajtstruktur",
      scope: ["app/om/page.tsx", "app/kontakt/page.tsx"],
      pages: [
        { name: "Om oss", path: "/om" },
        { name: "Kontakt", path: "/kontakt" },
      ],
      steps: [],
      blockers: [],
    };
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("content", { text: "Här är sidplanen." }, "");
        onEvent("done", { chatId: "chat_1", planMode: true, planArtifact, versionId: null }, "");
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Plan skapad!");
    expect(store.getMessages()[0]?.uiParts?.some((part) => part.type === "plan")).toBe(true);
  });

  // Bugbot på MVP-svepet (pass 4): plan-läge som strömmar prosa men inte får
  // en substansplan är ett medvetet planner-text-utfall (servern persisterar
  // prosan) — inte ett codegen-persist-fel. Ingen "kunde inte sparas som
  // version"-fas, ingen toast, och completion-hooken körs.
  it("behandlar plan-prosa utan substansplan som lugn avslutning, inte stream-without-version", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("content", { text: "Bygget är klart, men previewen svarar inte." }, "");
        onEvent("done", { chatId: "chat_1", planMode: true, planArtifact: {}, versionId: null }, "");
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(toast.error).not.toHaveBeenCalled();
    const message = store.getMessages()[0];
    expect(message?.content).toContain("Bygget är klart");
    expect(message?.isStreaming).toBe(false);
    const progressPart = message?.uiParts?.find(
      (part) => part.type === "tool:engine-generation",
    ) as { output?: { phase?: string } } | undefined;
    expect(progressPart?.output?.phase).not.toBe("stream-without-version");
    expect(spies.onGenerationComplete).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat_1" }),
    );
  });

  // Bugbot på #629: plan-mode-stream skickar `resolvePlanArtifact(...) ?? {}`,
  // så fältet finns även när planeraren inte producerade något parsbart. Ett tomt
  // artefaktobjekt får inte räknas som en plan — då hade en misslyckad körning
  // visat "Plan skapad!" och ett tomt kort.
  it("räknar inte ett tomt planArtifact som en lyckad plan", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("done", { chatId: "chat_1", planMode: true, planArtifact: {}, versionId: null }, "");
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Genereringen avslutades utan version eller preview.",
    );
    expect(store.getMessages()[0]?.uiParts?.some((part) => part.type === "plan")).toBe(false);
  });

  // Codex på #629: en icke-tom steg-array är inte samma sak som en plan.
  // `parsePlanResponse` accepterar vilket JSON-objekt som helst och serverns
  // resolver berikar bara ytligt, så steg utan titel/beskrivning eller med en
  // `phase` utanför enumet når klienten orörda — och faller sedan bort i
  // `normalizePlanArtifact`, vilket ger ett tomt kort under "Plan skapad!".
  it.each([
    ["helt tomma steg", [{}]],
    ["steg med ogiltig fas", [{ title: "Bygg", description: "Något", phase: "implementation" }]],
  ])("räknar inte %s som en lyckad plan", async (_label, steps) => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            planMode: true,
            planArtifact: { goal: "Koppla på nyhetsbrev", steps, blockers: [] },
            versionId: null,
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Genereringen avslutades utan version eller preview.",
    );
    expect(store.getMessages()[0]?.uiParts?.some((part) => part.type === "plan")).toBe(false);
  });

  // Motprovet: en blockerare som överlever normaliseringen ÄR substans, så en
  // plan som bara ställer frågor får inte hamna i empty-output-grenen.
  it("räknar en giltig blockerare som en plan även utan steg", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            planMode: true,
            planArtifact: {
              goal: "Koppla på nyhetsbrev",
              steps: [],
              blockers: [{ kind: "integration", question: "Vilken e-posttjänst?" }],
            },
            versionId: null,
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(toast.error).not.toHaveBeenCalled();
    expect(store.getMessages()[0]?.uiParts?.some((part) => part.type === "plan")).toBe(true);
  });

  // C1/C3 (empty-output tool feedback fix, prod chat e298da50): a done event
  // with `awaitingInput: true` + `awaitingInputPrompt` must surface that
  // prompt as the assistant message content and skip the generic
  // "no version or preview" failure toast — the server already streamed the
  // explanation via a `content` event before `done`.
  it("surfaces the malformed-integration awaiting-input message instead of the generic empty-generation failure", async () => {
    const helpfulMessage =
      "Integrationsförslaget kunde inte tolkas — försök igen eller starta integrationsbygget via knappen.";
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("content", { text: helpfulMessage }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            reason: "malformed_integration_tool_call_empty_generation",
            awaitingInput: true,
            awaitingInputPrompt: helpfulMessage,
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);

    const result = await handleSseStream(
      new Response(null),
      ctx,
      new AbortController().signal,
    );

    expect(result.chatIdFromStream).toBe("chat_1");
    expect(toast.error).not.toHaveBeenCalled();
    expect(store.getMessages()[0]?.content).toContain(helpfulMessage);
    expect(store.getMessages()[0]?.isStreaming).toBe(false);
  });

  it("sets preview prod-build state on preview-ready with prodBuildVerified", async () => {
    const setPreviewProdBuild = vi.fn();
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
        onEvent(
          "preview-ready",
          {
            previewUrl: "https://sandbox.example",
            previewSessionId: "sb_1",
            prodBuildVerified: false,
            prodBuildLogSnippet: "Error: failed",
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);
    const ctxWithProd = { ...ctx, setPreviewProdBuild };

    await handleSseStream(new Response(null), ctxWithProd, new AbortController().signal);

    expect(setPreviewProdBuild).toHaveBeenCalledWith({
      verified: false,
      logSnippet: "Error: failed",
    });
    expect(spies.setCurrentPreviewUrl).toHaveBeenCalledWith("https://sandbox.example");
    const failedPreviewProgress = store
      .getMessages()
      .find((message) => message.id === "assistant_1")
      ?.uiParts?.find(
        (part) => (part as { type?: string }).type === "tool:engine-preview",
      ) as { state?: string } | undefined;
    expect(failedPreviewProgress?.state).toBe("output-error");
  });

  it("does not set preview iframe on empty preview-ready (build_only) but records prod build", async () => {
    const setPreviewProdBuild = vi.fn();
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
        onEvent(
          "preview-ready",
          {
            previewUrl: "",
            previewSessionId: "sb_1",
            previewMode: "build_only",
            previewTier: 3,
            prodBuildVerified: true,
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(
      new Response(null),
      { ...ctx, setPreviewProdBuild },
      new AbortController().signal,
    );

    expect(setPreviewProdBuild).toHaveBeenCalledWith({
      verified: true,
      logSnippet: undefined,
    });
    expect(spies.setCurrentPreviewUrl).not.toHaveBeenCalled();
    const verifiedPreviewProgress = store
      .getMessages()
      .find((message) => message.id === "assistant_1")
      ?.uiParts?.find(
        (part) => (part as { type?: string }).type === "tool:engine-preview",
      ) as { state?: string } | undefined;
    expect(verifiedPreviewProgress?.state).toBe("output-available");
  });

  it("clears prod-build banner when preview-ready omits prodBuildVerified (preview_host tier-2)", async () => {
    const setPreviewProdBuild = vi.fn();
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
        onEvent(
          "preview-ready",
          {
            previewUrl: "https://preview.example",
            previewSessionId: "sb_1",
            previewTier: 2,
            runtimeConfirmed: false,
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(
      new Response(null),
      { ...ctx, setPreviewProdBuild },
      new AbortController().signal,
    );

    expect(setPreviewProdBuild).toHaveBeenCalledWith(null);
    expect(spies.setCurrentPreviewUrl).toHaveBeenCalledWith("https://preview.example");
    const readyPreviewProgress = store
      .getMessages()
      .find((message) => message.id === "assistant_1")
      ?.uiParts?.find(
        (part) => (part as { type?: string }).type === "tool:engine-preview",
      ) as { state?: string; output?: { phase?: string; steps?: unknown } } | undefined;
    expect(readyPreviewProgress?.state).toBe("output-available");
    expect(readyPreviewProgress?.output?.phase).toBe("boot-queued");
    expect(
      Array.isArray(readyPreviewProgress?.output?.steps)
        ? readyPreviewProgress.output.steps
        : [],
    ).toContain(
      "Preview-sessionen är skapad — miljön fortsätter starta i previewytan",
    );
  });

  it("does not set iframe URL from done when previewUrl is compatibility shim only", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(spies.setCurrentPreviewUrl).not.toHaveBeenCalled();
    expect(spies.onGenerationComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        previewUrl: undefined,
      }),
    );
  });

  it("keeps previewUrlHint as boot hint only when preview-ready is not received", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            previewUrlHint: "https://vm-fly-jakem.fly.dev/chat_1",
            previewPending: true,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(spies.setCurrentPreviewUrl).not.toHaveBeenCalled();
    expect(spies.setPreviewPending).toHaveBeenCalledWith(true);
    expect(spies.onGenerationComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        previewUrl: undefined,
      }),
    );
  });

  it("does not apply shim fallback from build-error", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
        onEvent(
          "progress",
          {
            step: "preview",
            phase: "starting",
          },
          "",
        );
        onEvent(
          "build-error",
          {
            stage: "install",
            message: "npm failed",
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    expect(spies.setCurrentPreviewUrl).not.toHaveBeenCalled();
    const failedPreviewProgress = store
      .getMessages()
      .find((message) => message.id === "assistant_1")
      ?.uiParts?.find(
        (part) => (part as { type?: string }).type === "tool:engine-preview",
      ) as { state?: string; output?: { steps?: unknown } } | undefined;
    expect(failedPreviewProgress?.state).toBe("output-error");
    expect(
      Array.isArray(failedPreviewProgress?.output?.steps)
        ? failedPreviewProgress.output.steps
        : [],
    ).toContain("Live-preview kunde inte starta: npm failed");
  });

  // Regression (2026-07 preview-lifecycle simplification, punkt 1): the old
  // progressive refresh reloaded the iframe mid-stream after two closed code
  // fences — before the version was finalized. No preview delivery of any
  // kind may happen from `content` events.
  it("never touches the preview from content events mid-stream (progressive refresh removed)", async () => {
    const applyPreviewHandoff = vi.fn();
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "content",
          {
            text:
              '```tsx file="app/page.tsx"\nexport default function Page() { return null; }\n```\n' +
              '```tsx file="app/layout.tsx"\nexport default function Layout() { return null; }\n```\n',
          },
          "",
        );
        // Assert BEFORE done: nothing has been delivered mid-stream.
        expect(applyPreviewHandoff).not.toHaveBeenCalled();
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: "https://preview.example/chat_1",
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx, spies } = createContext(store.setMessages);

    await handleSseStream(
      new Response(null),
      { ...ctx, applyPreviewHandoff },
      new AbortController().signal,
    );

    // Delivered exactly once — at done, through the handoff (never the raw setter).
    expect(applyPreviewHandoff).toHaveBeenCalledTimes(1);
    expect(applyPreviewHandoff).toHaveBeenCalledWith({
      url: "https://preview.example/chat_1",
      versionId: "ver_1",
    });
    expect(spies.setCurrentPreviewUrl).not.toHaveBeenCalled();
  });

  // Regression (punkt 2 + Bugbot): preview-ready delivers the session URL before
  // the stream reports versionId (`?:url`), then done re-delivers the SAME URL
  // with the resolved versionId. Both handoffs fire, but the SECOND is a
  // no-reload latch upgrade (decidePreviewHandoff returns noop for `?:url` ->
  // `versionId:url`), so the iframe still reloads exactly once — and the
  // controller latch advances to `versionId:url` instead of staying stuck at
  // `?:url` (which would later swallow a genuine new-version bump).
  it("re-delivers with the resolved versionId at done so the handoff latch upgrades (no double reload)", async () => {
    const applyPreviewHandoff = vi.fn();
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "preview-ready",
          {
            previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            previewSessionId: "sess_1",
            previewTier: 2,
          },
          "",
        );
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);

    await handleSseStream(
      new Response(null),
      { ...ctx, applyPreviewHandoff },
      new AbortController().signal,
    );

    expect(applyPreviewHandoff).toHaveBeenCalledTimes(2);
    // preview-ready: versionId unresolved → sets `?:url` (the one reload).
    expect(applyPreviewHandoff).toHaveBeenNthCalledWith(1, {
      url: "https://vm-fly-jakem.fly.dev/chat_1",
      versionId: null,
    });
    // done: resolved versionId for the same URL → no-reload latch upgrade.
    expect(applyPreviewHandoff).toHaveBeenNthCalledWith(2, {
      url: "https://vm-fly-jakem.fly.dev/chat_1",
      versionId: "ver_1",
    });
  });

  it("renders generation done timing in Agentlogg without duplicate done rows", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent("progress", { step: "generation", phase: "start" }, "");
        onEvent(
          "progress",
          {
            step: "generation",
            phase: "done",
            durationMs: 2100,
            waitMs: 0,
            reasoningMs: 1200,
            outputMs: 900,
          },
          "",
        );
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);
    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    const assistant = store.getMessages().find((m) => m.id === "assistant_1");
    const generationDoneParts = (assistant?.uiParts ?? []).filter((part) => {
      const maybePart = part as { type?: string; output?: { phase?: string } };
      return maybePart.type === "tool:engine-generation" && maybePart.output?.phase === "done";
    });
    expect(generationDoneParts).toHaveLength(1);
    const doneSteps = (
      generationDoneParts[0] as {
        output?: { steps?: unknown };
      }
    ).output?.steps;
    expect(Array.isArray(doneSteps) ? doneSteps : []).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Generering klar (2.1s)"),
        expect.stringContaining("reasoning 1.2s, output 0.9s"),
      ]),
    );
    expect(Array.isArray(doneSteps) ? doneSteps.join(" ") : "").not.toMatch(/\bwait\b/);
  });

  it("omits a zero reasoning phase and names the wait instead of inventing reasoning", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "progress",
          {
            step: "generation",
            phase: "done",
            durationMs: 337_000,
            waitMs: 336_300,
            reasoningMs: 0,
            outputMs: 700,
          },
          "",
        );
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);
    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    const assistant = store.getMessages().find((m) => m.id === "assistant_1");
    const generationDoneParts = (assistant?.uiParts ?? []).filter((part) => {
      const maybePart = part as { type?: string; output?: { phase?: string } };
      return maybePart.type === "tool:engine-generation" && maybePart.output?.phase === "done";
    });
    const doneSteps = (
      generationDoneParts[0] as {
        output?: { steps?: unknown };
      }
    ).output?.steps;
    const joined = Array.isArray(doneSteps) ? doneSteps.join(" ") : "";
    expect(joined).toContain("wait 336s");
    expect(joined).toContain("output 0.7s");
    expect(joined).not.toMatch(/reasoning/);
  });

  it("renders a friendly live status when model reasoning takes longer than usual", async () => {
    consumeSseResponse.mockImplementation(
      async (
        _response: Response,
        onEvent: (event: string, data: unknown, raw: string) => void,
      ) => {
        onEvent("chatId", { id: "chat_1" }, "");
        onEvent(
          "progress",
          {
            step: "generation",
            phase: "reasoning-slow",
            elapsedMs: 30_500,
          },
          "",
        );
        onEvent(
          "done",
          {
            chatId: "chat_1",
            versionId: "ver_1",
            messageId: "msg_1",
            previewUrl: null,
            preflight: {
              previewBlocked: false,
              verificationBlocked: false,
              previewBlockingReason: null,
            },
          },
          "",
        );
      },
    );

    const store = createMessageStore();
    const { ctx } = createContext(store.setMessages);
    await handleSseStream(new Response(null), ctx, new AbortController().signal);

    const assistant = store.getMessages().find((message) => message.id === "assistant_1");
    const progress = (assistant?.uiParts ?? []).find(
      (part) => (part as { type?: string }).type === "tool:engine-generation",
    ) as { output?: { steps?: unknown } } | undefined;
    expect(Array.isArray(progress?.output?.steps) ? progress.output.steps : []).toContain(
      "Modellen analyserar fortfarande uppgiften (31s)",
    );
  });
});

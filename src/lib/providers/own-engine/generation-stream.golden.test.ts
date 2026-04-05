import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSSEBuffer } from "@/lib/gen/route-helpers";
import { formatSSEEvent } from "@/lib/streaming";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";

const finalizeAndSaveVersionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get() { return vi.fn(); } }),
  dbConfigured: false,
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

vi.mock("@/lib/mcp/runtime-url", () => ({
  isSandboxConfigured: () => false,
  SANDBOX_SETUP_HINT: "Configure Vercel Sandbox credentials for tier-2 preview.",
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
    sandboxUrl: null,
    filesJson: "{}",
    contentForVersion: "golden-content",
    preflight: {
      previewBlocked: false,
      verificationBlocked: false,
      previewBlockingReason: null,
      primaryPreviewTarget: "none",
      sandbox: {
        canStartSandbox: false,
        primaryPreviewTarget: "none",
        shimBlocked: false,
        requiresEnvConfig: false,
        hasCriticalInstallRisk: false,
        hasCriticalCodeFailure: false,
        compatibilityShimAllowed: false,
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
  };

  beforeEach(() => {
    finalizeAndSaveVersionMock.mockReset();
    finalizeAndSaveVersionMock.mockResolvedValue(mockFinalizeResult);
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
        scaffoldFamily: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: ["marketing-sites"],
        forbiddenPatterns: ["leave_bracket_placeholders"],
        tokenBudgets: {
          scaffoldChars: 20_000,
          refsChars: 8_000,
          systemContextChars: 28_000,
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
});

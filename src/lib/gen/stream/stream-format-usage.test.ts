/**
 * Tokenloggning från codegen-strömmen.
 *
 * Två invarianter som båda gick fel en gång: strömmen måste logga sin
 * förbrukning på ALLA utgångar (en trunkerad körning kostar ofta mest), och den
 * får bara skriva EN rad per API-anrop (providerabort loggar tidigt men avbryter
 * inte strömmen, så done-vägen skulle annars dubbla summan).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordLlmUsage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage }));

const { createCodeGenSSEStream } = await import("./stream-format");

type StreamPart = {
  type: string;
  text?: string;
  finishReason?: string | null;
  error?: unknown;
};

type StreamResultLike = Parameters<typeof createCodeGenSSEStream>[0];

function createResult(
  parts: StreamPart[],
  usage: { inputTokens: number | undefined; outputTokens: number | undefined } = {
    inputTokens: 100,
    outputTokens: 20,
  },
): StreamResultLike {
  return {
    fullStream: (async function* () {
      for (const part of parts) yield part;
    })(),
    usage: Promise.resolve(usage),
  };
}

async function drain(result: StreamResultLike) {
  const stream = createCodeGenSSEStream(result, {
    meta: { chatId: "chat_1", versionId: "ver_1", modelId: "gpt-5.5", modelTier: "max" },
  });
  const reader = stream.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

describe("codegen-strömmens tokenloggning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loggar en rad med ägare och modell när strömmen går klart", async () => {
    await drain(createResult([{ type: "text-delta", text: "hej" }, { type: "finish" }]));
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "codegen",
      model: "gpt-5.5",
      modelTier: "max",
      chatId: "chat_1",
      versionId: "ver_1",
      ok: true,
      errorCode: null,
      usage: { inputTokens: 100, outputTokens: 20 },
    });
  });

  it("loggar trunkerad körning i stället för att tiga", async () => {
    await drain(
      createResult([
        { type: "text-delta", text: "halvt svar" },
        { type: "finish", finishReason: "length" },
      ]),
    );
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "codegen",
      ok: false,
      errorCode: "output_truncated",
    });
  });

  it("skriver bara EN rad per API-anrop även när providern avbryter", async () => {
    await drain(
      createResult([
        { type: "text-delta", text: "delvis" },
        { type: "abort" },
        { type: "finish" },
      ]),
    );
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
  });

  it("loggar även när strömmen kastar", async () => {
    const result: StreamResultLike = {
      fullStream: (async function* () {
        yield { type: "text-delta", text: "start" };
        throw new Error("provider blew up");
      })(),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 0 }),
    };
    await drain(result);
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({ ok: false });
  });

  it("bokför plan-läget som planner med modell trots att meta saknas", async () => {
    const stream = createCodeGenSSEStream(
      createResult([{ type: "text-delta", text: "plan" }, { type: "finish" }]),
      { usagePhase: "planner", usageModelId: "gpt-5.3-codex" },
    );
    const reader = stream.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "planner",
      model: "gpt-5.3-codex",
    });
  });

  it("tål att usage inte går att läsa", async () => {
    const result: StreamResultLike = {
      fullStream: (async function* () {
        yield { type: "finish" };
      })(),
      // Får aldrig bubbla upp som ett ohanterat avslag.
      usage: Promise.reject(new Error("no usage")) as StreamResultLike["usage"],
    };
    // Får inte kasta vidare och får inte hindra strömmen från att stängas.
    await expect(drain(result)).resolves.toBeUndefined();
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
  });
});

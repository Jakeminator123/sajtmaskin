/**
 * Tokenloggning från RepairGate.
 *
 * Ett fixer-anrop som faller (abort, timeout, providerfel) har ändå förbrukat
 * tokens — och det är just de körningarna som är dyrast, eftersom de hann
 * strömma innan de dog. Codex P1 på #613: felvägen loggade ingenting.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordLlmUsage = vi.hoisted(() => vi.fn());
const streamText = vi.hoisted(() => vi.fn());

vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage }));
vi.mock("ai", () => ({ streamText }));
vi.mock("../models", () => ({
  getOpenAIModel: () => "model",
  isAnthropicModel: () => false,
}));

const { runLlmFixer } = await import("./llm-fixer");

const CODE = "```tsx file=\"app/page.tsx\"\nexport default function Page() { return null; }\n```";

describe("RepairGate-tokenloggning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loggar ett lyckat anrop", async () => {
    streamText.mockReturnValue({
      text: Promise.resolve(CODE),
      usage: Promise.resolve({ inputTokens: 30_000, outputTokens: 4_000 }),
    });
    await runLlmFixer(CODE, ["TS2304: Cannot find name 'Foo'"]);
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "fixer",
      usage: { inputTokens: 30_000, outputTokens: 4_000 },
    });
  });

  it("loggar ett avbrutet anrop med usage från strömmen", async () => {
    streamText.mockReturnValue({
      text: Promise.reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })),
      usage: Promise.resolve({ inputTokens: 28_000, outputTokens: 900 }),
    });
    await runLlmFixer(CODE, ["TS2304: Cannot find name 'Foo'"]);
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "fixer",
      ok: false,
      errorCode: "llm_fixer_aborted",
      usage: { inputTokens: 28_000, outputTokens: 900 },
    });
  });

  it("loggar ett providerfel även när usage inte går att läsa", async () => {
    streamText.mockReturnValue({
      text: Promise.reject(new Error("provider exploded")),
      usage: Promise.reject(new Error("no usage")),
    });
    await runLlmFixer(CODE, ["TS2304: Cannot find name 'Foo'"]);
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "fixer",
      ok: false,
      errorCode: "llm_fixer_failed:Error",
      errorMessage: "provider exploded",
      usage: null,
    });
  });

  it("klassificerar AI SDK-wrapad AbortError som aborted, inte failed", async () => {
    const abort = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    const wrapped = Object.assign(new Error("No output generated. Check the stream for errors."), {
      name: "AI_NoOutputGeneratedError",
      cause: abort,
    });
    streamText.mockReturnValue({
      text: Promise.reject(wrapped),
      usage: Promise.resolve({ inputTokens: 12, outputTokens: 0 }),
    });
    const result = await runLlmFixer(CODE, ["TS2304: Cannot find name 'Foo'"]);
    expect(result.aborted).toBe(true);
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "fixer",
      ok: false,
      errorCode: "llm_fixer_aborted",
    });
  });

  it("skriver inte två rader när efterbehandlingen faller", async () => {
    // Texten kom fram (raden skriven), men parsningen ger noll filer och
    // funktionen returnerar — ingen andra rad ska skrivas.
    streamText.mockReturnValue({
      text: Promise.resolve("ingen kodblock här"),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 1 }),
    });
    await runLlmFixer(CODE, ["TS2304: Cannot find name 'Foo'"]);
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    // Den enda raden är den lyckade — inte en påhittad felrad ovanpå.
    expect(recordLlmUsage.mock.calls[0][0].ok).toBeUndefined();
    expect(recordLlmUsage.mock.calls[0][0]).toMatchObject({
      phase: "fixer",
      usage: { inputTokens: 10, outputTokens: 1 },
    });
  });
});

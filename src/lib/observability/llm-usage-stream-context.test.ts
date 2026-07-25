/**
 * Kontextens hållbarhet över en SSE-ström.
 *
 * Generation-pipelinen returnerar en `Response` med en `ReadableStream` som
 * konsumeras EFTER att route-handlern returnerat. Codegen, verifier och
 * RepairGate skriver sin tokenförbrukning där — alltså efter att
 * `runWithLlmUsageContext` redan lämnat sitt `await`. Testet låser att
 * `AsyncLocalStorage` ändå bär ägaren dit, eftersom strömmen konstrueras inuti
 * scopet.
 *
 * Om detta någon gång slutar gälla får verifier/fixer-raderna null-ägare, och då
 * måste id:n trådas explicit i stället. Därför är det ett kontraktstest, inte en
 * implementationsdetalj.
 */
import { describe, expect, it } from "vitest";
import { getLlmUsageContext, runWithLlmUsageContext, setLlmUsageContext } from "./llm-usage";

function buildStreamInsideScope(): {
  stream: ReadableStream<string>;
  seen: Array<Record<string, unknown>>;
} {
  const seen: Array<Record<string, unknown>> = [];
  const stream = runWithLlmUsageContext(
    { chatId: "chat_1", sessionId: "sess_1", userId: "user_1" },
    () => {
      // Efterliknar finalize: versionId blir känt först mitt i strömmen.
      return new ReadableStream<string>({
        async start(controller) {
          seen.push({ at: "start", ...getLlmUsageContext() });
          await new Promise((resolve) => setTimeout(resolve, 1));
          setLlmUsageContext({ versionId: "ver_1" });
          seen.push({ at: "after-await", ...getLlmUsageContext() });
          controller.enqueue("chunk");
          controller.close();
        },
      });
    },
  );
  return { stream, seen };
}

describe("kontext över en ReadableStream", () => {
  it("följer med in i strömmen som konstruerades i scopet", async () => {
    const { stream, seen } = buildStreamInsideScope();
    // Scopet är redan avslutat här — precis som efter att routen returnerat.
    expect(getLlmUsageContext()).toEqual({});

    const reader = stream.getReader();
    const chunks: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    expect(chunks).toEqual(["chunk"]);
    expect(seen[0]).toMatchObject({ at: "start", chatId: "chat_1", userId: "user_1" });
    expect(seen[1]).toMatchObject({
      at: "after-await",
      chatId: "chat_1",
      userId: "user_1",
      versionId: "ver_1",
    });
  });

  it("läcker inte ut till konsumenten", async () => {
    const { stream } = buildStreamInsideScope();
    await stream.getReader().read();
    expect(getLlmUsageContext()).toEqual({});
  });
});

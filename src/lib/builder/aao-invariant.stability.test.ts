import { describe, expect, it } from "vitest";

import { consumeSseResponse } from "@/lib/builder/sse";
import { createCodeGenSSEStream } from "@/lib/gen/stream/stream-format";
import { formatSSEEvent } from "@/lib/streaming";

/**
 * Grandmaster S2 — åäö-invariant i builder-chat.
 *
 * Källa: docs/plans/avklarat/grandmaster/aktiviteter/S2-aao-invariant.md
 *        docs/plans/avklarat/grandmaster/02-stabilitetstester.md  (seed: "åäö i
 *        användarprompt renderas i builder-chatten under generering").
 *
 * Invariant som låses: en svensk prompt med åäö/ÅÄÖ som strömmas under generering
 * renderas tecken-för-tecken korrekt i builder-chatten — inga svenska tecken muteras
 * till `?`/mojibake eller U+FFFD, även när transport-strömmen delar en multi-byte-
 * UTF-8-sekvens mitt itu vid en paket-/chunk-gräns.
 *
 * Rena enheter (ingen live-builder, ingen /api/engine, ingen preview — endast
 * in-memory-strömmar):
 *  - server-encode:  createCodeGenSSEStream (src/lib/gen/stream/stream-format.ts)
 *                    + formatSSEEvent       (src/lib/streaming.ts)   → SSE-bytes
 *  - klient-render:  consumeSseResponse     (src/lib/builder/sse.ts) — den kanoniska
 *                    SSE-konsumenten som matar builder-chattens `content`-render.
 *
 * Regressen testet fångar: om klient-decodern tappar `{ stream: true }` (eller
 * server-encoden slutar vara UTF-8) klyvs ett multi-byte-tecken över två läsningar
 * och blir U+FFFD/`?` → assertionerna nedan faller.
 */

// Multi-byte (2-byte UTF-8) svenska tecken + en é (café) som extra brytpunkt.
// Medvetet inget `?` i prompten, så `not.toContain("?")` blir meningsfull.
const SWEDISH_PROMPT =
  'Bygg en startsida för mitt café i Växjö med rubriken ' +
  '"Färska smörgåsar, kanelbullar och kaffe". Tänk på åäö och ÅÄÖ.';

const REPLACEMENT_CHAR = "\uFFFD";

function createResult(parts: Array<{ type: string; text?: string; textDelta?: string }>) {
  return {
    fullStream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
    usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
  };
}

async function collectStreamBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Wrap raw SSE bytes in a Response whose body emits them in fixed-size chunks.
 * `chunkSize: 1` is the adversarial case: every multi-byte UTF-8 sequence is
 * split across reads, exactly like an unlucky network packet boundary.
 */
function bytesToResponse(bytes: Uint8Array, chunkSize: number): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

async function collectContentText(response: Response): Promise<string> {
  let content = "";
  await consumeSseResponse(response, (event, data) => {
    if (event !== "content") return;
    if (typeof data === "string") {
      content += data;
      return;
    }
    if (data && typeof data === "object" && "text" in data) {
      content += String((data as { text?: unknown }).text ?? "");
    }
  });
  return content;
}

function buildContentStreamBytes(deltas: string[]): Promise<Uint8Array> {
  const parts = [
    { type: "start" },
    { type: "text-start" },
    ...deltas.map((textDelta) => ({ type: "text-delta", textDelta })),
    { type: "finish" },
  ];
  const stream = createCodeGenSSEStream(createResult(parts), {
    meta: { chatId: "chat_s2_aao" },
  });
  return collectStreamBytes(stream);
}

describe("S2 åäö-invariant i builder-chat", () => {
  it("bevarar åäö/ÅÄÖ genom hela server→klient-vägen (normal chunkning)", async () => {
    const bytes = await buildContentStreamBytes([SWEDISH_PROMPT]);
    const content = await collectContentText(bytesToResponse(bytes, 64));

    expect(content).toContain(SWEDISH_PROMPT);
    expect(content.includes(REPLACEMENT_CHAR)).toBe(false);
    expect(content.includes("?")).toBe(false);
  });

  it("bevarar åäö/ÅÄÖ även när varje byte levereras som en egen chunk", async () => {
    const bytes = await buildContentStreamBytes([SWEDISH_PROMPT]);
    // 1 byte per chunk → varje 2-byte svenskt tecken klyvs garanterat över två läsningar.
    const content = await collectContentText(bytesToResponse(bytes, 1));

    expect(content).toContain(SWEDISH_PROMPT);
    expect(content.includes(REPLACEMENT_CHAR)).toBe(false);
    expect(content.includes("?")).toBe(false);
  });

  it("bevarar svenska tecken när prompten strömmas i flera delta-bitar", async () => {
    const deltas = ["Bygg en sida för ", "Växjö – smörgåsar, ", "kanelbullar. åäö ÅÄÖ"];
    const expected = deltas.join("");
    const bytes = await buildContentStreamBytes(deltas);
    const content = await collectContentText(bytesToResponse(bytes, 1));

    expect(content).toContain(expected);
    expect(content.includes(REPLACEMENT_CHAR)).toBe(false);
    expect(content.includes("?")).toBe(false);
  });

  it("klient-decodern (consumeSseResponse) tappar inte multi-byte-tecken byte-för-byte", async () => {
    // Isolerar den rena render-enheten: server-formaterade bytes (formatSSEEvent),
    // worst-case 1-byte-chunkning, bara svenska tecken → exakt likhet krävs.
    const onlySwedish = "åäöÅÄÖ";
    const bytes = new TextEncoder().encode(formatSSEEvent("content", { text: onlySwedish }));
    const content = await collectContentText(bytesToResponse(bytes, 1));

    expect(content).toBe(onlySwedish);
    expect(content.includes(REPLACEMENT_CHAR)).toBe(false);
    expect(content.includes("?")).toBe(false);
  });
});

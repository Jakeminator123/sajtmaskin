import { describe, expect, it } from "vitest";
import { F3_KICK_PROMPT, PROMPT_SOURCE_UI_PART_TYPE, type ChatMessage } from "@/lib/builder/types";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { countVisibleConversationMessages } from "./conversation-count";

const user = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role: "user",
  content,
  ...extra,
});
const reply = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role: "assistant",
  content,
  ...extra,
});
const agent = (
  id: string,
  role: "user" | "assistant",
  content: string,
  extra: Partial<OpenClawMessage> = {},
): OpenClawMessage => ({ id, role, content, timestamp: 1, kind: "chat", ...extra });

describe("countVisibleConversationMessages", () => {
  it("är noll innan något har skickats", () => {
    expect(countVisibleConversationMessages([], [])).toBe(0);
  });

  it("räknar första bygget: beställningen och byggmotorns svar", () => {
    expect(
      countVisibleConversationMessages(
        [user("u1", "Bygg en sajt för Café Lindgren"), reply("a1", "Klart.")],
        [],
      ),
    ).toBe(2);
  });

  it("håller räkningen stabil medan svaret strömmar", () => {
    const start = [user("u1", "Bygg en sajt"), reply("a1", "", { isStreaming: true })];
    const later = [user("u1", "Bygg en sajt"), reply("a1", "```tsx file=\"app/page.tsx\"\n…", { isStreaming: true })];
    expect(countVisibleConversationMessages(start, [])).toBe(2);
    expect(countVisibleConversationMessages(later, [])).toBe(2);
  });

  it("räknar en uppdatering som två nya meddelanden", () => {
    expect(
      countVisibleConversationMessages(
        [
          user("u1", "Bygg en sajt"),
          reply("a1", "Klart."),
          user("u2", "Lägg till tre kundomdömen"),
          reply("a2", "Klart."),
        ],
        [],
      ),
    ).toBe(4);
  });

  it("räknar Sajtagentens fråga och svar i samma konversation", () => {
    const builder = [user("u1", "Bygg en sajt"), reply("a1", "Klart.")];
    const agentRows = [
      agent("q1", "user", "Vad borde jag förbättra?", { anchorBuilderMessageId: "a1" }),
      agent("r1", "assistant", "Byt till egna bilder.", { anchorBuilderMessageId: "a1" }),
    ];
    expect(countVisibleConversationMessages(builder, agentRows)).toBe(4);
  });

  it("räknar inte hjälprader: automatisk reparation, F3-start och agentens väckningar", () => {
    const builder = [
      user("u1", "Bygg en sajt"),
      reply("a1", "Klart."),
      user("fix", "AUTO-FIX REQUEST: rätta importen"),
      reply("a2", "Rättat."),
      user("f3", F3_KICK_PROMPT),
      user("audit", "Bygg en förbättrad sajt", {
        uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "audit" }],
      }),
    ];
    const agentRows = [
      agent("wake", "user", "[Automatisk fortsättning] fortsätt", { kind: "internal" }),
      agent("r1", "assistant", "Jag fortsätter."),
    ];
    // u1, a1, a2 (reparationens svar syns som ett svar) och agentens svar.
    expect(countVisibleConversationMessages(builder, agentRows)).toBe(4);
  });

  it("räknar historik som hydrerats från servern som vanliga rader", () => {
    const agentRows = [
      agent("q1", "user", "Vad tycker du?", { hydrated: true, anchorBuilderMessageIndex: 2 }),
      agent("r1", "assistant", "Bra.", { hydrated: true, anchorBuilderMessageIndex: 2 }),
    ];
    expect(
      countVisibleConversationMessages([user("db-u1", "Bygg"), reply("db-a1", "Klart.")], agentRows),
    ).toBe(4);
  });
});

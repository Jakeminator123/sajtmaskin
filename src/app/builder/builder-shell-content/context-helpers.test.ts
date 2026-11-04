import { describe, expect, it } from "vitest";

import { F3_KICK_PROMPT, PROMPT_SOURCE_UI_PART_TYPE, type ChatMessage } from "@/lib/builder/types";
import {
  buildRecentContextMessages,
  CONTEXT_FIRST_BRIEF_LABEL,
  CONTEXT_RECENT_MESSAGE_COUNT,
} from "./context-helpers";

function user(id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role: "user", content, ...extra };
}

function engine(id: string, content: string): ChatMessage {
  return { id, role: "assistant", content };
}

describe("buildRecentContextMessages", () => {
  it("keeps the whole short conversation without a brief marker", () => {
    const messages = [user("u1", "Bygg en sajt för Zax Frisör"), engine("a1", "Klart.")];

    expect(buildRecentContextMessages(messages)).toEqual([
      { role: "user", content: "Bygg en sajt för Zax Frisör" },
      { role: "assistant", content: "Klart." },
    ]);
  });

  it("leads with the first brief once it has scrolled out of the recent window", () => {
    const messages: ChatMessage[] = [user("brief", "Bygg en sajt för Zax Frisör i Kista")];
    for (let turn = 0; turn < CONTEXT_RECENT_MESSAGE_COUNT; turn += 1) {
      messages.push(user(`u${turn}`, `Ändring ${turn}`), engine(`a${turn}`, `Version ${turn + 2}`));
    }

    const context = buildRecentContextMessages(messages);

    expect(context[0]).toEqual({
      role: "user",
      content: `${CONTEXT_FIRST_BRIEF_LABEL} Bygg en sajt för Zax Frisör i Kista`,
    });
    expect(context).toHaveLength(CONTEXT_RECENT_MESSAGE_COUNT + 1);
    expect(context.at(-1)).toEqual({ role: "assistant", content: `Version ${CONTEXT_RECENT_MESSAGE_COUNT + 1}` });
  });

  it("leaves out the builder's own repair and F3 prompts", () => {
    const messages = [
      user("brief", "Bygg en sajt för Zax Frisör"),
      engine("a1", "Klart."),
      user("fix", "AUTO-FIX REQUEST — TARGETED REPAIR\nFixa importen"),
      user("fix2", "Laga bygget", {
        uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "autofix" }],
      }),
      user("kick", F3_KICK_PROMPT),
      engine("a2", "Lagat."),
    ];

    expect(buildRecentContextMessages(messages).map((message) => message.content)).toEqual([
      "Bygg en sajt för Zax Frisör",
      "Klart.",
      "Lagat.",
    ]);
  });
});

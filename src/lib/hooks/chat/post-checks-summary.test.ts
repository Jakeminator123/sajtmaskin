import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import type { SetMessages } from "./types";
import { appendPostCheckSummaryToMessage } from "./post-checks-summary";

const summary = "[Post-check] Ändringar: +1 ~1 -0\n+ src/app/page.tsx\n~ src/app/layout.tsx";

function appendSummary(content: string) {
  let messages: ChatMessage[] = [
    {
      id: "assistant_1",
      role: "assistant",
      content,
      isStreaming: false,
      uiParts: [],
    },
  ];
  const setMessages: SetMessages = (next) => {
    messages = typeof next === "function" ? next(messages) : next;
  };

  appendPostCheckSummaryToMessage(setMessages, "assistant_1", summary);
  return messages[0]?.content;
}

describe("appendPostCheckSummaryToMessage", () => {
  it("does not append the file diff to fenced generated file content", () => {
    const content = '```tsx file="src/app/page.tsx"\nexport default function Page() {}\n```';

    expect(appendSummary(content)).toBe(content);
  });

  it("does not append the file diff to an unfenced stream file marker", () => {
    const content = 'tsx file="src/app/page.tsx"\nexport default function Page() {}';

    expect(appendSummary(content)).toBe(content);
  });

  it("keeps warnings visible while omitting the generated file diff", () => {
    const content = '```tsx file="src/app/page.tsx"\nexport default function Page() {}\n```';
    const warningSummary = `${summary}\nVarning: Preview blockerades i preflight.\nStatus: Preview-klar`;

    let messages: ChatMessage[] = [
      {
        id: "assistant_1",
        role: "assistant",
        content,
        isStreaming: false,
        uiParts: [],
      },
    ];
    const setMessages: SetMessages = (next) => {
      messages = typeof next === "function" ? next(messages) : next;
    };

    appendPostCheckSummaryToMessage(setMessages, "assistant_1", warningSummary);

    expect(messages[0]?.content).toBe(
      `${content}\n[Post-check]\nVarning: Preview blockerades i preflight.\nStatus: Preview-klar`,
    );
  });

  it.each([
    "Här är ett exempel på en vanlig kodfence:",
    "```ts\nconst file = 'src/app/page.tsx';\n```",
    'I dokumentationen nämns `file="src/app/page.tsx"` som attribut.',
    'Dokumentationen beskriver markören ` ```tsx file="src/app/page.tsx"` utan att strömma en fil.',
  ])("still appends after ordinary markdown code discussion", (content) => {
    expect(appendSummary(content)).toBe(`${content}\n${summary}`);
  });

  it("still appends the file diff to a normal completion", () => {
    expect(appendSummary("Klart, jag har uppdaterat startsidan.")).toBe(
      `Klart, jag har uppdaterat startsidan.\n${summary}`,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  buildBoundedChatHistory,
  compressOldAssistantContent,
} from "./follow-up-history";

const codeHeavyAssistantMessage = [
  "Här kommer designen: jag valde glassmorphism för att matcha ditt premium-tema.",
  "",
  "```tsx file=\"app/page.tsx\"",
  "export default function Page(){",
  "  return <main>".padEnd(600, "x"),
  "}",
  "```",
  "",
  "```tsx file=\"components/hero.tsx\"",
  "export function Hero(){return null}",
  "```",
].join("\n");

describe("compressOldAssistantContent", () => {
  it("keeps short messages untouched", () => {
    const short = "Ändrade titeln enligt din önskan.";
    expect(compressOldAssistantContent(short)).toBe(short);
  });

  it("replaces heavy CodeProject output with a prose + file summary", () => {
    const compressed = compressOldAssistantContent(codeHeavyAssistantMessage);
    expect(compressed).toContain("glassmorphism");
    expect(compressed).toContain("Earlier code generation");
    expect(compressed).toContain("app/page.tsx");
    expect(compressed).toContain("components/hero.tsx");
    expect(compressed).not.toContain("export default function Page");
    expect(compressed).not.toContain("export function Hero");
    expect(compressed.length).toBeLessThan(codeHeavyAssistantMessage.length);
  });
});

describe("buildBoundedChatHistory", () => {
  it("keeps the most recent assistant turn intact and compresses earlier ones", () => {
    const history = [
      { role: "user", content: "Bygg en sajt för mitt bageri." },
      { role: "assistant", content: codeHeavyAssistantMessage },
      { role: "user", content: "Lägg till öppettider." },
      { role: "assistant", content: codeHeavyAssistantMessage },
    ];

    const bounded = buildBoundedChatHistory(history);

    expect(bounded).toHaveLength(4);
    expect(bounded[1].role).toBe("assistant");
    expect(bounded[1].content).not.toBe(codeHeavyAssistantMessage);
    expect(bounded[1].content).toContain("Earlier code generation");

    expect(bounded[3].role).toBe("assistant");
    expect(bounded[3].content).toBe(codeHeavyAssistantMessage);
  });

  it("caps history to recentCount when exceeding the window", () => {
    const history: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < 6; i++) {
      history.push({ role: "user", content: `message ${i}` });
      history.push({ role: "assistant", content: codeHeavyAssistantMessage });
    }

    const bounded = buildBoundedChatHistory(history);

    expect(bounded).toHaveLength(8);
    const lastAssistant = [...bounded].reverse().find((m) => m.role === "assistant");
    expect(lastAssistant?.content).toBe(codeHeavyAssistantMessage);
  });

  it("filters out non-user/assistant roles", () => {
    const history = [
      { role: "system", content: "ignore me" },
      { role: "user", content: "Hej" },
      { role: "assistant", content: "Hej!" },
    ];

    const bounded = buildBoundedChatHistory(history);

    expect(bounded).toEqual([
      { role: "user", content: "Hej" },
      { role: "assistant", content: "Hej!" },
    ]);
  });

  it("anchors the window so the preserved assistant turn survives a long user-only tail", () => {
    // Pathological shape: one assistant turn at the start, then many user
    // turns (no intervening assistants). `slice(-recentCount)` alone would
    // drop the assistant entirely. The anchor fix keeps it.
    const history: Array<{ role: string; content: string }> = [
      { role: "user", content: "start" },
      { role: "assistant", content: codeHeavyAssistantMessage },
    ];
    for (let i = 0; i < 10; i++) {
      history.push({ role: "user", content: `follow-up ${i}` });
    }

    const bounded = buildBoundedChatHistory(history);

    const assistants = bounded.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0].content).toBe(codeHeavyAssistantMessage);
  });
});

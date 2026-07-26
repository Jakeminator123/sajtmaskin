import { describe, expect, it } from "vitest";
import {
  buildOpenClawContextMessages,
  compressAssistantCodeBlocks,
} from "./openclaw-context-messages";

const BIG_CODE = "const x = 1;\n".repeat(4_000);

describe("compressAssistantCodeBlocks", () => {
  it("komprimerar 50 kB kod till en kort markör som säger hur många filer det gällde", () => {
    const content = [
      "Klart! Jag byggde sidorna.",
      '```tsx file="app/page.tsx"',
      BIG_CODE,
      "```",
      '```tsx file="app/om/page.tsx"',
      BIG_CODE,
      "```",
    ].join("\n");

    expect(content.length).toBeGreaterThan(50_000);

    const compressed = compressAssistantCodeBlocks(content);

    expect(compressed.length).toBeLessThan(200);
    expect(compressed).toContain("Klart! Jag byggde sidorna.");
    expect(compressed).toContain("2 filer");
    expect(compressed).toContain("app/page.tsx");
    expect(compressed).not.toContain("const x = 1;");
  });

  it("håller markören kort även när filerna är många", () => {
    const blocks = Array.from({ length: 30 }, (_, index) =>
      [`\`\`\`tsx file="app/en/ganska/lang/sokvag/sida-${index}/page.tsx"`, BIG_CODE, "```"].join(
        "\n",
      ),
    );

    const compressed = compressAssistantCodeBlocks(blocks.join("\n"));

    expect(compressed.length).toBeLessThan(200);
    expect(compressed).toContain("30 filer");
    expect(compressed).toContain("…");
  });

  it("räknar oavslutade kodblock", () => {
    const compressed = compressAssistantCodeBlocks(
      ['Bygger nu.', '```tsx file="app/page.tsx"', BIG_CODE].join("\n"),
    );

    expect(compressed).toContain("1 fil");
    expect(compressed).not.toContain("const x = 1;");
  });

  it("lämnar text utan kodblock orörd", () => {
    const content = "Jag la logiken i app/page.tsx så att den körs på servern.";
    expect(compressAssistantCodeBlocks(content)).toBe(content);
  });
});

describe("buildOpenClawContextMessages", () => {
  const options = { recentCount: 5, maxChars: 3_000 };

  it("behåller användarens egna kodblock", () => {
    const pasted = ["Varför kraschar den här?", "```ts", "const a: number = 'x';", "```"].join("\n");

    const [message] = buildOpenClawContextMessages([{ role: "user", content: pasted }], options);

    expect(message.content).toBe(pasted);
    expect(message.content).toContain("const a: number = 'x';");
  });

  it("komprimerar bara assistentens kodblock", () => {
    const messages = [
      { role: "user", content: ["Se koden:", "```ts", "const a = 1;", "```"].join("\n") },
      { role: "assistant", content: ["Fixat.", '```tsx file="app/page.tsx"', BIG_CODE, "```"].join("\n") },
    ];

    const [user, assistant] = buildOpenClawContextMessages(messages, options);

    expect(user.content).toContain("const a = 1;");
    expect(assistant.content).not.toContain("const x = 1;");
    expect(assistant.content).toContain("app/page.tsx");
  });

  it("tar bara med de senaste meddelandena och klipper till maxlängd", () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
      role: "user",
      content: `meddelande-${index}`.padEnd(5_000, "."),
    }));

    const result = buildOpenClawContextMessages(messages, options);

    expect(result).toHaveLength(5);
    expect(result[0].content.startsWith("meddelande-3")).toBe(true);
    expect(result[0].content).toHaveLength(3_000);
  });

  it("markerar icke-textinnehåll som strukturerat", () => {
    const [message] = buildOpenClawContextMessages([{ role: "assistant", content: { a: 1 } }], options);
    expect(message.content).toBe("[structured]");
  });
});

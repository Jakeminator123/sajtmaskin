import { describe, expect, it, vi, beforeEach } from "vitest";

const streamTextMock = vi.hoisted(() => vi.fn());
const getOpenAIModelMock = vi.hoisted(() => vi.fn(() => ({ id: "mock-model" })));

vi.mock("ai", () => ({
  streamText: streamTextMock,
}));

vi.mock("../models", () => ({
  getOpenAIModel: getOpenAIModelMock,
}));

import { runLlmFixer } from "./llm-fixer";

describe("runLlmFixer merge behavior", () => {
  beforeEach(() => {
    streamTextMock.mockReset();
    getOpenAIModelMock.mockClear();
  });

  it("merges fixed files deterministically by parsed path", async () => {
    const original = [
      '```tsx file="app/page.tsx"',
      "export default function Page(){ return <div>Old</div>; }",
      "```",
      "",
      '```tsx file="app/layout.tsx"',
      "export default function Layout({ children }: { children: React.ReactNode }) {",
      "  return <html><body>{children}</body></html>;",
      "}",
      "```",
    ].join("\n");

    const llmOutput = [
      '```tsx file="app/page.tsx"',
      "export default function Page(){ return <main>New</main>; }",
      "```",
      "",
      '```ts file="lib/constants.ts"',
      "export const SITE_NAME = 'Sajtmaskin';",
      "```",
    ].join("\n");

    streamTextMock.mockReturnValue({
      text: Promise.resolve(llmOutput),
    });

    const result = await runLlmFixer(original, ["app/page.tsx:1:1 broken"], {
      requiredFiles: ["app/page.tsx"],
    });

    expect(result.success).toBe(true);
    expect(result.fixedFiles).toEqual(["app/page.tsx", "lib/constants.ts"]);
    expect(result.fixedContent).toContain('```tsx file="app/page.tsx"');
    expect(result.fixedContent).toContain("return <main>New</main>");
    expect(result.fixedContent).toContain('```tsx file="app/layout.tsx"');
    expect(result.fixedContent).toContain('```ts file="lib/constants.ts"');
  });

  it("falls back to serialized fixed files when original content is not parseable", async () => {
    const llmOutput = [
      '```tsx file="app/page.tsx"',
      "export default function Page(){ return <main />; }",
      "```",
    ].join("\n");
    streamTextMock.mockReturnValue({
      text: Promise.resolve(llmOutput),
    });

    const result = await runLlmFixer("not-a-codeproject", ["app/page.tsx:1:1 broken"]);

    expect(result.success).toBe(true);
    expect(result.fixedContent).toBe(llmOutput);
  });
});

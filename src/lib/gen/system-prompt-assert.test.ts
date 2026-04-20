import { describe, expect, it } from "vitest";
import { assertSystemPromptShape } from "./system-prompt-assert";
import { SYSTEM_PROMPT_SEPARATOR } from "./system-prompt";

const PADDING = "x".repeat(300);

function buildHealthyPrompt(extra = ""): string {
  return `# Static Core\n${PADDING}${SYSTEM_PROMPT_SEPARATOR}# Dynamic\n${extra}`;
}

describe("assertSystemPromptShape", () => {
  it("passes a healthy prompt", () => {
    const result = assertSystemPromptShape(buildHealthyPrompt());
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.hasBlocker).toBe(false);
  });

  it("flags an empty/short prompt as a blocker", () => {
    const result = assertSystemPromptShape("hi");
    expect(result.ok).toBe(false);
    expect(result.hasBlocker).toBe(true);
    expect(result.issues.some((i) => i.code === "empty")).toBe(true);
  });

  it("flags a missing separator as a blocker", () => {
    const result = assertSystemPromptShape(`# Static Core\n${PADDING}\nNo separator here.`);
    expect(result.hasBlocker).toBe(true);
    expect(result.issues.some((i) => i.code === "missing-separator")).toBe(true);
  });

  it("warns on a long literal \\n run (JSON-double-encoded leakage)", () => {
    const corrupted = buildHealthyPrompt("some line\\n\\n\\n\\n\\nmore");
    const result = assertSystemPromptShape(corrupted);
    expect(result.hasBlocker).toBe(false);
    expect(result.issues.some((i) => i.code === "literal-newline-runs")).toBe(true);
  });

  it("warns on a 4+-backslash run (escape inflation)", () => {
    const corrupted = buildHealthyPrompt("oh no \\\\\\\\ runs");
    const result = assertSystemPromptShape(corrupted);
    expect(result.issues.some((i) => i.code === "suspicious-double-backslash")).toBe(true);
  });

  it("warns on unbalanced triple-backtick fences", () => {
    const unbalanced = buildHealthyPrompt("```ts\nconst x = 1;\n");
    const result = assertSystemPromptShape(unbalanced);
    expect(result.issues.some((i) => i.code === "unbalanced-code-fences")).toBe(true);
  });

  it("does not warn on balanced fences", () => {
    const balanced = buildHealthyPrompt("```ts\nconst x = 1;\n```");
    const result = assertSystemPromptShape(balanced);
    expect(result.issues.some((i) => i.code === "unbalanced-code-fences")).toBe(false);
  });

  it("does not warn on legit single \\n inside a regex example", () => {
    const legit = buildHealthyPrompt("Use the regex /^foo\\nbar$/ to match…");
    const result = assertSystemPromptShape(legit);
    expect(result.issues.some((i) => i.code === "literal-newline-runs")).toBe(false);
  });
});

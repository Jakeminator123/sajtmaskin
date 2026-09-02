import { describe, expect, it } from "vitest";

import { buildFixerUserPrompt, focusCodeProjectForFixer } from "./fixer-prompt";

function fence(path: string, body: string, lang = "ts"): string {
  return `\`\`\`${lang} file="${path}"\n${body}\n\`\`\``;
}

describe("focusCodeProjectForFixer", () => {
  it("leaves small projects untruncated", () => {
    const content = fence("app/page.tsx", "export default function Page() { return null; }", "tsx");
    const result = focusCodeProjectForFixer(content, ["app/page.tsx"]);
    expect(result.truncated).toBe(false);
    expect(result.promptContent).toBe(content);
  });

  it("keeps error-referenced files in full and stubs the rest without dropping paths", () => {
    const keepBody = "export const KEEP = 1;\n".repeat(20);
    const otherBody = "export const OTHER = '" + "x".repeat(80_000) + "';";
    const extraBody = "export const EXTRA = '" + "y".repeat(80_000) + "';";
    const content = [
      fence("app/page.tsx", keepBody, "tsx"),
      fence("lib/other.ts", otherBody),
      fence("lib/extra.ts", extraBody),
    ].join("\n\n");

    const result = focusCodeProjectForFixer(content, ["app/page.tsx"]);
    expect(result.truncated).toBe(true);
    expect(result.promptContent).toContain("export const KEEP = 1;");
    expect(result.promptContent).toContain('file="lib/other.ts"');
    expect(result.promptContent).toContain('file="lib/extra.ts"');
    expect(result.promptContent).toContain("// ... unchanged");
    expect(result.promptContent).not.toContain("x".repeat(80_000));
    expect(result.promptContent).not.toContain("y".repeat(80_000));
  });
});

describe("buildFixerUserPrompt", () => {
  it("includes file:line diagnostics, required files, and only-changed-files instruction", () => {
    const content = fence("app/page.tsx", "export default function Page() { return <div /> }", "tsx");
    const prompt = buildFixerUserPrompt(content, ['app/page.tsx:4:7 Expected "}"'], {
      requiredFiles: ["app/page.tsx"],
    });
    expect(prompt).toContain("Primary blocking diagnostics:");
    expect(prompt).toContain('1. app/page.tsx:4:7 Expected "}"');
    expect(prompt).toContain("Files that likely need edits first:");
    expect(prompt).toContain("- app/page.tsx");
    expect(prompt).toContain("Return only changed files.");
    expect(prompt).toContain(content);
  });
});

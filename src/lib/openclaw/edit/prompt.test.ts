import { describe, expect, it } from "vitest";
import { buildEditOpsPrompt } from "./prompt";

const files = [
  { path: "app/globals.css", content: ":root{--brand:pink}", language: "css" },
  { path: "app/page.tsx", content: "export default function Page(){return null}", language: "tsx" },
];

describe("buildEditOpsPrompt", () => {
  it("puts the instruction and every file into the user message", () => {
    const prompt = buildEditOpsPrompt({
      instruction: "gör färgen blå istället för rosa",
      files,
    });
    expect(prompt.user).toContain("gör färgen blå istället för rosa");
    expect(prompt.user).toContain("--- app/globals.css ---");
    expect(prompt.user).toContain(":root{--brand:pink}");
    expect(prompt.user).toContain("--- app/page.tsx ---");
    expect(prompt.includedPaths).toEqual(["app/globals.css", "app/page.tsx"]);
    expect(prompt.truncated).toBe(false);
  });

  it("instructs strict-JSON deterministic ops with a verbatim find", () => {
    const prompt = buildEditOpsPrompt({ instruction: "x", files });
    expect(prompt.system).toContain("replace_text");
    expect(prompt.system).toContain("replace_content");
    expect(prompt.system).toContain("delete_file");
    // The single hardest requirement: find must be copied verbatim.
    expect(prompt.system).toContain("ORDAGRANT");
  });

  it("truncates by dropping later files but always keeps at least the first", () => {
    const prompt = buildEditOpsPrompt({
      instruction: "x",
      files,
      maxFileChars: 5, // smaller than the first block → still keeps the first
    });
    expect(prompt.includedPaths).toEqual(["app/globals.css"]);
    expect(prompt.truncated).toBe(true);
    expect(prompt.user).not.toContain("--- app/page.tsx ---");
  });
});

import { describe, expect, it } from "vitest";
import { applyQuickEdits } from "./apply";
import type { CodeFile } from "@/lib/gen/parser";

const baseFiles: CodeFile[] = [
  {
    path: "app/page.tsx",
    content: "export default function Page() {\n  return <h1>Hello world</h1>;\n}\n",
    language: "tsx",
  },
  {
    path: "components/Hero.tsx",
    content: "export function Hero() {\n  return <p>Hello</p>;\n}\nexport const x = 'Hello';\n",
    language: "tsx",
  },
];

describe("applyQuickEdits", () => {
  it("replaces a unique literal text and reports the changed path", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "replace_text", path: "app/page.tsx", find: "Hello world", replace: "Hej v\u00e4rlden" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changedPaths).toEqual(["app/page.tsx"]);
      const page = result.files.find((f) => f.path === "app/page.tsx");
      expect(page?.content).toContain("Hej v\u00e4rlden");
      // unrelated file untouched
      expect(result.files.find((f) => f.path === "components/Hero.tsx")?.content).toBe(
        baseFiles[1]!.content,
      );
    }
  });

  it("rejects ambiguous matches when no occurrence is given", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "replace_text", path: "components/Hero.tsx", find: "Hello", replace: "Hej" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ambiguous_match");
    }
  });

  it("replaces the chosen occurrence when ambiguous match is disambiguated", () => {
    const result = applyQuickEdits(baseFiles, [
      {
        kind: "replace_text",
        path: "components/Hero.tsx",
        find: "Hello",
        replace: "Hej",
        occurrence: 2,
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const hero = result.files.find((f) => f.path === "components/Hero.tsx");
      // first stays, second replaced
      expect(hero?.content).toBe(
        "export function Hero() {\n  return <p>Hello</p>;\n}\nexport const x = 'Hej';\n",
      );
    }
  });

  it("fails when the literal is not found", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "replace_text", path: "app/page.tsx", find: "nope", replace: "x" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_match");
  });

  it("fails when the target file does not exist", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "replace_text", path: "app/missing.tsx", find: "x", replace: "y" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("file_not_found");
  });

  it("replaces full file content and preserves language", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "replace_content", path: "app/page.tsx", content: "export default function Page(){return null;}" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const page = result.files.find((f) => f.path === "app/page.tsx");
      expect(page?.content).toBe("export default function Page(){return null;}");
      expect(page?.language).toBe("tsx");
    }
  });

  it("treats a no-op content replacement as no_change", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "replace_content", path: "app/page.tsx", content: baseFiles[0]!.content },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_change");
  });

  it("rejects unsafe paths", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "replace_content", path: "../escape.tsx", content: "x" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsafe_path");
  });

  it("creates a new file via replace_content", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "replace_content", path: "components/New.tsx", content: "export const New = 1;" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changedPaths).toEqual(["components/New.tsx"]);
      expect(result.files.some((f) => f.path === "components/New.tsx")).toBe(true);
    }
  });

  it("deletes an existing file and reports removedPaths", () => {
    const filesWithRoute: CodeFile[] = [
      ...baseFiles,
      { path: "app/blog/page.tsx", content: "export default function P(){return null;}", language: "tsx" },
    ];
    const result = applyQuickEdits(filesWithRoute, [
      { kind: "delete_file", path: "app/blog/page.tsx" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removedPaths).toEqual(["app/blog/page.tsx"]);
      expect(result.changedPaths).toEqual(["app/blog/page.tsx"]);
      expect(result.files.some((f) => f.path === "app/blog/page.tsx")).toBe(false);
    }
  });

  it("fails to delete a missing file", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "delete_file", path: "app/ghost/page.tsx" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("file_not_found");
  });

  it("refuses to delete a protected essential file", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "delete_file", path: "app/page.tsx" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("protected_path");
  });
});

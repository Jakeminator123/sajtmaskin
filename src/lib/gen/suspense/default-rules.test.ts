import { describe, it, expect } from "vitest";
import {
  createDefaultRules,
  createPreviewOnlyRules,
  applyPreviewOnlyRules,
} from "./default-rules";
import { SuspenseLineProcessor } from "@/lib/gen/stream/sse-parser";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import type { CodeFile } from "@/lib/gen/parser";

const STRIP_MARKER = "(stripped for preview compatibility)";

function streamThrough(source: string, scope: "canonical" | "preview"): string {
  const processor = new SuspenseLineProcessor(createDefaultRules(scope), {
    urlMap: { hero_1: "https://cdn.example.com/hero.png" },
  });
  return processor.process(source) + processor.flush();
}

const SERVER_FILE = [
  `import { cookies } from "next/headers";`,
  `import { ImageResponse } from "next/og";`,
  `export default function Page() {`,
  `  return <img src="/ai/hero-shot.png" class="rounded" />;`,
  `}`,
  `const url = "{{hero_1}}";`,
].join("\n");

describe("suspense rule scopes", () => {
  it("keeps forbidden server imports intact in the canonical (saved) output", () => {
    const saved = streamThrough(SERVER_FILE, "canonical");
    expect(saved).toContain(`import { cookies } from "next/headers";`);
    expect(saved).toContain(`import { ImageResponse } from "next/og";`);
    expect(saved).not.toContain(STRIP_MARKER);
    expect(saved).not.toContain("not available in preview");
  });

  it("keeps canonical repairs in the saved output", () => {
    const saved = streamThrough(SERVER_FILE, "canonical");
    expect(saved).toContain("https://cdn.example.com/hero.png");
    expect(saved).toContain(`className="rounded"`);
    expect(saved).toContain("/placeholder.svg?height=400&width=600&text=hero%2Bshot");
    expect(saved).not.toContain(`src="/ai/hero-shot.png"`);
  });

  it("strips forbidden server imports in the preview scope", () => {
    const preview = streamThrough(SERVER_FILE, "preview");
    expect(preview).toContain(`// import { cookies } from "next/headers"; ${STRIP_MARKER}`);
    expect(preview).toContain("// next/og not available in preview");
    expect(preview).toContain("https://cdn.example.com/hero.png");
    expect(preview).toContain(`className="rounded"`);
  });

  it("applies preview-only rules to already-saved content", () => {
    const saved = streamThrough(SERVER_FILE, "canonical");
    const preview = applyPreviewOnlyRules(saved);
    expect(preview).toContain(STRIP_MARKER);
    expect(preview).toContain("// next/og not available in preview");
    expect(preview).toContain("https://cdn.example.com/hero.png");
  });

  it("declares every rule in exactly one scope", () => {
    const canonicalNames = createDefaultRules("canonical").map((r) => r.name);
    const previewOnlyNames = createPreviewOnlyRules().map((r) => r.name);
    const allNames = createDefaultRules("preview").map((r) => r.name);
    expect(previewOnlyNames).toEqual(["next-og-strip", "forbidden-import-strip"]);
    expect(canonicalNames.some((n) => previewOnlyNames.includes(n))).toBe(false);
    expect(new Set(allNames).size).toBe(allNames.length);
    expect(allNames).toEqual([...canonicalNames, ...previewOnlyNames]);
  });

  it("saved output with next/headers passes project-sanity", () => {
    const saved = streamThrough(SERVER_FILE, "canonical");
    const files: CodeFile[] = [
      { path: "app/page.tsx", content: saved, language: "tsx" } as CodeFile,
      {
        path: "package.json",
        content: JSON.stringify({ name: "site", dependencies: { next: "15.0.0" } }),
        language: "json",
      } as CodeFile,
    ];
    const result = runProjectSanityChecks(files);
    expect(
      result.issues.filter(
        (i) => i.category === "code_structure_failure" && i.severity === "error",
      ),
    ).toEqual([]);
  });

  it("project-sanity still rejects a stripped preview import in saved files", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content: `// import { cookies } from "next/headers"; ${STRIP_MARKER}\nexport default function Page() { return <div />; }\n`,
        language: "tsx",
      } as CodeFile,
      {
        path: "package.json",
        content: JSON.stringify({ name: "site", dependencies: { next: "15.0.0" } }),
        language: "json",
      } as CodeFile,
    ];
    const result = runProjectSanityChecks(files);
    expect(
      result.issues.some((i) => i.message.includes("Preview-only stripped import")),
    ).toBe(true);
  });
});

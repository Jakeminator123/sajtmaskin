import { describe, expect, it } from "vitest";
import { buildFileContext } from "./file-context-builder";
import type { CodeFile } from "../parser";

function makeFile(path: string, body: string): CodeFile {
  const ext = path.split(".").pop() ?? "";
  return { path, content: body, language: ext };
}

const PIN_GLOBAL_CSS = "/* PIN_GLOBALS_MARKER */ body { background: oklch(0.2 0 0); }";
const PIN_LAYOUT_TSX = "/* PIN_LAYOUT_MARKER */ export default function Layout() { return null; }";

describe("buildFileContext pinnedFiles (Fix A)", () => {
  it("includes pinned files with full content even when maxFilesWithContent would exclude them", () => {
    const files: CodeFile[] = [
      makeFile("app/page.tsx", "// page\n".repeat(5)),
      makeFile("components/A.tsx", "// a\n".repeat(5)),
      makeFile("components/B.tsx", "// b\n".repeat(5)),
      makeFile("components/C.tsx", "// c\n".repeat(5)),
      makeFile("components/D.tsx", "// d\n".repeat(5)),
      makeFile("components/E.tsx", "// e\n".repeat(5)),
      makeFile("app/globals.css", PIN_GLOBAL_CSS),
      makeFile("app/layout.tsx", PIN_LAYOUT_TSX),
    ];

    const ctx = buildFileContext({
      files,
      includeContents: true,
      maxFilesWithContent: 2,
      pinnedFiles: ["app/globals.css", "app/layout.tsx"],
      maxChars: 20_000,
    });

    expect(ctx.summary).toContain("PIN_GLOBALS_MARKER");
    expect(ctx.summary).toContain("PIN_LAYOUT_MARKER");
  });

  it("ignores pinned paths that don't exist in files", () => {
    const files: CodeFile[] = [makeFile("app/page.tsx", "// page")];

    const ctx = buildFileContext({
      files,
      includeContents: true,
      maxFilesWithContent: 4,
      pinnedFiles: ["app/globals.css", "app/page.tsx"],
      maxChars: 20_000,
    });

    expect(ctx.summary).toContain("app/page.tsx");
    expect(ctx.totalFiles).toBe(1);
  });

  it("emits pinned files first in the content section", () => {
    const files: CodeFile[] = [
      makeFile("app/page.tsx", "/* PAGE_MARKER */"),
      makeFile("app/globals.css", PIN_GLOBAL_CSS),
    ];

    const ctx = buildFileContext({
      files,
      includeContents: true,
      maxFilesWithContent: 4,
      pinnedFiles: ["app/globals.css"],
      maxChars: 20_000,
    });

    const pinIdx = ctx.summary.indexOf("PIN_GLOBALS_MARKER");
    const pageIdx = ctx.summary.indexOf("PAGE_MARKER");
    expect(pinIdx).toBeGreaterThan(0);
    expect(pageIdx).toBeGreaterThan(0);
    expect(pinIdx).toBeLessThan(pageIdx);
  });

  it("dedupes repeated pinned paths", () => {
    const files: CodeFile[] = [
      makeFile("app/globals.css", PIN_GLOBAL_CSS),
      makeFile("app/page.tsx", "// page"),
    ];

    const ctx = buildFileContext({
      files,
      includeContents: true,
      maxFilesWithContent: 4,
      pinnedFiles: ["app/globals.css", "app/globals.css"],
      maxChars: 20_000,
    });

    const matches = ctx.summary.match(/PIN_GLOBALS_MARKER/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import {
  buildFollowUpFileContextDecision,
  extractReferencedFilePathsFromMessage,
} from "./follow-up-file-context";

const previousFiles: CodeFile[] = [
  { path: "app/page.tsx", language: "tsx", content: "export default function Page(){return <main><Hero/><Menu/><Contact/></main>}" },
  { path: "app/layout.tsx", language: "tsx", content: "export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}" },
  { path: "app/globals.css", language: "css", content: "@import 'tailwindcss';\n@theme inline { --color-background: oklch(1 0 0); }" },
  { path: "components/hero.tsx", language: "tsx", content: "export function Hero(){return <section><h1>Kaffekoppen</h1></section>}" },
  { path: "components/menu.tsx", language: "tsx", content: "export function Menu(){return <section>Meny</section>}" },
  { path: "components/contact.tsx", language: "tsx", content: "export function Contact(){return <section>Kontakt</section>}" },
  { path: "components/footer.tsx", language: "tsx", content: "export function Footer(){return <footer/>}" },
  { path: "components/three-canvas-shell.tsx", language: "tsx", content: "export function ThreeCanvasShell(){return null}" },
];

describe("buildFollowUpFileContextDecision", () => {
  it("uses light context for short copy edits", () => {
    const decision = buildFollowUpFileContextDecision({
      message: "Byt rubriken i hero till Kaffe med hjärta.",
      previousFiles,
      followUpIntent: "clear-refine",
    });

    expect(decision.contextPolicy).toBe("light");
    expect(decision.maxChars).toBe(32_000);
    expect(decision.fileContext.summary.length).toBeLessThan(32_000);
  });

  it("pins layout and globals for visual follow-ups", () => {
    const decision = buildFollowUpFileContextDecision({
      message: "Gör bakgrunden mörkare och ändra färgerna.",
      previousFiles,
      followUpIntent: "clear-refine",
    });

    expect(decision.pinnedFiles).toEqual(["app/globals.css", "app/layout.tsx"]);
    expect(decision.fileContext.summary).toContain("### app/globals.css");
    expect(decision.fileContext.summary).toContain("### app/layout.tsx");
  });

  it("pins the failing file when the message cites a typecheck target", () => {
    const decision = buildFollowUpFileContextDecision({
      message: [
        "AUTO-FIX REQUEST — TARGETED REPAIR",
        "",
        "Issues detected:",
        "- [quality-gate:typecheck:output] components/three-canvas-shell.tsx(11,23): error TS2304: Cannot find name 'dynamic'.",
      ].join("\n"),
      previousFiles,
      followUpIntent: "clear-refine",
      skipIntentClassification: true,
    });

    expect(decision.pinnedFiles).toEqual(["components/three-canvas-shell.tsx"]);
    expect(decision.fileContext.summary).toContain("### components/three-canvas-shell.tsx");
  });

  it("merges error-referenced paths with design-signal pins without duplicates", () => {
    const decision = buildFollowUpFileContextDecision({
      message: [
        "Gör bakgrunden mörkare och fixa TS-felet:",
        "components/three-canvas-shell.tsx(11,23): error TS2304",
      ].join("\n"),
      previousFiles,
      followUpIntent: "clear-refine",
    });

    // Error-referenced paths come first so they get priority in
    // buildFileContext's pinned-selection loop, then the design pins.
    expect(decision.pinnedFiles).toEqual([
      "components/three-canvas-shell.tsx",
      "app/globals.css",
      "app/layout.tsx",
    ]);
  });

  it("ignores error-referenced paths that are not in previousFiles", () => {
    const decision = buildFollowUpFileContextDecision({
      message: "components/does-not-exist.tsx:1:1 error",
      previousFiles,
      followUpIntent: "clear-refine",
      skipIntentClassification: true,
    });

    expect(decision.pinnedFiles).toEqual([]);
  });
});

describe("extractReferencedFilePathsFromMessage", () => {
  it("parses typescript-style diagnostics", () => {
    expect(
      extractReferencedFilePathsFromMessage(
        "components/three-canvas-shell.tsx(11,23): error TS2304",
      ),
    ).toEqual(["components/three-canvas-shell.tsx"]);
  });

  it("parses line:col style and deduplicates", () => {
    expect(
      extractReferencedFilePathsFromMessage(
        "./app/page.tsx:12:5 error\napp/page.tsx:20 warning",
      ),
    ).toEqual(["app/page.tsx"]);
  });

  it("ignores urls and bare filenames without a directory", () => {
    expect(
      extractReferencedFilePathsFromMessage(
        "See https://example.com/foo.ts for context; also package.json is fine.",
      ),
    ).toEqual([]);
  });

  it("captures multiple distinct paths in first-seen order", () => {
    expect(
      extractReferencedFilePathsFromMessage(
        [
          "components/a.tsx(1,1): error",
          "components/b.tsx:2: error",
          "app/page.tsx - warning",
        ].join("\n"),
      ),
    ).toEqual(["components/a.tsx", "components/b.tsx", "app/page.tsx"]);
  });
});

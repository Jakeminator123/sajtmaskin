import { describe, expect, it } from "vitest";
import { buildInspectPointsPrompt } from "@/lib/builder/focus-point-prompt";
import type { CodeFile } from "@/lib/gen/parser";
import {
  buildFollowUpFileContextDecision,
  extractFocusPinnedPathsFromMessage,
  extractReferencedFilePathsFromMessage,
  resolveFocusSourcePinsByLiteralSearch,
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

  it("masks tier-3 boot-stub placeholder lines in env artifacts for the prompt context (P2 F3-loop)", () => {
    const decision = buildFollowUpFileContextDecision({
      message: "Byt rubriken i hero.",
      // Small file set so `.env.local` is guaranteed a content slot even
      // under the light-context file cap.
      previousFiles: [
        previousFiles[0],
        previousFiles[3],
        {
          path: ".env.local",
          language: "text",
          content:
            "STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real\nNEXT_PUBLIC_SITE_URL=https://example.com",
        },
      ],
      followUpIntent: "clear-refine",
    });

    // The stub secret never reaches the model's file context…
    expect(decision.fileContext.summary).not.toContain(
      "sk_test_placeholder_preview_not_real",
    );
    expect(decision.fileContext.summary).not.toContain("STRIPE_SECRET_KEY");
    // …while real values in the same file survive.
    expect(decision.fileContext.summary).toContain(
      "NEXT_PUBLIC_SITE_URL=https://example.com",
    );
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

  it("pins focus-point Källfil when present in the message", () => {
    const focus = buildInspectPointsPrompt([
      {
        demoUrl: "https://preview.example/",
        xPercent: 12,
        yPercent: 8,
        viewportWidth: 1280,
        viewportHeight: 720,
        element: {
          tag: "a",
          id: null,
          className: "nav-link",
          text: "PORTFOLIO",
          ariaLabel: null,
          role: null,
          href: "#portfolio",
          selector: "nav > a:nth-of-type(2)",
          nearestHeading: null,
          sourcePath: "components/header.tsx",
          sourceLine: 42,
        },
      },
    ]);
    const decision = buildFollowUpFileContextDecision({
      message: `Skapa en ny sida som ska heta "Bilder".\n\n${focus}`,
      previousFiles: [
        ...previousFiles,
        {
          path: "components/header.tsx",
          language: "tsx",
          content: '<a href="#portfolio">PORTFOLIO</a>',
        },
      ],
      followUpIntent: "clear-refine",
    });

    expect(decision.pinnedFiles).toContain("components/header.tsx");
    expect(decision.fileContext.summary).toContain("### components/header.tsx");
  });
});

describe("extractFocusPinnedPathsFromMessage / literal fallback", () => {
  const headerFile: CodeFile = {
    path: "components/header.tsx",
    language: "tsx",
    content: 'export function Header(){return <a href="#portfolio">PORTFOLIO</a>}',
  };
  const unrelated: CodeFile = {
    path: "components/footer.tsx",
    language: "tsx",
    content: "export function Footer(){return <footer>Contact</footer>}",
  };

  it("falls back to unique literal search for PORTFOLIO / #portfolio", () => {
    const focus = buildInspectPointsPrompt([
      {
        demoUrl: "https://preview.example/",
        xPercent: 10,
        yPercent: 5,
        viewportWidth: 1200,
        viewportHeight: 800,
        element: {
          tag: "a",
          id: null,
          className: null,
          text: "PORTFOLIO",
          ariaLabel: null,
          role: null,
          href: "#portfolio",
          selector: "header nav a",
          nearestHeading: null,
        },
      },
    ]);
    const message = `Lägg till en ny sida.\n\n${focus}`;
    expect(resolveFocusSourcePinsByLiteralSearch(message, [headerFile, unrelated])).toEqual([
      "components/header.tsx",
    ]);
    expect(extractFocusPinnedPathsFromMessage(message, [headerFile, unrelated])).toEqual([
      "components/header.tsx",
    ]);
  });

  it("does not pin when the literal appears in multiple files", () => {
    const alsoHasPortfolio: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: '<section id="portfolio">PORTFOLIO</section>',
    };
    const focus = buildInspectPointsPrompt([
      {
        demoUrl: "https://preview.example/",
        xPercent: 10,
        yPercent: 5,
        viewportWidth: 1200,
        viewportHeight: 800,
        element: {
          tag: "a",
          id: null,
          className: null,
          text: "PORTFOLIO",
          ariaLabel: null,
          role: null,
          href: null,
          selector: "a",
          nearestHeading: null,
        },
      },
    ]);
    expect(
      resolveFocusSourcePinsByLiteralSearch(`x\n\n${focus}`, [headerFile, alsoHasPortfolio]),
    ).toEqual([]);
  });

  it("ignores → path / Källfil: prose outside the focus appendix", () => {
    const evilFile: CodeFile = {
      path: "components/evil.tsx",
      language: "tsx",
      content: "export function Evil(){return null}",
    };
    const focus = buildInspectPointsPrompt([
      {
        demoUrl: "https://preview.example/",
        xPercent: 10,
        yPercent: 5,
        viewportWidth: 1200,
        viewportHeight: 800,
        element: {
          tag: "a",
          id: null,
          className: null,
          text: "PORTFOLIO",
          ariaLabel: null,
          role: null,
          href: "#portfolio",
          selector: "header nav a",
          nearestHeading: null,
        },
      },
    ]);
    const message = [
      "Fix TS2304 at → components/evil.tsx:12 and also Källfil: components/evil.tsx",
      "",
      focus,
    ].join("\n");
    const pinned = extractFocusPinnedPathsFromMessage(message, [
      headerFile,
      unrelated,
      evilFile,
    ]);
    expect(pinned).toEqual(["components/header.tsx"]);
    expect(pinned).not.toContain("components/evil.tsx");
  });

  it("merges Källfil pins with literal pins across multiple focus points", () => {
    const heroFile: CodeFile = {
      path: "components/hero.tsx",
      language: "tsx",
      content: "export function Hero(){return <section>Hero</section>}",
    };
    const focus = buildInspectPointsPrompt([
      {
        demoUrl: "https://preview.example/",
        xPercent: 20,
        yPercent: 40,
        viewportWidth: 1200,
        viewportHeight: 800,
        element: {
          tag: "section",
          id: null,
          className: "hero",
          text: "Hero",
          ariaLabel: null,
          role: null,
          href: null,
          selector: "section.hero",
          nearestHeading: null,
          sourcePath: "components/hero.tsx",
          sourceLine: 1,
        },
      },
      {
        demoUrl: "https://preview.example/",
        xPercent: 10,
        yPercent: 5,
        viewportWidth: 1200,
        viewportHeight: 800,
        element: {
          tag: "a",
          id: null,
          className: null,
          text: "PORTFOLIO",
          ariaLabel: null,
          role: null,
          href: "#portfolio",
          selector: "header nav a",
          nearestHeading: null,
        },
      },
    ]);
    const pinned = extractFocusPinnedPathsFromMessage(`Edit both.\n\n${focus}`, [
      headerFile,
      heroFile,
      unrelated,
    ]);
    expect(pinned).toContain("components/hero.tsx");
    expect(pinned).toContain("components/header.tsx");
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

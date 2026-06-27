import { describe, expect, it } from "vitest";
import { buildCompleteProject } from "./project-scaffold";
import type { CodeFile } from "../parser";

/**
 * P0 regression guard: an LLM-emitted copy of a canonical shadcn component
 * (e.g. a self-importing `components/ui/carousel.tsx` → TS2440) must NOT win
 * over the host-provided canonical version during export/merge.
 */
describe("buildCompleteProject — canonical shadcn UI protection", () => {
  const BROKEN_CAROUSEL = [
    '"use client";',
    'import { Carousel } from "@/components/ui/carousel";',
    "export function Carousel() {",
    "  return null;",
    "}",
  ].join("\n");

  const CANONICAL_CAROUSEL = "export function Carousel(){return null}\nexport default Carousel;";

  it("drops a broken LLM-emitted canonical carousel and injects the canonical one", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/page.tsx",
        content:
          'import { Carousel } from "@/components/ui/carousel";\nexport default function Page() { return <Carousel />; }',
        language: "tsx",
      },
      { path: "components/ui/carousel.tsx", content: BROKEN_CAROUSEL, language: "tsx" },
    ];

    const files = buildCompleteProject(generated, [
      { filename: "carousel.tsx", content: CANONICAL_CAROUSEL },
    ]);

    const carousel = files.filter((f) => f.path === "components/ui/carousel.tsx");
    expect(carousel).toHaveLength(1);
    // Canonical content wins; the broken self-import must be gone.
    expect(carousel[0]!.content).toBe(CANONICAL_CAROUSEL);
    expect(carousel[0]!.content).not.toContain(
      'import { Carousel } from "@/components/ui/carousel"',
    );

    // The normal page file is untouched.
    const page = files.find((f) => f.path === "app/page.tsx");
    expect(page).toBeDefined();
    expect(page!.content).toContain("export default function Page()");
  });

  it("also protects the src/-prefixed variant and matches case-insensitively", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "src/components/ui/Carousel.tsx", content: BROKEN_CAROUSEL, language: "tsx" },
    ];

    const files = buildCompleteProject(generated, [
      { filename: "carousel.tsx", content: CANONICAL_CAROUSEL },
    ]);

    // The broken src/-prefixed file is dropped; canonical injected at root.
    expect(files.some((f) => f.path === "src/components/ui/Carousel.tsx")).toBe(false);
    const carousel = files.filter((f) => f.path === "components/ui/carousel.tsx");
    expect(carousel).toHaveLength(1);
    expect(carousel[0]!.content).toBe(CANONICAL_CAROUSEL);
  });

  it("preserves a custom (non-registry) components/ui file as-is", () => {
    const custom = 'export function SheepWidget() { return <div>baa</div>; }';
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "components/ui/sheep-widget.tsx", content: custom, language: "tsx" },
    ];

    const files = buildCompleteProject(generated, [
      { filename: "carousel.tsx", content: CANONICAL_CAROUSEL },
    ]);

    const widget = files.filter((f) => f.path === "components/ui/sheep-widget.tsx");
    expect(widget).toHaveLength(1);
    expect(widget[0]!.content).toBe(custom);
  });

  it("keeps the generated canonical file when no replacement is available (never delete without inject)", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "components/ui/carousel.tsx", content: BROKEN_CAROUSEL, language: "tsx" },
    ];

    // No uiComponents → nothing to inject, so the generated file must survive
    // to avoid breaking `@/components/ui/carousel` imports.
    const files = buildCompleteProject(generated);

    const carousel = files.filter((f) => f.path === "components/ui/carousel.tsx");
    expect(carousel).toHaveLength(1);
    expect(carousel[0]!.content).toBe(BROKEN_CAROUSEL);
  });
});

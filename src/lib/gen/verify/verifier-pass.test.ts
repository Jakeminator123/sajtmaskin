import { describe, expect, it } from "vitest";
import {
  checkMotionReduceTrap,
  checkUndefinedJsxSymbols,
  extractFilePathsFromVerifierFindings,
  formatVerifierFindingsAsFixerErrors,
  suppressValidInPageAnchorNavigationFindings,
} from "./verifier-pass";

const TRAP_CLASS = `motion-reduce` + `:hidden`;

describe("checkMotionReduceTrap", () => {
  it("verifier flags motion-reduce:hidden on Canvas", () => {
    const findings = checkMotionReduceTrap([
      {
        path: "components/Scene.tsx",
        content: [
          'import { Canvas } from "@react-three/fiber";',
          "export function Scene() {",
          `  return <Canvas className="${TRAP_CLASS} h-screen w-full"><mesh /></Canvas>;`,
          "}",
        ].join("\n"),
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe("motion-reduce-canvas-trap");
    expect(findings[0]?.detail).toContain("motion-reduce trap");
    expect(findings[0]?.detail).toContain("components/Scene.tsx");
  });

  it("accepts Canvas when a motion-safe: counterpart class is present", () => {
    const findings = checkMotionReduceTrap([
      {
        path: "components/Scene.tsx",
        content:
          `<Canvas className="${TRAP_CLASS} motion-safe:block h-screen"><mesh /></Canvas>`,
      },
    ]);
    expect(findings).toEqual([]);
  });

  it("flags fixed full-screen overlays that hide under reduced motion", () => {
    const findings = checkMotionReduceTrap([
      {
        path: "components/Background.tsx",
        content:
          `<div className="fixed inset-0 pointer-events-none ${TRAP_CLASS}">` +
          `<Canvas /></div>`,
      },
    ]);
    expect(findings.some((f) => f.id === "motion-reduce-overlay-trap")).toBe(true);
  });

  it("ignores files without the trap class", () => {
    const findings = checkMotionReduceTrap([
      { path: "components/Hero.tsx", content: '<Canvas className="h-screen" />' },
      { path: "lib/util.ts", content: "export const x = 1;" },
    ]);
    expect(findings).toEqual([]);
  });

  it("ignores non-tsx/jsx files even when the literal substring appears", () => {
    const findings = checkMotionReduceTrap([
      { path: "app/globals.css", content: `.bad { /* ${TRAP_CLASS} */ }` },
    ]);
    expect(findings).toEqual([]);
  });
});

describe("checkUndefinedJsxSymbols", () => {
  it("flags a capitalised JSX tag that is neither imported nor declared (Cuboid regression)", () => {
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          'import { Canvas } from "@react-three/fiber";',
          "export default function Page() {",
          "  return (",
          "    <Canvas>",
          "      <Cuboid args={[1, 1, 1]} />",
          "    </Canvas>",
          "  );",
          "}",
        ].join("\n"),
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe("undefined-jsx-symbol");
    expect(findings[0]?.detail).toContain("app/page.tsx");
    expect(findings[0]?.detail).toContain("<Cuboid");
  });

  it("accepts components that are imported via named / default / namespace imports", () => {
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          'import React from "react";',
          'import Hero from "@/components/hero";',
          'import { Canvas } from "@react-three/fiber";',
          'import { Box as DreiBox } from "@react-three/drei";',
          'import * as Icons from "lucide-react";',
          "export default function Page() {",
          "  return (",
          "    <>",
          "      <Hero />",
          "      <Canvas>",
          "        <DreiBox />",
          "      </Canvas>",
          "      <Icons.Rocket />",
          "    </>",
          "  );",
          "}",
        ].join("\n"),
      },
    ]);

    expect(findings).toEqual([]);
  });

  it("accepts components declared inside the file (function, const, class)", () => {
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          "function LocalHero() { return <h1>hi</h1>; }",
          "const LocalBadge = () => <span>new</span>;",
          "class LocalCard extends React.Component { render() { return <div />; } }",
          "export default function Page() {",
          "  return (",
          "    <main>",
          "      <LocalHero />",
          "      <LocalBadge />",
          "      <LocalCard />",
          "    </main>",
          "  );",
          "}",
        ].join("\n"),
      },
    ]);

    expect(findings).toEqual([]);
  });

  it("accepts components introduced via array destructuring (useState / tuple returns)", () => {
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          'import { useState } from "react";',
          'import InitialCard from "@/components/initial-card";',
          "export default function Page() {",
          "  const [Card, setCard] = useState(InitialCard);",
          "  return <Card />;",
          "}",
        ].join("\n"),
      },
    ]);

    expect(findings).toEqual([]);
  });

  it("handles array destructuring with holes, defaults, and rest elements", () => {
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          'import DefaultCard from "@/components/default-card";',
          "export default function Page() {",
          "  const [, Second = DefaultCard, ...Rest] = [null, DefaultCard];",
          "  return (",
          "    <>",
          "      <Second />",
          "      <Rest />",
          "    </>",
          "  );",
          "}",
        ].join("\n"),
      },
    ]);

    expect(findings).toEqual([]);
  });

  it("ignores undefined-looking symbols that only appear inside comments or strings", () => {
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          "// Usage example: <NotImported />",
          "/* Another example: <AlsoNotImported /> */",
          'const hint = "Avoid <MissingSymbol />";',
          "export default function Page() { return <div>ok</div>; }",
        ].join("\n"),
      },
    ]);

    expect(findings).toEqual([]);
  });

  it("skips non-JSX files entirely", () => {
    const findings = checkUndefinedJsxSymbols([
      { path: "src/lib/util.ts", content: "export const x = 1; // <Cuboid />" },
      { path: "app/globals.css", content: "body { color: red; }" },
    ]);

    expect(findings).toEqual([]);
  });

  it("bails safely when the file uses React.lazy / createElement (dynamic components)", () => {
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          'import React from "react";',
          'const DynamicThing = React.lazy(() => import("./thing"));',
          "export default function Page() { return <DynamicThing /> }",
        ].join("\n"),
      },
    ]);

    expect(findings).toEqual([]);
  });

  it("handles namespaced JSX (Foo.Bar) by checking only the root symbol", () => {
    const missing = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          "export default function Page() {",
          "  return <Menu.Item />;",
          "}",
        ].join("\n"),
      },
    ]);

    expect(missing).toHaveLength(1);
    expect(missing[0]?.detail).toContain("<Menu");

    const present = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          'import { Menu } from "@headlessui/react";',
          "export default function Page() {",
          "  return <Menu.Item />;",
          "}",
        ].join("\n"),
      },
    ]);

    expect(present).toEqual([]);
  });

  // SAJ-33 regressionsskydd (2026-04-22 audit) ──────────────────────────

  it("does NOT flag TS generic type params in .tsx (`function f<T>()`)", () => {
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/hooks.tsx",
        content: [
          "export function useBox<T>(value: T): T { return value; }",
          "export function useRecord<K extends string, V>(k: K, v: V) {",
          "  return { [k]: v };",
          "}",
          "export class Store<TData> { read(): TData { return null as TData; } }",
          "export interface Bag<T, U = string> { value: T; label: U }",
          "export type Pair<A, B> = { a: A; b: B };",
          "export const useArrow = <TItem,>(item: TItem) => item;",
          "export default function Page() { return <div>ok</div>; }",
        ].join("\n"),
      },
    ]);
    expect(findings).toEqual([]);
  });

  it("no longer bails on the whole file for a custom `lazy(` that is not React.lazy", () => {
    // Utan fixen: hela filen skippades så `<Missing />` missades. Nu ska den
    // flaggas eftersom `lazy(` här kommer från ett eget util-bibliotek.
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          'import { lazy as lazyRetry } from "@/lib/my-utils";',
          "const noop = lazyRetry(() => null);",
          "export default function Page() { return <Missing />; }",
        ].join("\n"),
      },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain("<Missing");
  });

  it("still bails safely when `lazy` is imported from react (React.lazy-equivalent)", () => {
    const findings = checkUndefinedJsxSymbols([
      {
        path: "app/page.tsx",
        content: [
          'import { lazy } from "react";',
          'const Dyn = lazy(() => import("./dyn"));',
          "export default function Page() { return <Dyn /> }",
        ].join("\n"),
      },
    ]);
    expect(findings).toEqual([]);
  });

  it("caps total findings so a badly-formed file cannot flood the repair prompt", () => {
    const content = [
      "export default function Page() {",
      "  return (",
      "    <>",
      ...Array.from({ length: 30 }, (_, i) => `      <Bogus${i} />`),
      "    </>",
      "  );",
      "}",
    ].join("\n");
    const findings = checkUndefinedJsxSymbols([{ path: "app/page.tsx", content }], {
      maxFindings: 5,
    });
    expect(findings).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SAJ-61 P0/c5: structured fixer errors + file-path extraction
// ─────────────────────────────────────────────────────────────────────────

describe("formatVerifierFindingsAsFixerErrors", () => {
  it("splits build-breaking-missing-imports bullets into one fixer line per file", () => {
    const detail = [
      "Multiple files use symbols that are not imported, causing TypeScript/build failures:",
      "- components/site-header.tsx: uses `useReducedMotion()` but does not import it from `@/hooks/use-reduced-motion`.",
      "- components/floating-cta.tsx: uses `motion.aside` but does not import `motion` from `framer-motion`.",
      "- app/spel/page.tsx: type `Benefit` references `LucideIcon` but `LucideIcon` is not imported from `lucide-react`.",
    ].join("\n");

    const lines = formatVerifierFindingsAsFixerErrors({
      blocking: [{ id: "build-breaking-missing-imports", detail }],
    });

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/components\/site-header\.tsx:1:1 \[verifier:build-breaking-missing-imports\]/);
    expect(lines[0]).toContain("useReducedMotion");
    expect(lines[1]).toMatch(/components\/floating-cta\.tsx:1:1 \[verifier:build-breaking-missing-imports\]/);
    expect(lines[2]).toMatch(/app\/spel\/page\.tsx:1:1 \[verifier:build-breaking-missing-imports\]/);
  });

  it("falls back to the legacy single-line format when there are no bullets", () => {
    const lines = formatVerifierFindingsAsFixerErrors({
      blocking: [
        { id: "missing-required-files", detail: "Generated project lacks app/page.tsx" },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[verifier:missing-required-files]");
    expect(lines[0]).toContain("Generated project lacks app/page.tsx");
  });

  it("preserves the inline-path detection used today (no synthesized prefix)", () => {
    const lines = formatVerifierFindingsAsFixerErrors({
      blocking: [
        {
          id: "navigation-placeholder-actions",
          detail: "components/site-header.tsx: CTA `<Button />` lacks an href",
        },
      ],
    });
    expect(lines).toHaveLength(1);
    // The detail already starts with a path:line-shape, so the formatter
    // must not synthesize an extra `verifier:1:1 ` prefix in front of it.
    expect(lines[0]).not.toMatch(/^verifier:1:1/);
    expect(lines[0]).toContain("[verifier:navigation-placeholder-actions]");
    expect(lines[0]).toContain("components/site-header.tsx:");
  });
});

describe("suppressValidInPageAnchorNavigationFindings", () => {
  it("does not block game controls that point to an existing in-page area", () => {
    const findings = suppressValidInPageAnchorNavigationFindings(
      {
        blocking: [
          {
            id: "navigation-placeholder-actions",
            detail:
              'app/spel/page.tsx: "Starta spelet" and "Omstarta spelet" use href="#spelomrade".',
          },
        ],
        quality: [],
      },
      [
        {
          path: "app/spel/page.tsx",
          content: [
            "export default function SpelPage() {",
            '  return <section id="spelomrade">spel</section>;',
            "}",
          ].join("\n"),
        },
      ],
    );

    expect(findings.blocking).toEqual([]);
    expect(findings.quality).toEqual([]);
  });

  it("accepts prose verifier details that describe href without an equals sign", () => {
    const findings = suppressValidInPageAnchorNavigationFindings(
      {
        blocking: [
          {
            id: "navigation-placeholder-actions",
            detail:
              'app/spel/page.tsx: "Starta spelet" points to href "#spelomrade" in the game area.',
          },
        ],
        quality: [],
      },
      [
        {
          path: "app/spel/page.tsx",
          content: [
            "export default function SpelPage() {",
            '  return <section id="spelomrade">spel</section>;',
            "}",
          ].join("\n"),
        },
      ],
    );

    expect(findings.blocking).toEqual([]);
  });

  it("accepts scoped package-style paths when validating in-page hash navigation", () => {
    const findings = suppressValidInPageAnchorNavigationFindings(
      {
        blocking: [
          {
            id: "navigation-placeholder-actions",
            detail:
              '@myorg/components/Hero.tsx: "Start" uses href="#hero-start".',
          },
        ],
        quality: [],
      },
      [
        {
          path: "@myorg/components/Hero.tsx",
          content: [
            "export function Hero() {",
            '  return <section id="hero-start">start</section>;',
            "}",
          ].join("\n"),
        },
      ],
    );

    expect(findings.blocking).toEqual([]);
  });

  it("keeps hash navigation findings when the target id is missing", () => {
    const findings = suppressValidInPageAnchorNavigationFindings(
      {
        blocking: [
          {
            id: "navigation-placeholder-actions",
            detail: 'app/spel/page.tsx: "Starta spelet" uses href="#spelomrade".',
          },
        ],
        quality: [],
      },
      [
        {
          path: "app/spel/page.tsx",
          content: "export default function SpelPage() { return <main />; }",
        },
      ],
    );

    expect(findings.blocking).toHaveLength(1);
  });
});

describe("extractFilePathsFromVerifierFindings", () => {
  it("extracts unique file paths referenced inside blocking findings", () => {
    const detail = [
      "- components/site-header.tsx: uses `useReducedMotion()` but does not import it from `@/hooks/use-reduced-motion`.",
      "- components/floating-cta.tsx: uses `motion.aside` but does not import `motion` from `framer-motion`.",
      "- components/floating-cta.tsx: also uses `useReducedMotion()` without import.",
    ].join("\n");

    const files = extractFilePathsFromVerifierFindings({
      blocking: [{ id: "build-breaking-missing-imports", detail }],
    });

    expect(files.sort()).toEqual([
      "components/floating-cta.tsx",
      "components/site-header.tsx",
    ]);
  });

  it("extracts scoped package-style paths referenced inside blocking findings", () => {
    const files = extractFilePathsFromVerifierFindings({
      blocking: [
        {
          id: "build-error",
          detail:
            "@myorg/components/Hero.tsx: missing export used by app/page.tsx",
        },
      ],
    });

    expect(files.sort()).toEqual([
      "@myorg/components/Hero.tsx",
      "app/page.tsx",
    ]);
  });

  it("ignores version-like and dotfile tokens", () => {
    const detail = [
      "Build failed at 1.2.3 caused by app/page.tsx",
      "(see .env.local for misconfigured variables)",
    ].join(" ");

    const files = extractFilePathsFromVerifierFindings({
      blocking: [{ id: "build-error", detail }],
    });

    expect(files).toEqual(["app/page.tsx"]);
  });

  it("returns an empty list when no file paths are referenced", () => {
    const files = extractFilePathsFromVerifierFindings({
      blocking: [{ id: "design-quality", detail: "Hero section is empty" }],
    });
    expect(files).toEqual([]);
  });

  it("regression: extracts paths from EVERY blocking entry, not only the first (no /g lastIndex leak)", () => {
    // The shared `/g` regex previously kept its `lastIndex` between
    // findings, so paths near the start of the second `detail` could
    // be silently skipped. Two findings here, with the second one's
    // first path appearing well before the offset where iteration on
    // the first detail stopped — both must show up in the result.
    const firstDetail = [
      "Multiple files use symbols that are not imported, causing TypeScript/build failures:",
      "- components/site-header.tsx: uses `useReducedMotion()` but does not import it.",
      "- components/floating-cta.tsx: uses `motion.aside` but does not import `motion` from `framer-motion`.",
      "- components/home-hero.tsx: uses `useReducedMotion()` and multiple `motion.*` elements without imports.",
      "- components/turtle-game.tsx: uses `useReducedMotion()` and multiple `motion.div` elements.",
    ].join("\n");
    const secondDetail = [
      "app/spel/page.tsx: type `Benefit` references `LucideIcon` but it is not imported from `lucide-react`.",
    ].join("\n");

    const files = extractFilePathsFromVerifierFindings({
      blocking: [
        { id: "build-breaking-missing-imports", detail: firstDetail },
        { id: "build-breaking-missing-imports", detail: secondDetail },
      ],
    });

    expect(files.sort()).toEqual([
      "app/spel/page.tsx",
      "components/floating-cta.tsx",
      "components/home-hero.tsx",
      "components/site-header.tsx",
      "components/turtle-game.tsx",
    ]);
  });

  it("is idempotent across repeated invocations (no shared state leak)", () => {
    const findings = {
      blocking: [
        { id: "build-error", detail: "components/foo.tsx: missing import" },
      ],
    };
    const a = extractFilePathsFromVerifierFindings(findings);
    const b = extractFilePathsFromVerifierFindings(findings);
    expect(a).toEqual(b);
    expect(a).toEqual(["components/foo.tsx"]);
  });
});

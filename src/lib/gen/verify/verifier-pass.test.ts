import { describe, expect, it } from "vitest";
import { checkMotionReduceTrap, checkUndefinedJsxSymbols } from "./verifier-pass";

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

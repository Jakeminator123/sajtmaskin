import { describe, expect, it } from "vitest";
import { checkCrossFileImports } from "./cross-file-import-checker";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import type { CodeFile } from "@/lib/gen/parser";

describe("checkCrossFileImports", () => {
  it("does not create a stub when a missing local import duplicates a package binding (rapier case)", () => {
    const floating: CodeFile = {
      path: "components/floating-bike-scene.tsx",
      language: "tsx",
      content: [
        '"use client";',
        "",
        "import {",
        "  CuboidCollider,",
        "  Physics,",
        "  RigidBody,",
        "  type RapierRigidBody,",
        '} from "@react-three/rapier";',
        'import RapierRigidBody from "@/components/rapier-rigid-body";',
        "",
        "export function FloatingBikeScene() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([floating]);

    expect(result.fixes.some((f) => f.stubFile.includes("rapier-rigid-body"))).toBe(false);
    expect(result.files.some((f) => f.path === "components/rapier-rigid-body.tsx")).toBe(false);
    const updated = result.files.find((f) => f.path === "components/floating-bike-scene.tsx");
    expect(updated?.content).toBeDefined();
    expect(updated!.content).not.toContain("@/components/rapier-rigid-body");
    expect(updated!.content).toContain("@react-three/rapier");
  });

  it("still creates a stub for a genuine missing local component with a unique name", () => {
    const page: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: [
        'import { UniqueMissingWidget } from "@/components/unique-missing-widget";',
        "export default function Page() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    expect(result.fixes.length).toBeGreaterThan(0);
    const stub = result.files.find((f) => f.path === "components/unique-missing-widget.tsx");
    expect(stub?.content).toContain("UniqueMissingWidget");
  });

  it("materializes a real icon helper for hallucinated @/components/icon imports", () => {
    const statsCard: CodeFile = {
      path: "components/stats-card.tsx",
      language: "tsx",
      content: [
        'import { Icon } from "@/components/icon";',
        "",
        "export function StatsCard() {",
        '  return <div><Icon name="calendar" className="size-4" /> Bookings</div>;',
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([statsCard]);
    const helper = result.files.find((f) => f.path === "components/icon.tsx");

    expect(helper).toBeDefined();
    expect(helper?.content).toContain("export function Icon");
    expect(helper?.content).toContain("lucide-react");
    expect(helper?.content).not.toContain("autofix-stub");
    expect(helper?.content).not.toContain("return null");
    const sanity = runProjectSanityChecks(result.files, {
      scaffoldBaselineCoversPackageJson: true,
    });
    expect(
      sanity.issues.filter((issue) => issue.message.includes("@/components/icon")),
    ).toEqual([]);
  });

  it("materializes a real date helper for hallucinated @/components/date imports", () => {
    const bookingFlow: CodeFile = {
      path: "components/booking-flow.tsx",
      language: "tsx",
      content: [
        'import { DatePicker } from "@/components/date";',
        "",
        "export function BookingFlow() {",
        '  return <DatePicker value="2026-04-27" className="text-sm" />;',
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([bookingFlow]);
    const helper = result.files.find((f) => f.path === "components/date.tsx");

    expect(helper).toBeDefined();
    expect(helper?.content).toContain("export function DateDisplay");
    expect(helper?.content).toContain("export function DatePicker");
    expect(helper?.content).not.toContain("autofix-stub");
    expect(helper?.content).not.toContain("return null");
    const sanity = runProjectSanityChecks(result.files, {
      scaffoldBaselineCoversPackageJson: true,
    });
    expect(
      sanity.issues.filter((issue) => issue.message.includes("@/components/date")),
    ).toEqual([]);
  });

  it("does not stub @/hooks/use-reduced-motion (baseline-provided)", () => {
    // Repro: scaffold ships `hooks/use-reduced-motion.ts` (matchMedia hook
    // returning a boolean). Earlier autofix runs created
    // `hooks/use-reduced-motion.tsx` whose body was `return {}` — truthy in
    // JS, so every motion component silently froze. Lock the baseline path
    // so the checker never re-introduces the competing `.tsx` stub.
    const page: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: [
        '"use client";',
        'import { useReducedMotion } from "@/hooks/use-reduced-motion";',
        "export default function Page() {",
        "  const reduceMotion = useReducedMotion();",
        "  return <div data-reduce={String(reduceMotion)} />;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    expect(result.files.some((f) => f.path === "hooks/use-reduced-motion.tsx")).toBe(false);
    expect(result.files.some((f) => f.path === "hooks/use-reduced-motion.ts")).toBe(false);
    expect(result.fixes.some((f) => f.missingImport === "@/hooks/use-reduced-motion")).toBe(false);
    const sanity = runProjectSanityChecks(result.files, {
      scaffoldBaselineCoversPackageJson: true,
    });
    expect(
      sanity.issues.filter((issue) => issue.message.includes("@/hooks/use-reduced-motion")),
    ).toEqual([]);
  });

  it("does not stub runtime-provided hooks like @/lib/hooks/use-mobile", () => {
    const sidebar: CodeFile = {
      path: "components/ui/sidebar.tsx",
      language: "tsx",
      content: [
        '"use client";',
        'import { useIsMobile } from "@/lib/hooks/use-mobile";',
        "",
        "export function Sidebar() {",
        "  const mobile = useIsMobile();",
        "  return <aside data-mobile={mobile} />;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([sidebar]);

    expect(result.files.some((f) => f.path === "lib/hooks/use-mobile.tsx")).toBe(false);
    expect(result.fixes.some((f) => f.missingImport === "@/lib/hooks/use-mobile")).toBe(false);
    const sanity = runProjectSanityChecks(result.files, {
      scaffoldBaselineCoversPackageJson: true,
    });
    expect(
      sanity.issues.filter((issue) => issue.message.includes("@/lib/hooks/use-mobile")),
    ).toEqual([]);
  });

  it("rewires @/components/three-canvas to @/components/three-canvas-shell when the shell file exists", () => {
    const overlay: CodeFile = {
      path: "components/flying-drum-overlay.tsx",
      language: "tsx",
      content: [
        '"use client";',
        'import { ThreeCanvasShell } from "@/components/three-canvas";',
        "",
        "export function FlyingDrumOverlay() {",
        "  return <ThreeCanvasShell decorative className=\"size-full\" />;",
        "}",
      ].join("\n"),
    };
    const shell: CodeFile = {
      path: "components/three-canvas-shell.tsx",
      language: "tsx",
      content: [
        '"use client";',
        "export function ThreeCanvasShell(props: { children?: unknown }) {",
        "  return null;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([overlay, shell]);

    const updatedOverlay = result.files.find(
      (f) => f.path === "components/flying-drum-overlay.tsx",
    );
    expect(updatedOverlay?.content).toContain('"@/components/three-canvas-shell"');
    expect(updatedOverlay?.content).not.toContain('"@/components/three-canvas"');
    expect(result.files.some((f) => f.path === "components/three-canvas.tsx")).toBe(false);
    const rewireFix = result.fixes.find(
      (f) => f.missingImport === "@/components/three-canvas",
    );
    expect(rewireFix).toBeDefined();
    expect(rewireFix?.rewireTarget).toBe("components/three-canvas-shell");
    expect(rewireFix?.rewireImportSpec).toBe("@/components/three-canvas-shell");
    expect(rewireFix?.stubFile).toBe("components/three-canvas-shell");
  });

  it("rewires relative sibling imports before falling back to stubs", () => {
    const overlay: CodeFile = {
      path: "components/flying-drum-overlay.tsx",
      language: "tsx",
      content: [
        '"use client";',
        'import { ThreeCanvasShell } from "./three-canvas";',
        "",
        "export function FlyingDrumOverlay() {",
        "  return <ThreeCanvasShell decorative className=\"size-full\" />;",
        "}",
      ].join("\n"),
    };
    const shell: CodeFile = {
      path: "components/three-canvas-shell.tsx",
      language: "tsx",
      content: [
        '"use client";',
        "export function ThreeCanvasShell(props: { children?: unknown }) {",
        "  return null;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([overlay, shell]);

    const updatedOverlay = result.files.find(
      (f) => f.path === "components/flying-drum-overlay.tsx",
    );
    expect(updatedOverlay?.content).toContain('"./three-canvas-shell"');
    expect(result.files.some((f) => f.path === "components/three-canvas.tsx")).toBe(false);
    const rewireFix = result.fixes.find((f) => f.missingImport === "./three-canvas");
    expect(rewireFix?.rewireTarget).toBe("components/three-canvas-shell");
    expect(rewireFix?.rewireImportSpec).toBe("./three-canvas-shell");
    expect(rewireFix?.stubFile).toBe("components/three-canvas-shell");
  });

  it("keeps deterministic suffix order when multiple siblings exist", () => {
    // Review-fynd: REWIRE_SUFFIX_VARIANTS-ordningen styr vilken sibling som
    // vinner när flera matchar. Lås beteendet i test så framtida reordering
    // inte ändrar produktionsval i tysthet.
    const overlay: CodeFile = {
      path: "components/foo-overlay.tsx",
      language: "tsx",
      content: [
        '"use client";',
        'import { Foo } from "@/components/foo";',
        "export function FooOverlay() { return <Foo />; }",
      ].join("\n"),
    };
    const fooShell: CodeFile = {
      path: "components/foo-shell.tsx",
      language: "tsx",
      content: ["export function Foo() { return null; }"].join("\n"),
    };
    const fooContext: CodeFile = {
      path: "components/foo-context.tsx",
      language: "tsx",
      content: ["export function Foo() { return null; }"].join("\n"),
    };

    const result = checkCrossFileImports([overlay, fooShell, fooContext]);

    const updatedOverlay = result.files.find(
      (f) => f.path === "components/foo-overlay.tsx",
    );
    // `-shell` ranks higher than `-context` in REWIRE_SUFFIX_VARIANTS, so
    // the rewire must always pick `-shell` deterministically.
    expect(updatedOverlay?.content).toContain('"@/components/foo-shell"');
    expect(updatedOverlay?.content).not.toContain('"@/components/foo-context"');
  });

  it("does not rewire to a suffix-sibling that lacks the imported binding", () => {
    // P7 (fix/autofix-fidelity-guards): rewiring `@/components/pricing-table`
    // to a `-shell` sibling that does NOT export `PricingTable` would silently
    // mount the wrong component. The export-surface guard must reject it and
    // fall back to a (now visible) stub instead.
    const section: CodeFile = {
      path: "components/pricing-section.tsx",
      language: "tsx",
      content: [
        'import { PricingTable } from "@/components/pricing-table";',
        "export function PricingSection() { return <PricingTable />; }",
      ].join("\n"),
    };
    const wrongSibling: CodeFile = {
      path: "components/pricing-table-shell.tsx",
      language: "tsx",
      content: ["export function PricingShellWrapper() { return null; }"].join("\n"),
    };

    const result = checkCrossFileImports([section, wrongSibling]);

    const updated = result.files.find((f) => f.path === "components/pricing-section.tsx");
    expect(updated?.content).toContain('"@/components/pricing-table"');
    expect(updated?.content).not.toContain("pricing-table-shell");
    const stub = result.files.find((f) => f.path === "components/pricing-table.tsx");
    expect(stub).toBeDefined();
    const fix = result.fixes.find((f) => f.missingImport === "@/components/pricing-table");
    expect(fix?.rewireTarget).toBeUndefined();
    expect(fix?.stubFile).toBe("components/pricing-table.tsx");
  });

  it("still rewires to a suffix-sibling that DOES export the imported binding", () => {
    // Guard must not over-block: when the sibling provides the binding, the
    // rewire still fires (no regression to the valid sibling-rewire path).
    const section: CodeFile = {
      path: "components/pricing-section.tsx",
      language: "tsx",
      content: [
        'import { PricingTable } from "@/components/pricing-table";',
        "export function PricingSection() { return <PricingTable />; }",
      ].join("\n"),
    };
    const realSibling: CodeFile = {
      path: "components/pricing-table-shell.tsx",
      language: "tsx",
      content: ["export function PricingTable() { return null; }"].join("\n"),
    };

    const result = checkCrossFileImports([section, realSibling]);

    const updated = result.files.find((f) => f.path === "components/pricing-section.tsx");
    expect(updated?.content).toContain('"@/components/pricing-table-shell"');
    expect(result.files.some((f) => f.path === "components/pricing-table.tsx")).toBe(false);
    const fix = result.fixes.find((f) => f.missingImport === "@/components/pricing-table");
    expect(fix?.rewireTarget).toBe("components/pricing-table-shell");
  });

  it("falls back to stub when no fuzzy sibling exists", () => {
    const page: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: [
        'import { TotallyMadeUpThing } from "@/components/totally-made-up-thing";',
        "export default function Page() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    const stub = result.files.find(
      (f) => f.path === "components/totally-made-up-thing.tsx",
    );
    expect(stub).toBeDefined();
    expect(stub?.content).toContain("autofix-stub");
    const fix = result.fixes.find(
      (f) => f.missingImport === "@/components/totally-made-up-thing",
    );
    expect(fix?.rewireTarget).toBeUndefined();
  });

  it("renders a VISIBLE degraded placeholder (not a silent return null) for stubbed components", () => {
    // P7 (fix/autofix-fidelity-guards): a missing PascalCase component must
    // render a clearly-labeled placeholder so the degradation is visible in
    // the preview, instead of a silent `return null` that looks like a
    // finished, intentionally-empty design.
    const page: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: [
        'import { MissingHeroBlock } from "@/components/missing-hero-block";',
        "export default function Page() { return <MissingHeroBlock />; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);
    const stub = result.files.find(
      (f) => f.path === "components/missing-hero-block.tsx",
    );

    expect(stub).toBeDefined();
    // Keeps the grep marker but no longer renders nothing.
    expect(stub?.content).toContain("autofix-stub:MissingHeroBlock");
    expect(stub?.content).toContain('data-autofix-stub="MissingHeroBlock"');
    expect(stub?.content).toContain("Platshållare för MissingHeroBlock");
    expect(stub?.content).toMatch(/<span/);
    // The component body must not be a bare `return null;`.
    expect(stub?.content).not.toMatch(/\breturn null;/);
  });

  it("keeps an inert null-render stub when the target is a non-tsx (.ts) file", () => {
    // JSX is invalid in a `.ts` module, so the visible-placeholder body must
    // only be emitted for `.tsx` stub targets.
    const page: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: [
        'import { LegacyWidget } from "@/lib/legacy-widget.ts";',
        "export default function Page() { return <LegacyWidget />; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);
    const stub = result.files.find((f) => f.path === "lib/legacy-widget.ts");

    expect(stub).toBeDefined();
    expect(stub?.content).toContain("autofix-stub:LegacyWidget");
    expect(stub?.content).toContain("return null");
    expect(stub?.content).not.toContain("<span");
  });

  it("emits a non-JSX passthrough Provider stub for an explicit .ts import target", () => {
    // A `XxxProvider` stubbed into a `.ts` file must not emit JSX (`<>…</>`),
    // which is a syntax error in a non-tsx module → white screen on the
    // deterministic export/preview path. Use React.createElement instead.
    const page: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: [
        'import { ThemeProvider } from "@/lib/theme-provider.ts";',
        "export default function Layout({ children }: { children: React.ReactNode }) {",
        "  return <ThemeProvider>{children}</ThemeProvider>;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);
    const stub = result.files.find((f) => f.path === "lib/theme-provider.ts");

    expect(stub).toBeDefined();
    expect(stub?.content).toContain("export function ThemeProvider");
    // No JSX in a `.ts` module.
    expect(stub?.content).not.toContain("<>");
    expect(stub?.content).toContain("React.createElement(React.Fragment, null, children)");
  });

  it("does not create null-render stubs for missing 3D scene parts", () => {
    const scene: CodeFile = {
      path: "components/flying-duck-3d.tsx",
      language: "tsx",
      content: [
        '"use client";',
        'import DuckMesh from "@/components/duck-mesh";',
        'import DuckScene from "@/components/duck-scene";',
        'import { Canvas } from "@react-three/fiber";',
        "export function FlyingDuck3d() {",
        "  return <Canvas><DuckScene><DuckMesh /></DuckScene></Canvas>;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([scene]);

    expect(result.files.some((f) => f.path === "components/duck-mesh.tsx")).toBe(false);
    expect(result.files.some((f) => f.path === "components/duck-scene.tsx")).toBe(false);
    expect(result.fixes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceFile: "components/flying-duck-3d.tsx",
          missingImport: "@/components/duck-mesh",
          capability: "visual-3d",
        }),
        expect.objectContaining({
          sourceFile: "components/flying-duck-3d.tsx",
          missingImport: "@/components/duck-scene",
          capability: "visual-3d",
        }),
      ]),
    );
  });

  it("strips denylisted default imports like HTMLFormElement without stubbing", () => {
    const page: CodeFile = {
      path: "app/form.tsx",
      language: "tsx",
      content: [
        'import HTMLFormElement from "@/components/html-form-element";',
        "export default function Form() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    expect(result.files.some((f) => f.path === "components/html-form-element.tsx")).toBe(false);
    const updated = result.files.find((f) => f.path === "app/form.tsx");
    expect(updated?.content ?? "").not.toContain("html-form-element");
  });

  it("strips denylisted runtime-class imports without stubbing", () => {
    const page: CodeFile = {
      path: "components/three-canvas-shell.tsx",
      language: "tsx",
      content: [
        'import WebGLRenderer from "@/components/web-gl-renderer";',
        'import CanvasErrorBoundary from "@/components/canvas-error-boundary";',
        "export default function Shell() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    expect(result.files.some((f) => f.path === "components/web-gl-renderer.tsx")).toBe(false);
    expect(result.files.some((f) => f.path === "components/canvas-error-boundary.tsx")).toBe(false);
    const updated = result.files.find((f) => f.path === "components/three-canvas-shell.tsx");
    expect(updated?.content ?? "").not.toContain("web-gl-renderer");
    expect(updated?.content ?? "").not.toContain("canvas-error-boundary");
  });

  // Prod incident 2026-07-09: a stub `import Uint8Array from
  // "@/components/uint8-array"` collided with `new ReadableStream<Uint8Array>`
  // in an API route. JS/Web globals must never be stubbed.
  it("strips denylisted JS-global default imports (Uint8Array) without stubbing", () => {
    const route: CodeFile = {
      path: "app/api/assistant/route.ts",
      language: "tsx",
      content: [
        'import Uint8Array from "@/components/uint8-array";',
        "export async function POST() {",
        "  return new Response(new ReadableStream<Uint8Array>());",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([route]);

    expect(result.files.some((f) => f.path === "components/uint8-array.tsx")).toBe(false);
    const updated = result.files.find((f) => f.path === "app/api/assistant/route.ts");
    expect(updated?.content ?? "").not.toContain("@/components/uint8-array");
  });

  it("strips a denylisted JS-global import even when the LLM co-emitted the target file", () => {
    // Review-swarm gap: when the LLM emits BOTH components/uint8-array.tsx AND
    // the import, the import resolves and previously survived Normalize — the
    // F2 gate then blocks the version with no mechanical repair path. The
    // denylist strip must apply regardless of resolved status; the co-emitted
    // file may remain as a harmless orphan.
    const stub: CodeFile = {
      path: "components/uint8-array.tsx",
      language: "tsx",
      content: [
        "export default function Uint8Array() {",
        "  return null;",
        "}",
      ].join("\n"),
    };
    const route: CodeFile = {
      path: "app/api/assistant/route.ts",
      language: "tsx",
      content: [
        'import Uint8Array from "@/components/uint8-array";',
        "export async function POST() {",
        "  return new Response(new ReadableStream<Uint8Array>());",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([stub, route]);

    const updated = result.files.find((f) => f.path === "app/api/assistant/route.ts");
    expect(updated?.content ?? "").not.toContain("@/components/uint8-array");
    // The global usage survives untouched.
    expect(updated?.content ?? "").toContain("ReadableStream<Uint8Array>");
  });

  it("keeps a RESOLVED global-named import when the component is actually rendered as JSX", () => {
    // Bugbot on #481: a real custom <Error /> boundary at @/components/error
    // must keep its import — stripping it would leave the JSX referencing the
    // JS global Error. The strip only applies when the name is never used as
    // JSX in the importing file (the Uint8Array incident class).
    const errorComponent: CodeFile = {
      path: "components/error.tsx",
      language: "tsx",
      content: [
        "export default function Error({ message }: { message?: string }) {",
        '  return <div role="alert">{message ?? "Något gick fel"}</div>;',
        "}",
      ].join("\n"),
    };
    const page: CodeFile = {
      path: "app/checkout/page.tsx",
      language: "tsx",
      content: [
        'import Error from "@/components/error";',
        "export default function CheckoutPage() {",
        "  return <Error message=\"Betalningen misslyckades\" />;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([errorComponent, page]);

    const updated = result.files.find((f) => f.path === "app/checkout/page.tsx");
    expect(updated?.content ?? "").toContain('import Error from "@/components/error"');
    expect(updated?.content ?? "").toContain("<Error ");
  });

  it("does NOT strip a package import that reuses a global name (next/error)", () => {
    const page: CodeFile = {
      path: "app/error-page.tsx",
      language: "tsx",
      content: [
        'import Error from "next/error";',
        "export default function Page() {",
        "  return <Error statusCode={404} />;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    const updated = result.files.find((f) => f.path === "app/error-page.tsx");
    expect(updated?.content ?? "").toContain('from "next/error"');
  });

  it("strips a single-uppercase-letter (TS generic) default import without stubbing", () => {
    const page: CodeFile = {
      path: "app/reports/page.tsx",
      language: "tsx",
      content: [
        'import T from "@/components/t";',
        "export default function Page() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    expect(result.files.some((f) => f.path === "components/t.tsx")).toBe(false);
    const updated = result.files.find((f) => f.path === "app/reports/page.tsx");
    expect(updated?.content ?? "").not.toContain("@/components/t");
  });
});

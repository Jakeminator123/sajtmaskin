import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import {
  buildProjectExportIndex,
  buildProjectModuleExportIndex,
  fixImportedDeclarationConflicts,
  fixLocalDefaultImportMismatches,
  fixLocalNamedImportDefaultMismatches,
  fixMissingLocalSymbolImports,
  fixMissingReactTypeImports,
  fixNextImageImport,
  fixNextOgImageResponseImport,
} from "./common-import-fixer";

describe("common-import-fixer", () => {
  it("adds missing local shared symbol import when uniquely exported", () => {
    const files: CodeFile[] = [
      {
        path: "lib/store-data.tsx",
        content: "export const siteConfig = { shortName: 'Nordrost' };",
        language: "tsx",
      },
      {
        path: "components/site-header.tsx",
        content: `export default function SiteHeader() { return <div>{siteConfig.shortName}</div>; }`,
        language: "tsx",
      },
    ];

    const exportIndex = buildProjectExportIndex(files);
    const result = fixMissingLocalSymbolImports(files[1]!.content, files[1]!.path, exportIndex);

    expect(result.fixed).toBe(true);
    expect(result.addedSymbols).toEqual(["siteConfig"]);
    expect(result.code).toContain('import { siteConfig } from "@/lib/store-data";');
  });

  it("adds missing navigation import from a shared lib file", () => {
    const files: CodeFile[] = [
      {
        path: "lib/site-data.ts",
        content: "export const navigation = [{ href: '/', label: 'Hem' }];",
        language: "ts",
      },
      {
        path: "components/site-footer.tsx",
        content: `export default function SiteFooter() { return <footer>{navigation.map((item) => item.label)}</footer>; }`,
        language: "tsx",
      },
    ];

    const exportIndex = buildProjectExportIndex(files);
    const result = fixMissingLocalSymbolImports(files[1]!.content, files[1]!.path, exportIndex);

    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { navigation } from "@/lib/site-data";');
  });

  it("adds missing ReactNode type import", () => {
    const code = `export default function CartProvider({ children }: { children: ReactNode }) {\n  return <>{children}</>;\n}`;
    const result = fixMissingReactTypeImports(code);

    expect(result.fixed).toBe(true);
    expect(result.addedTypes).toEqual(["ReactNode"]);
    expect(result.code).toContain('import type { ReactNode } from "react";');
  });

  it("adds next/image import when Image JSX is used without import", () => {
    const code = `export default function Page() {\n  return <Image src=\"/x.png\" alt=\"x\" width={100} height={100} />;\n}`;
    const result = fixNextImageImport(code);

    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import Image from "next/image";');
  });

  it("does not add next/image when Image already comes from lucide-react", () => {
    const code = `import { Image } from "lucide-react";\nexport default function Page() {\n  return <Image src=\"/x.png\" alt=\"x\" />;\n}`;
    const result = fixNextImageImport(code);

    expect(result.fixed).toBe(false);
  });

  it("adds next/og ImageResponse import when opengraph files use ImageResponse without import", () => {
    const code = `export default function OpenGraphImage() {\n  return new ImageResponse(<div>Hej</div>, { width: 1200, height: 630 });\n}`;
    const result = fixNextOgImageResponseImport(code);

    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { ImageResponse } from "next/og";');
  });

  it("merges ImageResponse into an existing next/og import", () => {
    const code = `import { ImageData } from "next/og";\nexport default function OpenGraphImage() {\n  return new ImageResponse(<div>Hej</div>, { width: 1200, height: 630 });\n}`;
    const result = fixNextOgImageResponseImport(code);

    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { ImageData, ImageResponse } from "next/og";');
  });

  it("rewires local default imports to named imports when the target has no default export", () => {
    const files: CodeFile[] = [
      {
        path: "components/site-footer.tsx",
        content: `export function SiteFooter() { return <footer />; }`,
        language: "tsx",
      },
      {
        path: "app/layout.tsx",
        content:
          `import SiteFooter from "@/components/site-footer";\n\nexport default function Layout({ children }: { children: React.ReactNode }) {\n  return <SiteFooter />;\n}`,
        language: "tsx",
      },
    ];

    const moduleExportIndex = buildProjectModuleExportIndex(files);
    const result = fixLocalDefaultImportMismatches(
      files[1]!.content,
      files[1]!.path,
      files,
      moduleExportIndex,
    );

    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { SiteFooter } from "@/components/site-footer";');
  });

  it("rewires local named imports to default imports when the target has only default export", () => {
    const files: CodeFile[] = [
      {
        path: "components/header-truck-3d.tsx",
        content: `export default function HeaderTruck3D() { return <div />; }`,
        language: "tsx",
      },
      {
        path: "components/site-header.tsx",
        content:
          `import { HeaderTruck3D } from "@/components/header-truck-3d";\n\nexport default function SiteHeader() {\n  return <HeaderTruck3D />;\n}`,
        language: "tsx",
      },
    ];

    const moduleExportIndex = buildProjectModuleExportIndex(files);
    const result = fixLocalNamedImportDefaultMismatches(
      files[1]!.content,
      files[1]!.path,
      files,
      moduleExportIndex,
    );

    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import HeaderTruck3D from "@/components/header-truck-3d";');
  });

  it("rewires local named import to default even when local alias differs", () => {
    const files: CodeFile[] = [
      {
        path: "components/fancy-header.tsx",
        content: `export default function FancyHeader() { return <header />; }`,
        language: "tsx",
      },
      {
        path: "components/site-header.tsx",
        content:
          `import { Header } from "@/components/fancy-header";\n\nexport default function SiteHeader() {\n  return <Header />;\n}`,
        language: "tsx",
      },
    ];

    const moduleExportIndex = buildProjectModuleExportIndex(files);
    const result = fixLocalNamedImportDefaultMismatches(
      files[1]!.content,
      files[1]!.path,
      files,
      moduleExportIndex,
    );

    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import Header from "@/components/fancy-header";');
  });

  it("removes import bindings that conflict with local declarations", () => {
    const code = `import { Group, Mesh } from "three";\n\nfunction Group() { return null; }\n\nexport default function Scene() {\n  return <Mesh />;\n}`;
    const result = fixImportedDeclarationConflicts(code);

    expect(result.fixed).toBe(true);
    expect(result.removedBindings).toEqual(["Group"]);
    expect(result.code).toContain('import { Mesh } from "three";');
  });

  it("does not remove an import binding that is used before a later shadowing declaration", () => {
    const code = `import { Group, Mesh } from "three";\n\nexport default function Scene() {\n  return <Group />;\n}\n\nfunction Group() { return null; }\n`;
    const result = fixImportedDeclarationConflicts(code);

    expect(result.fixed).toBe(false);
    expect(result.removedBindings).toEqual([]);
    expect(result.code).toContain("Group");
    expect(result.code).toContain("Mesh");
  });

  it("treats destructuring aliases as local declarations when removing import conflicts", () => {
    const code = `import { bar, baz } from "./lib";\n\nfunction Component({ foo: bar }: { foo: string }) {\n  return <div>{bar}</div>;\n}\n`;
    const result = fixImportedDeclarationConflicts(code);

    expect(result.fixed).toBe(true);
    expect(result.removedBindings).toEqual(["bar"]);
    expect(result.code).toContain('import { baz } from "./lib";');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SAJ-61 P0/c1: bredda export-indexet
  // ─────────────────────────────────────────────────────────────────────────

  describe("buildProjectExportIndex (SAJ-61: hooks/components/utils)", () => {
    it("indexes named exports from hooks/* so useReducedMotion auto-imports", () => {
      const files: CodeFile[] = [
        {
          path: "hooks/use-reduced-motion.ts",
          content:
            "export const QUERY = '(prefers-reduced-motion: reduce)';\n" +
            "export function useReducedMotion() { return false; }\n",
          language: "ts",
        },
        {
          path: "components/site-header.tsx",
          content:
            'export default function SiteHeader() {\n' +
            "  const reducedMotion = useReducedMotion();\n" +
            "  return <header data-reduced={reducedMotion} />;\n" +
            "}",
          language: "tsx",
        },
      ];

      const exportIndex = buildProjectExportIndex(files);
      expect(exportIndex.get("useReducedMotion")).toEqual([
        "@/hooks/use-reduced-motion",
      ]);

      const result = fixMissingLocalSymbolImports(
        files[1]!.content,
        files[1]!.path,
        exportIndex,
      );
      expect(result.fixed).toBe(true);
      expect(result.addedSymbols).toEqual(["useReducedMotion"]);
      expect(result.code).toContain(
        'import { useReducedMotion } from "@/hooks/use-reduced-motion";',
      );
    });

    it("indexes named exports from components/* (excluding components/ui/)", () => {
      const files: CodeFile[] = [
        {
          path: "components/floating-cta.tsx",
          content:
            "export function FloatingCta() { return <aside />; }\n",
          language: "tsx",
        },
        {
          path: "components/ui/button.tsx",
          content:
            "export function Button() { return <button />; }\n" +
            "export const buttonVariants = () => '';\n",
          language: "tsx",
        },
      ];

      const exportIndex = buildProjectExportIndex(files);
      expect(exportIndex.has("FloatingCta")).toBe(true);
      expect(exportIndex.get("FloatingCta")).toEqual([
        "@/components/floating-cta",
      ]);
      // shadcn lane vinner: components/ui/* indexeras inte
      expect(exportIndex.has("Button")).toBe(false);
      expect(exportIndex.has("buttonVariants")).toBe(false);
    });

    it("does not index exports from app/* (pages exportera metadata + default page)", () => {
      const files: CodeFile[] = [
        {
          path: "app/page.tsx",
          content:
            'export const metadata = { title: "Hem" };\n' +
            "export default function HomePage() { return <main />; }\n",
          language: "tsx",
        },
        {
          path: "app/spel/page.tsx",
          content:
            'export const metadata = { title: "Spel" };\n' +
            "export default function SpelPage() { return <main />; }\n",
          language: "tsx",
        },
      ];

      const exportIndex = buildProjectExportIndex(files);
      // `metadata` skulle vara katastrofalt att importera till andra page-filer
      expect(exportIndex.has("metadata")).toBe(false);
      expect(exportIndex.has("HomePage")).toBe(false);
      expect(exportIndex.has("SpelPage")).toBe(false);
    });

    it("does not auto-import when multiple kandidater exists", () => {
      const files: CodeFile[] = [
        {
          path: "components/foo.tsx",
          content: "export const helper = () => 1;\n",
          language: "tsx",
        },
        {
          path: "lib/bar.ts",
          content: "export const helper = () => 2;\n",
          language: "ts",
        },
        {
          path: "components/use-helper.tsx",
          content:
            "export default function UseHelper() {\n" +
            "  return <div>{helper()}</div>;\n" +
            "}",
          language: "tsx",
        },
      ];

      const exportIndex = buildProjectExportIndex(files);
      expect(exportIndex.get("helper")?.sort()).toEqual([
        "@/components/foo",
        "@/lib/bar",
      ]);

      const result = fixMissingLocalSymbolImports(
        files[2]!.content,
        files[2]!.path,
        exportIndex,
      );
      // Ingen gissning: ambivalenta symboler lämnas till repair-loopen.
      expect(result.fixed).toBe(false);
      expect(result.addedSymbols).toEqual([]);
    });

    it("skips dossier/cross-file autofix stubs", () => {
      const files: CodeFile[] = [
        {
          path: "components/animate-presence.tsx",
          content:
            "export function AnimatePresence(_props: Record<string, unknown>) {\n" +
            "  // autofix-stub:AnimatePresence — model did not emit a real implementation\n" +
            "  return null;\n" +
            "}\n",
          language: "tsx",
        },
        {
          path: "components/floating-cta.tsx",
          content:
            "export default function FloatingCta() {\n" +
            "  return <AnimatePresence />;\n" +
            "}",
          language: "tsx",
        },
      ];

      const exportIndex = buildProjectExportIndex(files);
      // Stub-filer är inte canonical importmål; framer-motion-vägen ska vinna.
      expect(exportIndex.has("AnimatePresence")).toBe(false);
    });

    it("indexes utils/* and data/* siblings", () => {
      const files: CodeFile[] = [
        {
          path: "utils/format.ts",
          content: "export function formatPrice(n: number) { return n.toFixed(2); }\n",
          language: "ts",
        },
        {
          path: "data/products.ts",
          content: "export const products = [{ id: 1 }];\n",
          language: "ts",
        },
      ];
      const exportIndex = buildProjectExportIndex(files);
      expect(exportIndex.get("formatPrice")).toEqual(["@/utils/format"]);
      expect(exportIndex.get("products")).toEqual(["@/data/products"]);
    });

    it("indexes acronym-PascalCase, ALL_CAPS, and single-letter exports (SAJ-61 review)", () => {
      const files: CodeFile[] = [
        {
          path: "components/api-banner.tsx",
          content:
            "export function APIBanner() { return <aside />; }\n" +
            "export const HTTPStatusCard = () => null;\n",
          language: "tsx",
        },
        {
          path: "lib/constants.ts",
          content:
            "export const API = '/api';\n" +
            "export const UI = 'shadcn';\n" +
            "export const HTTP = 'https';\n",
          language: "ts",
        },
        {
          path: "components/three-axis.tsx",
          content: "export const X = 1;\nexport const Y = 2;\n",
          language: "tsx",
        },
      ];

      const exportIndex = buildProjectExportIndex(files);
      expect(exportIndex.get("APIBanner")).toEqual(["@/components/api-banner"]);
      expect(exportIndex.get("HTTPStatusCard")).toEqual(["@/components/api-banner"]);
      expect(exportIndex.get("API")).toEqual(["@/lib/constants"]);
      expect(exportIndex.get("UI")).toEqual(["@/lib/constants"]);
      expect(exportIndex.get("HTTP")).toEqual(["@/lib/constants"]);
      expect(exportIndex.get("X")).toEqual(["@/components/three-axis"]);
      expect(exportIndex.get("Y")).toEqual(["@/components/three-axis"]);
    });

    it("does not index node_modules paths if any sneak in", () => {
      const files: CodeFile[] = [
        {
          path: "node_modules/some-pkg/dist/index.ts",
          content: "export const wat = 1;\n",
          language: "ts",
        },
      ];
      const exportIndex = buildProjectExportIndex(files);
      expect(exportIndex.has("wat")).toBe(false);
    });
  });
});

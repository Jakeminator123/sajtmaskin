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

  it("treats destructuring aliases as local declarations when removing import conflicts", () => {
    const code = `import { bar, baz } from "./lib";\n\nfunction Component({ foo: bar }: { foo: string }) {\n  return <div>{bar}</div>;\n}\n`;
    const result = fixImportedDeclarationConflicts(code);

    expect(result.fixed).toBe(true);
    expect(result.removedBindings).toEqual(["bar"]);
    expect(result.code).toContain('import { baz } from "./lib";');
  });
});

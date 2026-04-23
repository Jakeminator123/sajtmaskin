import { describe, expect, it } from "vitest";
import { fixTypeOnlyModuleDefaultImports } from "./type-only-module-default-import-fixer";
import type { CodeFile } from "@/lib/gen/parser";

function tsxFile(path: string, content: string): CodeFile {
  return { path, content, language: path.endsWith(".tsx") ? "tsx" : "ts" };
}

describe("fixTypeOnlyModuleDefaultImports", () => {
  it("drops default import of a type-only module when the binding is unused as a value", () => {
    const files = [
      tsxFile(
        "components/showcase-vehicle.tsx",
        `export type ShowcaseVehicleCard = { make: string; model: string };\n`,
      ),
      tsxFile(
        "components/showcase-gallery.tsx",
        `import ShowcaseVehicleCard from "@/components/showcase-vehicle";

export function ShowcaseGallery() {
  return <div>gallery</div>;
}
`,
      ),
    ];

    const { files: next, fixes } = fixTypeOnlyModuleDefaultImports(files);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixer).toBe("type-only-module-default-import-fixer");
    const updated = next.find((f) => f.path === "components/showcase-gallery.tsx")!;
    expect(updated.content).not.toContain("import ShowcaseVehicleCard");
    // Untouched target file
    const target = next.find((f) => f.path === "components/showcase-vehicle.tsx")!;
    expect(target.content).toContain("export type ShowcaseVehicleCard");
  });

  it("leaves the import alone when the default binding is used as a value (JSX)", () => {
    const files = [
      tsxFile(
        "components/card.tsx",
        `export type Card = { id: string };\nexport default function Card() { return null; }\n`,
      ),
      tsxFile(
        "app/page.tsx",
        `import Card from "@/components/card";\nexport default function P() { return <Card />; }\n`,
      ),
    ];
    const { fixes } = fixTypeOnlyModuleDefaultImports(files);
    // Target file has a runtime default export — not type-only — so: no-op.
    expect(fixes).toHaveLength(0);
  });

  it("is a no-op when the target file is missing (leaves that case to cross-file stub generator)", () => {
    const files = [
      tsxFile(
        "app/page.tsx",
        `import Missing from "@/components/missing";\nexport default function P() { return <div>x</div>; }\n`,
      ),
    ];
    const { files: next, fixes } = fixTypeOnlyModuleDefaultImports(files);
    expect(fixes).toHaveLength(0);
    expect(next).toBe(files);
  });

  it("keeps named imports intact while dropping the type-only default", () => {
    const files = [
      tsxFile(
        "components/lib.tsx",
        `export type LibConfig = { debug: boolean };\nexport function libHelper() { return 1; }\n`,
      ),
      tsxFile(
        "app/page.tsx",
        `import LibConfig, { libHelper } from "@/components/lib";
const x = libHelper();
`,
      ),
    ];
    const { files: next, fixes } = fixTypeOnlyModuleDefaultImports(files);
    // The target has a runtime export (libHelper), so isModuleTypeOnlyExportOnly
    // returns false and we bail. Test verifies we don't over-apply.
    expect(fixes).toHaveLength(0);
    const updated = next.find((f) => f.path === "app/page.tsx")!;
    expect(updated.content).toContain("libHelper");
  });
});

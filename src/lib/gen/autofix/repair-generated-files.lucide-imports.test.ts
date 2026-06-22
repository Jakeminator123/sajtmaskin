import { describe, expect, it } from "vitest";
import { repairGeneratedFiles } from "./repair-generated-files";
import type { CodeFile } from "../parser";

/**
 * Regression for the "white screen" incident: a generated `app/page.tsx`
 * rendered `<Clapperboard />` without `import { Clapperboard } from "lucide-react"`.
 *
 * Such code is **esbuild-green but tsc-red** — esbuild happily transforms a
 * reference to an undeclared identifier, so the post-merge esbuild gate stays
 * green and the full `runAutoFix` escalation (which DOES add missing lucide
 * imports) never fires. The fix wires `runImportValidator` into the post-merge
 * `repairGeneratedFiles` path so the missing icon import is added regardless.
 *
 * `Clapperboard` is a real entry in `LUCIDE_ICONS` (src/lib/gen/data/lucide-icons.ts),
 * so the import fixer can resolve it.
 */
describe("repairGeneratedFiles — missing lucide imports (white-screen fix)", () => {
  it("adds a fresh lucide-react import when <Clapperboard /> is used without an import", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        language: "tsx",
        content: `export default function Page() {
  return (
    <main>
      <Clapperboard className="h-6 w-6" />
    </main>
  );
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const page = repaired.files.find((f) => f.path === "app/page.tsx");

    expect(page?.content).toContain('import { Clapperboard } from "lucide-react"');
    expect(
      repaired.fixes.some(
        (fix) => fix.fixer === "import-validator" && /Clapperboard/.test(fix.description),
      ),
    ).toBe(true);
  });

  it("adds the import when the icon is also referenced as a non-JSX value", () => {
    // The import is driven by the JSX `<Clapperboard />` usage; once added it
    // also satisfies the bare value reference (`const icon = Clapperboard;`).
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        language: "tsx",
        content: `const icon = Clapperboard;

export default function Page() {
  return (
    <main>
      <Clapperboard className="h-6 w-6" />
      <span>{icon ? "ready" : "idle"}</span>
    </main>
  );
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const page = repaired.files.find((f) => f.path === "app/page.tsx");

    expect(page?.content).toContain('import { Clapperboard } from "lucide-react"');
  });

  it("merges the missing icon into an existing lucide-react import (no duplicate line)", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        language: "tsx",
        content: `import { Menu } from "lucide-react";

export default function Page() {
  return (
    <header>
      <Menu className="h-5 w-5" />
      <Clapperboard className="h-5 w-5" />
    </header>
  );
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const page = repaired.files.find((f) => f.path === "app/page.tsx");

    expect(page?.content).toContain('import { Menu, Clapperboard } from "lucide-react"');
    const lucideImportLines = (page?.content.match(/from "lucide-react"/g) ?? []).length;
    expect(lucideImportLines).toBe(1);
  });

  it("is idempotent: a second repair pass adds nothing and reports no fixes", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        language: "tsx",
        content: `export default function Page() {
  return <Clapperboard className="h-6 w-6" />;
}
`,
      },
    ];

    const once = repairGeneratedFiles(files);
    const twice = repairGeneratedFiles(once.files);

    const onceContent = once.files.find((f) => f.path === "app/page.tsx")?.content;
    const twiceContent = twice.files.find((f) => f.path === "app/page.tsx")?.content;

    expect(onceContent).toContain('import { Clapperboard } from "lucide-react"');
    expect(twiceContent).toBe(onceContent);
    expect(twice.fixes.length).toBe(0);
  });
});

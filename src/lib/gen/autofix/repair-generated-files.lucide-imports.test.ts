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

/**
 * Regression for the recurring `PawPrint is not defined` white-screen incident:
 * a lucide icon used ONLY as a bare value in an `icon:` property of a data array
 * (no JSX `<PawPrint/>` usage). The JSX-only scan in `detectMissingImports`
 * misses it, so on the deterministic export/download path (no tsc to drive
 * `ts2304-known-import-fixer`) the missing import shipped to runtime. The narrow
 * `icon:`-property fixer adds the value import deterministically — without
 * false-positives on locally-declared symbols, strings, or common-word names.
 */
describe("repairGeneratedFiles — non-JSX lucide icon value imports (icon: idiom)", () => {
  it("adds a lucide import for an icon used only as an `icon:` property value", () => {
    const files: CodeFile[] = [
      {
        path: "components/motif-selector.tsx",
        language: "tsx",
        content: `const MOTIFS = [
  { label: "Trail", icon: PawPrint },
];

export default function MotifSelector() {
  return <div>{MOTIFS.length}</div>;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/motif-selector.tsx");

    expect(file?.content).toContain('import { PawPrint } from "lucide-react"');
    expect(
      repaired.fixes.some(
        (fix) => fix.fixer === "import-validator" && /PawPrint/.test(fix.description),
      ),
    ).toBe(true);
  });

  it("merges the icon value into an existing lucide import (single line, no duplicate)", () => {
    const files: CodeFile[] = [
      {
        path: "components/motifs.tsx",
        language: "tsx",
        content: `import { Leaf } from "lucide-react";

const MOTIFS = [
  { label: "Forest", icon: Leaf },
  { label: "Trail", icon: PawPrint },
];

export default function Motifs() {
  return <div>{MOTIFS.length}</div>;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/motifs.tsx");

    expect(file?.content).toContain('import { Leaf, PawPrint } from "lucide-react"');
    const lucideImportLines = (file?.content.match(/from "lucide-react"/g) ?? []).length;
    expect(lucideImportLines).toBe(1);
  });

  it("does NOT import a locally-declared symbol that happens to match an icon name", () => {
    const files: CodeFile[] = [
      {
        path: "components/box-registry.tsx",
        language: "tsx",
        content: `function Box() {
  return <div>local box</div>;
}

const ITEMS = [{ label: "Local", icon: Box }];

export default function BoxRegistry() {
  return <div>{ITEMS.length}</div>;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/box-registry.tsx");

    expect(file?.content).not.toContain('from "lucide-react"');
  });

  it("does NOT add an import when the icon value is a string literal", () => {
    const files: CodeFile[] = [
      {
        path: "components/string-icon.tsx",
        language: "tsx",
        content: `const ITEMS = [{ label: "Star", icon: "PawPrint" }];

export default function StringIcon() {
  return <div>{ITEMS.length}</div>;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/string-icon.tsx");

    expect(file?.content).not.toContain('from "lucide-react"');
  });

  it("does NOT duplicate when the icon is already imported", () => {
    const files: CodeFile[] = [
      {
        path: "components/already.tsx",
        language: "tsx",
        content: `import { PawPrint } from "lucide-react";

const ITEMS = [{ label: "Trail", icon: PawPrint }];

export default function Already() {
  return <div>{ITEMS.length}</div>;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/already.tsx");

    const lucideImportLines = (file?.content.match(/from "lucide-react"/g) ?? []).length;
    expect(lucideImportLines).toBe(1);
  });

  it("is idempotent for the icon-value path (second pass is a no-op)", () => {
    const files: CodeFile[] = [
      {
        path: "components/motif-selector.tsx",
        language: "tsx",
        content: `const MOTIFS = [{ icon: PawPrint }];

export default function MotifSelector() {
  return <div>{MOTIFS.length}</div>;
}
`,
      },
    ];

    const once = repairGeneratedFiles(files);
    const twice = repairGeneratedFiles(once.files);

    const onceContent = once.files.find((f) => f.path === "components/motif-selector.tsx")?.content;
    const twiceContent = twice.files.find((f) => f.path === "components/motif-selector.tsx")?.content;

    expect(onceContent).toContain('import { PawPrint } from "lucide-react"');
    expect(twiceContent).toBe(onceContent);
    expect(twice.fixes.length).toBe(0);
  });
});

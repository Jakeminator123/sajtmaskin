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

  // Regression for the #290 follow-up: when the existing lucide import is a
  // MULTI-LINE block, there is no single-line value import for the merge to
  // find, and the old fresh-insert spliced the new import line between the
  // `import {` opener and its `} from "lucide-react"` closer — corrupting the
  // file. The guarded validator then reverted, silently dropping the icon
  // import and re-shipping the `PawPrint is not defined` white screen.
  it("adds the icon value beside a MULTI-LINE lucide import without corrupting the block", () => {
    const files: CodeFile[] = [
      {
        path: "components/motifs.tsx",
        language: "tsx",
        content: `import {
  Menu,
  Search,
} from "lucide-react";

const MOTIFS = [{ label: "Pets", icon: PawPrint }];

export default function Motifs() {
  return (
    <nav>
      <Menu />
      <Search />
      {MOTIFS.length}
    </nav>
  );
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/motifs.tsx");

    // PawPrint is now actually imported (the white screen is fixed)…
    expect(file?.content).toMatch(
      /import\s*\{[^}]*\bPawPrint\b[^}]*\}\s*from\s*["']lucide-react["']/,
    );
    // …the original multi-line block's closer survives intact…
    expect(file?.content).toContain('} from "lucide-react";');
    // …and the opener was never spliced into (the corruption signature).
    expect(file?.content).not.toMatch(/import\s*\{\s*\nimport\s/);
  });

  it("merges into a single-line lucide import that has a trailing comma (no `,,`)", () => {
    const files: CodeFile[] = [
      {
        path: "components/trailing.tsx",
        language: "tsx",
        content: `import { Menu, } from "lucide-react";

const MOTIFS = [{ icon: PawPrint }];

export default function Trailing() {
  return <div>{MOTIFS.length}</div>;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/trailing.tsx");

    expect(file?.content).toContain('import { Menu, PawPrint } from "lucide-react"');
    expect(file?.content).not.toContain(",,");
  });

  it("does NOT import an icon whose name collides with a local `enum` (runtime value)", () => {
    // An `enum` (unlike `type`/`interface`) creates a runtime value binding, so
    // adding `import { Menu }` beside `enum Menu` is a duplicate identifier
    // (TS2440 / esbuild "already declared"). `countParseErrors` does not see
    // this semantic clash, so the guarded wrapper would NOT revert it — the
    // local-declaration guard must catch the enum up front.
    const files: CodeFile[] = [
      {
        path: "components/enum-collision.tsx",
        language: "tsx",
        content: `enum Menu { Open, Closed }

const ITEMS = [{ label: "Local", icon: Menu }];

export default function EnumCollision() {
  return <div>{ITEMS.length}{Menu.Open}</div>;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/enum-collision.tsx");

    expect(file?.content).not.toContain('from "lucide-react"');
  });

  // Regression for the #292 follow-up review: the fresh-import insert must land
  // AFTER the leading `"use client"` directive even when a comment precedes it.
  // The directive only works as the first *statement*; hoisting an import above
  // it demotes the file to a Server Component (a parse-clean change the guarded
  // wrapper cannot catch), re-introducing the white screen for an interactive
  // file.
  it('keeps "use client" first when it is preceded by a leading comment', () => {
    const files: CodeFile[] = [
      {
        path: "components/commented-directive.tsx",
        language: "tsx",
        content: `// Interactive nav island — keep this client-side.
"use client";

const NAV = [{ label: "Pets", icon: PawPrint }];

export default function Nav() {
  return <div>{NAV.length}</div>;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/commented-directive.tsx");
    const content = file?.content ?? "";

    const useClientIdx = content.indexOf('"use client"');
    const importIdx = content.indexOf('from "lucide-react"');
    // PawPrint is imported…
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(content).toMatch(
      /import\s*\{[^}]*\bPawPrint\b[^}]*\}\s*from\s*["']lucide-react["']/,
    );
    // …the directive survives and the import sits BELOW it…
    expect(useClientIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBeGreaterThan(useClientIdx);
    // …and no import was hoisted above the directive (the regression signature).
    expect(content.slice(0, useClientIdx)).not.toMatch(/^\s*import\s/m);
  });

  it('keeps "use client" first when the directive carries a trailing comment', () => {
    const files: CodeFile[] = [
      {
        path: "components/trailing-comment-directive.tsx",
        language: "tsx",
        content: `"use client"; // interactive island

const ITEMS = [{ icon: PawPrint }];

export default function Page() {
  return <div>{ITEMS.length}</div>;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find(
      (f) => f.path === "components/trailing-comment-directive.tsx",
    );
    const content = file?.content ?? "";

    const useClientIdx = content.indexOf('"use client"');
    const importIdx = content.indexOf('from "lucide-react"');
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(content).toMatch(
      /import\s*\{[^}]*\bPawPrint\b[^}]*\}\s*from\s*["']lucide-react["']/,
    );
    expect(useClientIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBeGreaterThan(useClientIdx);
    expect(content.slice(0, useClientIdx)).not.toMatch(/^\s*import\s/m);
  });
});

/**
 * Companion to the `icon:` idiom above: an icon component passed as a JSX prop
 * value (`<FeatureCard icon={PawPrint} />`). The JSX-tag scan in
 * `detectMissingImports` only sees `<FeatureCard>` / `<Icon>` tags, never the
 * `PawPrint` identifier inside the `icon={...}` braces, so on the deterministic
 * export/preview path (no tsc → no `ts2304-known-import-fixer`) the missing
 * import shipped a runtime `ReferenceError` / white screen. Mirrors the
 * `icon:`-property fixer, with the same local/string/shadcn guards.
 */
describe("repairGeneratedFiles — non-JSX lucide icon value imports (icon={X} JSX prop)", () => {
  it("adds a lucide import for an icon passed as a JSX prop value", () => {
    const files: CodeFile[] = [
      {
        path: "components/feature-card-list.tsx",
        language: "tsx",
        content: `export default function Features() {
  return <FeatureCard icon={PawPrint} />;
}

function FeatureCard({ icon: Icon }) {
  return <Icon className="h-5 w-5" />;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/feature-card-list.tsx");

    expect(file?.content).toMatch(
      /import\s*\{[^}]*\bPawPrint\b[^}]*\}\s*from\s*["']lucide-react["']/,
    );
    expect(
      repaired.fixes.some(
        (fix) => fix.fixer === "import-validator" && /PawPrint/.test(fix.description),
      ),
    ).toBe(true);
  });

  it("does NOT double-import for icon={<PawPrint />} (already covered by the JSX-tag scan)", () => {
    // `<PawPrint />` between the braces is a JSX element handled by the JSX-tag
    // scan; the `icon={...}` value rule must not also fire and add a second line.
    const files: CodeFile[] = [
      {
        path: "components/jsx-element-prop.tsx",
        language: "tsx",
        content: `export default function Page() {
  return <FeatureCard icon={<PawPrint />} />;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/jsx-element-prop.tsx");

    expect(file?.content).toMatch(
      /import\s*\{[^}]*\bPawPrint\b[^}]*\}\s*from\s*["']lucide-react["']/,
    );
    const lucideImportLines = (file?.content.match(/from "lucide-react"/g) ?? []).length;
    expect(lucideImportLines).toBe(1);
  });

  it("does NOT import a member-access icon prop (icon={Icons.PawPrint})", () => {
    const files: CodeFile[] = [
      {
        path: "components/member-prop.tsx",
        language: "tsx",
        content: `const Icons = { PawPrint: () => null };

export default function Page() {
  return <FeatureCard icon={Icons.PawPrint} />;
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const file = repaired.files.find((f) => f.path === "components/member-prop.tsx");

    expect(file?.content).not.toContain('from "lucide-react"');
  });
});

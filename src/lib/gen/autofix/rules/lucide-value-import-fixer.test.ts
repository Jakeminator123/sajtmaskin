import { describe, expect, it } from "vitest";
import { fixLucideValueImports } from "./lucide-value-import-fixer";

describe("fixLucideValueImports", () => {
  it("adds a value import for an icon used only as a data value (white-screen incident)", () => {
    const code = `const MOTIFS = [
  { id: "wild", icon: PawPrint },
];

export function MotifSelector() {
  const Icon = MOTIFS[0].icon;
  return <Icon className="h-5 w-5" />;
}
`;
    const result = fixLucideValueImports(code, "components/motif-selector.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { PawPrint } from "lucide-react"');
    expect(result.fixes[0]?.fixer).toBe("lucide-value-import-fixer");
  });

  it("merges multiple value-only icons into a single import", () => {
    const code = `const MOTIFS = [
  { icon: PawPrint },
  { icon: MoonStar },
  { icon: Sparkles },
  { icon: Leaf },
  { icon: Trees },
];
`;
    const result = fixLucideValueImports(code, "components/motif-selector.tsx");
    expect(result.fixed).toBe(true);
    const lucideLines = result.code.match(/from "lucide-react"/g) ?? [];
    expect(lucideLines).toHaveLength(1);
    for (const icon of ["PawPrint", "MoonStar", "Sparkles", "Leaf", "Trees"]) {
      expect(result.code).toContain(icon);
    }
  });

  it("merges into an existing value lucide-react import without a duplicate line", () => {
    const code = `import { Menu } from "lucide-react";

const MOTIFS = [{ icon: PawPrint }];
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { Menu, PawPrint } from "lucide-react"');
    expect((result.code.match(/from "lucide-react"/g) ?? [])).toHaveLength(1);
  });

  it("is idempotent: a second pass changes nothing", () => {
    const code = `const MOTIFS = [{ icon: PawPrint }];\n`;
    const once = fixLucideValueImports(code, "app/page.tsx");
    const twice = fixLucideValueImports(once.code, "app/page.tsx");
    expect(twice.fixed).toBe(false);
    expect(twice.code).toBe(once.code);
  });

  it("ignores string icon names (no spurious import)", () => {
    const code = `const MOTIFS = [{ icon: "PawPrint" }];\n`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).not.toContain("lucide-react");
  });

  it("does not import a name the file declares locally", () => {
    const code = `const Sparkles = () => null;

const MOTIFS = [{ icon: Sparkles }];
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
  });

  it("skips already-imported icons", () => {
    const code = `import { PawPrint } from "lucide-react";

const MOTIFS = [{ icon: PawPrint }];
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
  });

  it("leaves next/* ambiguous names (Image/Link) to the dedicated fixers", () => {
    const code = `const NAV = [{ icon: Image }, { icon: Link }];\n`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).not.toContain('from "lucide-react"');
  });

  it("does not add a type-only import (value usage must stay a value import)", () => {
    const code = `import type { LucideIcon } from "lucide-react";

const MOTIFS: { icon: LucideIcon }[] = [{ icon: PawPrint }];
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    // Must NOT merge PawPrint into the `import type { ... }` line.
    expect(result.code).toContain('import type { LucideIcon } from "lucide-react"');
    expect(result.code).toContain('import { PawPrint } from "lucide-react"');
  });
});

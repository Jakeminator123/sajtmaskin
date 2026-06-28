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

  it("supports the `const Icon = PawPrint` assignment form", () => {
    const code = `const Icon = PawPrint;

export function C() {
  return <Icon className="h-5 w-5" />;
}
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { PawPrint } from "lucide-react"');
  });

  it("merges into a single-line value lucide-react import without a duplicate line", () => {
    const code = `import { Menu } from "lucide-react";

const MOTIFS = [{ icon: PawPrint }];
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { Menu, PawPrint } from "lucide-react"');
    expect((result.code.match(/from "lucide-react"/g) ?? [])).toHaveLength(1);
  });

  // Bugbot #289 HIGH: multi-line imports must be parsed or the icon is treated
  // as missing and a SECOND `import { PawPrint }` is inserted → duplicate id.
  it("does not duplicate an icon already imported via a MULTI-LINE block", () => {
    const code = `import {
  Menu,
  PawPrint,
} from "lucide-react";

const MOTIFS = [{ icon: PawPrint }];
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect((result.code.match(/\bPawPrint\b/g) ?? []).length).toBe(2); // import + usage
  });

  it("merges a new icon into an existing MULTI-LINE lucide import (no second line)", () => {
    const code = `import {
  Menu,
  Home,
} from "lucide-react";

const MOTIFS = [{ icon: PawPrint }];
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect((result.code.match(/from "lucide-react"/g) ?? [])).toHaveLength(1);
    for (const icon of ["Menu", "Home", "PawPrint"]) {
      expect(result.code).toContain(icon);
    }
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

  it("does not import a name the file declares locally (const/component)", () => {
    const code = `const Sparkles = () => null;

const MOTIFS = [{ icon: Sparkles }];
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
  });

  // Bugbot #289 MEDIUM: type positions must NOT trigger a value import even when
  // the type name collides with a lucide icon (User/Home/Check are all icons).
  it("does not import for type annotations that share an icon name", () => {
    const code = `interface Props {
  user: User;
  home: Home;
}

function greet(u: User): User {
  const current: User = u;
  return current;
}
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).not.toContain('from "lucide-react"');
  });

  it("does not import a locally declared interface/type used as a value key type", () => {
    const code = `type User = { id: string };

const config = { icon: User };
`;
    // `User` is a locally declared type → must be skipped (not a lucide value).
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
  });

  it("does not treat member/call access as an icon value", () => {
    const code = `const date = Calendar.from(2026);\n`;
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

  it("does not merge a value icon into a type-only lucide import line", () => {
    const code = `import type { LucideIcon } from "lucide-react";

const MOTIFS: { icon: LucideIcon }[] = [{ icon: PawPrint }];
`;
    const result = fixLucideValueImports(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import type { LucideIcon } from "lucide-react"');
    expect(result.code).toContain('import { PawPrint } from "lucide-react"');
  });
});

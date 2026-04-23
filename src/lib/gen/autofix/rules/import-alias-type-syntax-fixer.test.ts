import { describe, expect, it } from "vitest";

import { fixImportAliasTypeHybrid } from "./import-alias-type-syntax-fixer";

describe("fixImportAliasTypeHybrid", () => {
  it("removes stray `type` keyword in single aliased specifier", () => {
    const input = `import { Type as type LucideIcon } from "lucide-react";`;
    const result = fixImportAliasTypeHybrid(input, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toBe(
      `import { Type as LucideIcon } from "lucide-react";`,
    );
    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0].fixer).toBe("import-alias-type-syntax-fixer");
  });

  it("handles multi-line imports with mixed valid/invalid specifiers", () => {
    const input = [
      `import {`,
      `  Trophy,`,
      `  Users,`,
      `  Zap,`,
      `  Type as type LucideIcon,`,
      `} from "lucide-react";`,
    ].join("\n");
    const result = fixImportAliasTypeHybrid(input, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain("Type as LucideIcon,");
    expect(result.code).not.toContain("as type");
    expect(result.code).toContain("Trophy,");
    expect(result.code).toContain("Users,");
    expect(result.code).toContain("Zap,");
  });

  it("handles multiple hybrid specifiers in the same import", () => {
    const input = [
      `import {`,
      `  Foo as type FooAlias,`,
      `  Bar,`,
      `  Baz as type BazAlias,`,
      `} from "some-module";`,
    ].join("\n");
    const result = fixImportAliasTypeHybrid(input, "lib/stuff.ts");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain("Foo as FooAlias,");
    expect(result.code).toContain("Baz as BazAlias,");
    expect(result.code).not.toContain("as type");
    expect(result.fixes[0].description).toContain("2 import aliases");
  });

  it("leaves valid type-only specifiers alone", () => {
    const input = `import { type LucideIcon, Button } from "ui-lib";`;
    const result = fixImportAliasTypeHybrid(input, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(input);
  });

  it("leaves valid `type X as Y` specifiers alone", () => {
    const input = `import { type Type as LucideIcon } from "lucide-react";`;
    const result = fixImportAliasTypeHybrid(input, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(input);
  });

  it("leaves simple aliased specifiers alone (`X as Y` without stray type)", () => {
    const input = `import { Type as LucideIcon } from "lucide-react";`;
    const result = fixImportAliasTypeHybrid(input, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(input);
  });

  it("no-op when code has no import statements", () => {
    const input = `const x = "Type as type LucideIcon";`;
    const result = fixImportAliasTypeHybrid(input, "lib/stuff.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(input);
  });

  it("fixes hybrid across multiple import statements", () => {
    const input = [
      `import { Type as type LucideIcon } from "lucide-react";`,
      `import { Foo, Bar as type BarType } from "other";`,
    ].join("\n");
    const result = fixImportAliasTypeHybrid(input, "app/layout.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(`Type as LucideIcon`);
    expect(result.code).toContain(`Bar as BarType`);
    expect(result.code).not.toContain("as type");
  });

  it("preserves `import type { ... }` statements untouched when clean", () => {
    const input = `import type { LucideIcon } from "lucide-react";`;
    const result = fixImportAliasTypeHybrid(input, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(input);
  });
});

import { describe, expect, it } from "vitest";
import { guardFixerSyntax } from "./pipeline";

type Validation = { valid: boolean; errors: Array<{ line: number; column: number; message: string }> };

// Deterministic, env-independent validator: a code string is "invalid" iff it
// is listed in `invalidSet`. (The real default validator uses esbuild, which
// does not load under vitest — DI keeps this test free of that dependency.)
const fakeValidator =
  (invalidSet: Set<string>) =>
  async (code: string): Promise<Validation> =>
    invalidSet.has(code)
      ? { valid: false, errors: [{ line: 24, column: 0, message: 'Unexpected ";"' }] }
      : { valid: true, errors: [] };

const BEFORE = `import { Button } from "@/components/ui/button";\nexport default function Page() {\n  return <Button>Hi</Button>;\n}\n`;
const AFTER_OK = BEFORE.replace("Hi", "Hello");
const AFTER_BROKEN = `import { Button } from "@/components/ui/button";\nArrowDown,\nZap,\n;\nfrom;\n"lucide-react";\n`;

describe("guardFixerSyntax (validity guard)", () => {
  it("returns `after` unchanged when the fixer was a no-op", async () => {
    const warnings: string[] = [];
    const res = await guardFixerSyntax(BEFORE, BEFORE, "app/page.tsx", "x", warnings, fakeValidator(new Set()));
    expect(res.reverted).toBe(false);
    expect(res.code).toBe(BEFORE);
    expect(warnings).toHaveLength(0);
  });

  it("reverts to `before` when a fixer makes parseable code unparseable", async () => {
    const warnings: string[] = [];
    const res = await guardFixerSyntax(
      BEFORE,
      AFTER_BROKEN,
      "app/page.tsx",
      "import-validator",
      warnings,
      fakeValidator(new Set([AFTER_BROKEN])),
    );
    expect(res.reverted).toBe(true);
    expect(res.code).toBe(BEFORE);
    expect(warnings.some((w) => w.includes("import-validator reverted"))).toBe(true);
  });

  it("keeps `after` (does not mask) when the input was already unparseable", async () => {
    const warnings: string[] = [];
    const res = await guardFixerSyntax(
      AFTER_BROKEN,
      AFTER_BROKEN + "// more\n",
      "app/page.tsx",
      "x",
      warnings,
      fakeValidator(new Set([AFTER_BROKEN, AFTER_BROKEN + "// more\n"])),
    );
    expect(res.reverted).toBe(false);
    expect(res.code).toBe(AFTER_BROKEN + "// more\n");
    expect(warnings).toHaveLength(0);
  });

  it("keeps `after` when both before and after are valid", async () => {
    const warnings: string[] = [];
    const res = await guardFixerSyntax(BEFORE, AFTER_OK, "app/page.tsx", "x", warnings, fakeValidator(new Set()));
    expect(res.reverted).toBe(false);
    expect(res.code).toBe(AFTER_OK);
  });

  it("does not run for files with no esbuild loader (e.g. .md) — even if marked invalid", async () => {
    const warnings: string[] = [];
    const res = await guardFixerSyntax("a {", "b {{", "notes.md", "x", warnings, fakeValidator(new Set(["b {{"])));
    expect(res.reverted).toBe(false);
    expect(res.code).toBe("b {{");
  });
});

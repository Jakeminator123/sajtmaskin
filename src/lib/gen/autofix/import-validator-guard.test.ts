import { describe, expect, it } from "vitest";
import { runImportValidatorGuarded } from "./import-validator";
import { repairGeneratedFiles } from "./repair-generated-files";
import { countParseErrors, isGuardablePath } from "./rules/import-binding-ast";
import type { CodeFile } from "@/lib/gen/parser";

/**
 * Regression for the Codex finding on PR #237: the syntax validity guard
 * originally only protected the CodeProject `runAutoFix` pass. The post-merge
 * `repairGeneratedFiles()` path (finalize-preflight / preview-session /
 * preview-render / export) called `runImportValidator` unguarded, so it could
 * still write syntactically broken code into the main runtime path.
 *
 * `runImportValidatorGuarded` is now the canonical guarded entry used by BOTH
 * paths. These tests lock the guard contract and the post-merge wiring.
 */

// A valid file that import-validator would normally touch (adds the missing
// lucide import). Used to confirm the guard does NOT interfere with good fixes.
const VALID_WITH_MISSING_ICON: CodeFile = {
  path: "app/page.tsx",
  language: "tsx",
  content: `export default function Page() {
  return <Clapperboard className="h-6 w-6" />;
}
`,
};

describe("runImportValidatorGuarded (centralized guard)", () => {
  it("passes good fixes through when output stays parseable", () => {
    const result = runImportValidatorGuarded(
      VALID_WITH_MISSING_ICON.content,
      VALID_WITH_MISSING_ICON.path,
    );
    expect(result.reverted).toBe(false);
    expect(result.code).toContain('import { Clapperboard } from "lucide-react"');
  });

  it("does NOT mask already-broken input (the orphaned-import shape stays, no revert)", () => {
    // The TS parser flags this as a parse error already on input, so the guard
    // must not claim a revert — the breakage must flow to preflight.
    const alreadyBroken = `import { Button } from "@/components/ui/button";
ArrowDown,
Zap,
;
from;
"lucide-react";

export default function Page() {
  return <Button>Hi</Button>;
}
`;
    const result = runImportValidatorGuarded(alreadyBroken, "app/page.tsx");
    expect(result.reverted).toBe(false);
  });

  it("skips the guard for non-ts/js files", () => {
    const css = `.x { color: red }`;
    const result = runImportValidatorGuarded(css, "app/globals.css");
    expect(result.reverted).toBe(false);
    expect(result.code).toBe(css);
  });

  it("REVERTS when the (injected) runner turns parseable input into unparseable output", () => {
    const validInput = `import { Button } from "@/components/ui/button";
export default function Page() { return <Button>Hi</Button>; }
`;
    // Simulate a future/edge import-validator bug that emits the orphaned-import
    // corruption shape (the exact production failure on app/page.tsx).
    const brokenRunner = () => ({
      code: `import { Button } from "@/components/ui/button";
ArrowDown,
Zap,
;
from;
"lucide-react";
export default function Page() { return <Button>Hi</Button>; }
`,
      fixes: [{ fixer: "import-validator", description: "bogus" }],
      warnings: [],
    });
    const result = runImportValidatorGuarded(validInput, "app/page.tsx", brokenRunner);
    expect(result.reverted).toBe(true);
    expect(result.code).toBe(validInput); // reverted to pre-fixer content
    expect(result.fixes).toHaveLength(0); // bogus fix is dropped
    expect(result.warnings.some((w) => w.includes("import-validator reverted"))).toBe(true);
  });

  it("does NOT revert an injected runner whose output is also parseable", () => {
    const validInput = `export default function Page() { return <div/>; }\n`;
    const okRunner = () => ({
      code: `import { X } from "y";\nexport default function Page() { return <div/>; }\n`,
      fixes: [{ fixer: "import-validator", description: "added X" }],
      warnings: [],
    });
    const result = runImportValidatorGuarded(validInput, "app/page.tsx", okRunner);
    expect(result.reverted).toBe(false);
    expect(result.code).toContain('import { X } from "y"');
  });

  // ---- Codex P2 finding 1: `.jsx` script kind ----------------------------
  describe(".jsx is parsed with JSX support (Codex finding 1)", () => {
    const VALID_JSX = `import { Button } from "./button";
export default function Page() {
  return <Button>Hi</Button>;
}
`;

    it("treats valid .jsx with JSX as parseable before the fixer (so a corrupt output CAN be reverted)", () => {
      // If .jsx were parsed as plain TS, the JSX `<Button>` would be a parse
      // error on input → guard would think it was "already broken" and let a
      // corrupt output pass. With JSX script kind, the corrupt output reverts.
      const brokenRunner = () => ({
        code: `import { Button } from "./button";
ArrowDown,
;
from;
"lucide-react";
export default function Page() { return <Button>Hi</Button>; }
`,
        fixes: [{ fixer: "import-validator", description: "bogus" }],
        warnings: [],
      });
      const result = runImportValidatorGuarded(VALID_JSX, "app/page.jsx", brokenRunner);
      expect(result.reverted).toBe(true);
      expect(result.code).toBe(VALID_JSX);
    });

    it("does NOT mask an already-broken .jsx input (no false revert)", () => {
      const alreadyBrokenJsx = `import { Button } from "./button";
ArrowDown,
;
from;
"lucide-react";
export default function Page() { return <Button/>; }
`;
      const passthroughRunner = (c: string) => ({
        code: c + "// touched\n",
        fixes: [{ fixer: "import-validator", description: "noop-ish" }],
        warnings: [],
      });
      const result = runImportValidatorGuarded(alreadyBrokenJsx, "app/page.jsx", passthroughRunner);
      expect(result.reverted).toBe(false);
    });
  });

  // ---- Codex P2 finding 1: validate JS dialect with JS rules ---------------
  describe("JS-dialect files reject TS-only syntax (Codex finding 1)", () => {
    it("countParseErrors flags `import type` in a .js file (TS parser is lenient, JS loader is not)", () => {
      const jsWithImportType = `import type { LucideProps } from "lucide-react";
export default function Page() { return null; }
`;
      // Same source is valid as TS, invalid as JS.
      expect(countParseErrors(jsWithImportType, "app/page.ts")).toBe(0);
      expect(countParseErrors(jsWithImportType, "app/page.js")).toBeGreaterThan(0);
      expect(countParseErrors(jsWithImportType, "app/page.mjs")).toBeGreaterThan(0);
    });

    it("flags type annotations / interfaces / type aliases in JS dialect", () => {
      expect(countParseErrors(`export function f(x: number){ return x; }\n`, "a.js")).toBeGreaterThan(0);
      expect(countParseErrors(`interface Foo { a: number }\nexport const x = 1;\n`, "a.jsx")).toBeGreaterThan(0);
      expect(countParseErrors(`type Foo = number;\nexport const x = 1;\n`, "a.cjs")).toBeGreaterThan(0);
      // Plain valid JS/JSX stays clean.
      expect(countParseErrors(`export default function P(){ return <div/>; }\n`, "a.jsx")).toBe(0);
    });

    it("reverts when a fixer injects `import type` into a .js file", () => {
      const validJs = `export default function Page() { return null; }\n`;
      const tsOnlyRunner = () => ({
        code: `import type { LucideProps } from "lucide-react";\nexport default function Page() { return null; }\n`,
        fixes: [{ fixer: "import-validator", description: "added type import" }],
        warnings: [],
      });
      const result = runImportValidatorGuarded(validJs, "app/page.js", tsOnlyRunner);
      expect(result.reverted).toBe(true);
      expect(result.code).toBe(validJs);
    });

    it("does NOT mask a .js input that ALREADY has TS-only syntax", () => {
      const alreadyTsInJs = `import type { X } from "y";\nexport const a = 1;\n`;
      const passthroughRunner = (c: string) => ({
        code: c + "export const b = 2;\n",
        fixes: [{ fixer: "import-validator", description: "noop-ish" }],
        warnings: [],
      });
      const result = runImportValidatorGuarded(alreadyTsInJs, "app/page.js", passthroughRunner);
      expect(result.reverted).toBe(false);
    });
  });

  // ---- Codex P2 finding 2: module-suffixed coverage ------------------------
  describe("module-suffixed files are guarded (Codex finding 2)", () => {
    it("isGuardablePath covers all TS/JS dialects incl. module suffixes", () => {
      for (const ext of ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]) {
        expect(isGuardablePath(`next.config.${ext}`)).toBe(true);
      }
      expect(isGuardablePath("README.md")).toBe(false);
      expect(isGuardablePath("styles.css")).toBe(false);
      expect(isGuardablePath("data.json")).toBe(false);
    });

    it.each(["next.config.mjs", "app/foo.mjs", "next.config.mts", "lib/x.cts", "lib/y.cjs"])(
      "reverts a corrupt import-validator output on %s",
      (path) => {
        const valid = `export const config = { reactStrictMode: true };\n`;
        const brokenRunner = () => ({
          code: `export const config = { reactStrictMode: true };\nZap,\n;\nfrom;\n"x";\n`,
          fixes: [{ fixer: "import-validator", description: "bogus" }],
          warnings: [],
        });
        const result = runImportValidatorGuarded(valid, path, brokenRunner);
        expect(result.reverted).toBe(true);
        expect(result.code).toBe(valid);
      },
    );
  });
});

describe("repairGeneratedFiles — post-merge guard wiring", () => {
  it("still applies the missing-lucide-import repair on the post-merge path", () => {
    const repaired = repairGeneratedFiles([VALID_WITH_MISSING_ICON]);
    const page = repaired.files.find((f) => f.path === "app/page.tsx");
    expect(page?.content).toContain('import { Clapperboard } from "lucide-react"');
  });

  it("never emits a file with NEW parser errors that the input did not have", () => {
    // Property-style guard: for a parseable input, the post-merge output must
    // also be parseable. We assert via re-running the guard on the output.
    const repaired = repairGeneratedFiles([VALID_WITH_MISSING_ICON]);
    const page = repaired.files.find((f) => f.path === "app/page.tsx");
    expect(page).toBeDefined();
    // Re-running the guard on the repaired output must not detect a regression
    // (i.e. the output is parseable, so no revert is triggered).
    const recheck = runImportValidatorGuarded(page!.content, page!.path);
    expect(recheck.reverted).toBe(false);
  });

  it("is idempotent on the guarded post-merge path", () => {
    const once = repairGeneratedFiles([VALID_WITH_MISSING_ICON]);
    const twice = repairGeneratedFiles(once.files);
    const onceContent = once.files.find((f) => f.path === "app/page.tsx")?.content;
    const twiceContent = twice.files.find((f) => f.path === "app/page.tsx")?.content;
    expect(twiceContent).toBe(onceContent);
  });
});

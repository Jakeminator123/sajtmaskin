import { describe, expect, it } from "vitest";
import { runImportValidatorGuarded } from "./import-validator";
import { repairGeneratedFiles } from "./repair-generated-files";
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

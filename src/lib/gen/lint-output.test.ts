import { describe, expect, it } from "vitest";
import { buildLintRepairContextLines, parseLintOutput } from "./lint-output";

describe("parseLintOutput", () => {
  it("parses standard eslint stylish lines", () => {
    const output = [
      "app/page.tsx",
      "  12:7  error    'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars",
      "  18:3  warning  Unexpected console statement                 no-console",
    ].join("\n");

    expect(parseLintOutput(output)).toEqual([
      {
        file: "app/page.tsx",
        line: 12,
        column: 7,
        severity: "error",
        ruleId: "@typescript-eslint/no-unused-vars",
        message: "'unused' is assigned a value but never used",
      },
      {
        file: "app/page.tsx",
        line: 18,
        column: 3,
        severity: "warning",
        ruleId: "no-console",
        message: "Unexpected console statement",
      },
    ]);
  });
});

describe("buildLintRepairContextLines", () => {
  it("builds concise lint-specific repair hints", () => {
    const output =
      "app/page.tsx\n  12:7  error  'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars";

    expect(buildLintRepairContextLines(output)).toEqual([
      "[lint] app/page.tsx:12:7 error: 'unused' is assigned a value but never used [@typescript-eslint/no-unused-vars]",
    ]);
  });
});

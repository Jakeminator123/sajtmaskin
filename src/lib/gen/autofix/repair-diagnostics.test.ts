import { describe, it, expect } from "vitest";
import {
  formatDiagnosticsForFixer,
  syntaxErrorsToDiagnostics,
  previewErrorToDiagnostics,
  qualityGateOutputToDiagnostics,
} from "./repair-diagnostics";

describe("syntaxErrorsToDiagnostics", () => {
  it("converts esbuild validation errors", () => {
    const errors = [
      { file: "app/page.tsx", line: 10, column: 5, message: "Unterminated string" },
    ];
    const diags = syntaxErrorsToDiagnostics(errors);
    expect(diags).toHaveLength(1);
    expect(diags[0].source).toBe("syntax");
    expect(diags[0].file).toBe("app/page.tsx");
    expect(diags[0].line).toBe(10);
  });
});

describe("previewErrorToDiagnostics", () => {
  it("parses a ReferenceError with stack trace", () => {
    const diags = previewErrorToDiagnostics(
      "ReferenceError: useState is not defined",
      "at ContactForm (preview-render?chatId=abc:748:33)",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].source).toBe("preview");
    expect(diags[0].message).toContain("useState is not defined");
  });

  it("works without a stack trace", () => {
    const diags = previewErrorToDiagnostics("TypeError: x is not a function");
    expect(diags).toHaveLength(1);
    expect(diags[0].source).toBe("preview");
    expect(diags[0].file).toBeUndefined();
  });
});

describe("qualityGateOutputToDiagnostics", () => {
  it("parses TypeScript errors from tsc output", () => {
    const output = `src/app/page.tsx(5,10): error TS2304: Cannot find name 'useState'.
src/app/page.tsx(12,3): error TS2322: Type 'string' is not assignable.`;
    const diags = qualityGateOutputToDiagnostics("typecheck", output);
    expect(diags).toHaveLength(2);
    expect(diags[0].source).toBe("quality-gate");
    expect(diags[0].file).toBe("src/app/page.tsx");
    expect(diags[0].line).toBe(5);
    expect(diags[0].message).toContain("Cannot find name 'useState'");
  });

  it("handles Next.js build error lines", () => {
    const output = `Error: Module not found: Can't resolve '@/lib/missing'`;
    const diags = qualityGateOutputToDiagnostics("build", output);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Module not found");
  });

  it("falls back to raw output when no structured errors found", () => {
    const output = "Something went wrong during build";
    const diags = qualityGateOutputToDiagnostics("build", output);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Something went wrong");
  });
});

describe("formatDiagnosticsForFixer", () => {
  it("formats mixed diagnostics into string array", () => {
    const formatted = formatDiagnosticsForFixer([
      { source: "syntax", file: "a.tsx", line: 5, message: "Unexpected token" },
      { source: "preview", message: "useState is not defined" },
      {
        source: "quality-gate",
        file: "b.tsx",
        line: 10,
        column: 3,
        message: "[typecheck] Cannot find name 'foo'",
      },
    ]);
    expect(formatted).toHaveLength(3);
    expect(formatted[0]).toBe("[syntax] a.tsx:5 Unexpected token");
    expect(formatted[1]).toBe("[preview] useState is not defined");
    expect(formatted[2]).toBe("[quality-gate] b.tsx:10:3 [typecheck] Cannot find name 'foo'");
  });
});

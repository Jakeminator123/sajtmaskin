import { describe, expect, it } from "vitest";
import { fixEscapeLeakage } from "./escape-leakage-fixer";

describe("fixEscapeLeakage", () => {
  it("leaves normal multi-line code untouched", () => {
    const code = [
      'import { Button } from "@/components/ui/button";',
      "",
      "export default function Page() {",
      "  return <Button>Hi</Button>;",
      "}",
    ].join("\n");
    const result = fixEscapeLeakage(code);
    expect(result.fixed).toBe(false);
    expect(result.kind).toBeNull();
    expect(result.code).toBe(code);
  });

  it("does not touch a file that legitimately contains '\\n' inside a string", () => {
    const code = [
      'export const SEPARATOR = "\\n---\\n";',
      'export const NEWLINE = "\\n";',
      "export function joinLines(lines: string[]) {",
      '  return lines.join("\\n");',
      "}",
    ].join("\n");
    const result = fixEscapeLeakage(code);
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("repairs a wrapped JSON-encoded file (the classic double-encode)", () => {
    const original = [
      'import { Button } from "@/components/ui/button";',
      "",
      "export default function Page() {",
      '  return <Button>Hej "världen"</Button>;',
      "}",
    ].join("\n");
    const corrupted = JSON.stringify(original);

    const result = fixEscapeLeakage(corrupted);

    expect(result.fixed).toBe(true);
    expect(result.kind).toBe("wrapped-json-string");
    expect(result.code).toBe(original);
    expect(result.bytesRecovered).toBeGreaterThan(0);
  });

  it("ignores a 'naked' JSON-encoded payload — too risky to disambiguate from legit minified code", () => {
    const original = [
      "export function greet(name: string) {",
      "  return `Hej ${name}`;",
      "}",
    ].join("\n");
    const corruptedWithoutOuterQuotes = JSON.stringify(original).slice(1, -1);
    const result = fixEscapeLeakage(corruptedWithoutOuterQuotes);
    expect(result.fixed).toBe(false);
  });

  it("ignores short single-quoted lines that happen to start and end with quotes", () => {
    const code = '"use client";';
    const result = fixEscapeLeakage(code);
    expect(result.fixed).toBe(false);
  });

  it("ignores a minified bundle that happens to start AND end with a quote-bearing token", () => {
    const minifiedLegit =
      'var a=1;var b="line1\\nline2";var c="x\\ny\\nz";var d=2;'.padEnd(150, "/");
    const result = fixEscapeLeakage(minifiedLegit);
    expect(result.fixed).toBe(false);
  });

  it("ignores files that start with a quote but are not valid JSON strings", () => {
    const code = '"use client";\nexport const X = 1;';
    const result = fixEscapeLeakage(code);
    expect(result.fixed).toBe(false);
  });

  it("does not touch empty input", () => {
    const result = fixEscapeLeakage("");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe("");
  });

  it("is idempotent — running on already-repaired output is a no-op", () => {
    const original = [
      "export const X = 1;",
      "export const Y = 2;",
      "export const Z = 3;",
    ].join("\n");
    const corrupted = JSON.stringify(original);
    const first = fixEscapeLeakage(corrupted);
    const second = fixEscapeLeakage(first.code);
    expect(first.fixed).toBe(true);
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });

  it("repairs even when JSON-encoded content carries escaped quotes", () => {
    const original = 'const greeting = "Hej \\"världen\\"";\nexport default greeting;';
    const corrupted = JSON.stringify(original);
    const result = fixEscapeLeakage(corrupted);
    expect(result.fixed).toBe(true);
    expect(result.code).toBe(original);
  });
});

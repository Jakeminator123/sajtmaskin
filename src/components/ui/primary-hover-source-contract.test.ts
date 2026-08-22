import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(__dirname, "../..");
const BUTTON_SOURCE = path.join(__dirname, "button.tsx");
const TAILWIND_CONFIG = path.resolve(__dirname, "../../..", "tailwind.config.cjs");
const LEGACY_PRIMARY_HOVER = "hover:bg-primary" + "/90";

function runtimeSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(fullPath);
    if (!/\.(?:ts|tsx)$/u.test(entry.name) || entry.name.includes(".test.")) return [];
    return [fullPath];
  });
}

describe("semantic primary hover source contract", () => {
  it("uses primary-hover for the default Button without changing its base colors", () => {
    const source = readFileSync(BUTTON_SOURCE, "utf8");
    const tailwindConfig = readFileSync(TAILWIND_CONFIG, "utf8");

    expect(source).toContain(
      'default: "bg-primary text-primary-foreground hover:bg-primary-hover"',
    );
    expect(tailwindConfig).toContain('hover: "hsl(var(--primary-hover))"');
  });

  it("does not leave alpha-based primary hovers in runtime src", () => {
    const remaining = runtimeSourceFiles(SRC_ROOT)
      .filter((filePath) => readFileSync(filePath, "utf8").includes(LEGACY_PRIMARY_HOVER))
      .map((filePath) => path.relative(SRC_ROOT, filePath).replaceAll(path.sep, "/"));

    expect(remaining).toEqual([]);
  });
});

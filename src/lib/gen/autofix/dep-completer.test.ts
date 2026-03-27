import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_PACKAGES, runDepCompleter } from "./dep-completer";

function extractLeadingMajor(versionSpec: string): number | null {
  const match = versionSpec.match(/\d+/);
  if (!match) return null;
  return Number.parseInt(match[0], 10);
}

function readBaselinePackageVersion(packageName: string): string {
  const projectScaffoldPath = resolve(process.cwd(), "src/lib/gen/project-scaffold.ts");
  const text = readFileSync(projectScaffoldPath, "utf8");
  const packageJsonMatch = text.match(/const PACKAGE_JSON = `([\s\S]*?)`;/);
  if (!packageJsonMatch) {
    throw new Error("Could not find PACKAGE_JSON template in project-scaffold.ts");
  }
  const parsed = JSON.parse(packageJsonMatch[1]) as {
    dependencies?: Record<string, string>;
  };
  const version = parsed.dependencies?.[packageName];
  if (!version) {
    throw new Error(`Missing ${packageName} in project-scaffold PACKAGE_JSON baseline`);
  }
  return version;
}

describe("dep-completer", () => {
  it("adds zod using known package mapping", () => {
    const result = runDepCompleter('import { z } from "zod";\nconst schema = z.object({});\n');
    expect(result.dependencies.zod).toBe(KNOWN_PACKAGES.zod);
  });

  it("keeps zod major aligned with project scaffold baseline", () => {
    const completerMajor = extractLeadingMajor(KNOWN_PACKAGES.zod);
    const baselineMajor = extractLeadingMajor(readBaselinePackageVersion("zod"));
    expect(completerMajor).not.toBeNull();
    expect(baselineMajor).not.toBeNull();
    expect(completerMajor).toBe(baselineMajor);
  });
});

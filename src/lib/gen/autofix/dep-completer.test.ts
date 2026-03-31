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

  it("keeps ALL overlapping KNOWN_PACKAGES majors aligned with scaffold baseline", () => {
    const scaffoldPath = resolve(process.cwd(), "src/lib/gen/project-scaffold.ts");
    const text = readFileSync(scaffoldPath, "utf8");
    const m = text.match(/const PACKAGE_JSON = `([\s\S]*?)`;/);
    expect(m).not.toBeNull();
    const baselineDeps = (JSON.parse(m![1]) as { dependencies?: Record<string, string> })
      .dependencies ?? {};

    const overlapping = Object.keys(KNOWN_PACKAGES).filter((k) => k in baselineDeps);
    expect(overlapping.length).toBeGreaterThan(0);

    const mismatches: string[] = [];
    for (const pkg of overlapping) {
      const knownMajor = extractLeadingMajor(KNOWN_PACKAGES[pkg]);
      const baselineMajor = extractLeadingMajor(baselineDeps[pkg]);
      if (knownMajor !== baselineMajor) {
        mismatches.push(
          `${pkg}: KNOWN_PACKAGES=${KNOWN_PACKAGES[pkg]} (major ${knownMajor}) vs baseline=${baselineDeps[pkg]} (major ${baselineMajor})`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("detects scoped npm imports (e.g. @react-three/fiber)", () => {
    const result = runDepCompleter(
      'import { Canvas } from "@react-three/fiber";\nimport { OrbitControls } from "@react-three/drei";\n',
    );
    expect(result.dependencies["@react-three/fiber"]).toBe(KNOWN_PACKAGES["@react-three/fiber"]);
    expect(result.dependencies["@react-three/drei"]).toBe(KNOWN_PACKAGES["@react-three/drei"]);
  });

  it("does not treat @/ path alias as an npm package", () => {
    const result = runDepCompleter('import { cn } from "@/lib/utils";\n');
    expect(result.dependencies["@/lib/utils"]).toBeUndefined();
    expect(Object.keys(result.dependencies)).toHaveLength(0);
  });
});

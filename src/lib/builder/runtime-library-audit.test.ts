import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_LIBRARY_MINIMUMS,
  createRuntimeLibrarySnapshot,
} from "./runtime-library-audit";

type PackageJsonShape = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function buildSnapshot() {
  const workspaceRoot = process.cwd();
  const uiDir = path.resolve(workspaceRoot, "src/components/ui");
  const packageJsonPath = path.resolve(workspaceRoot, "package.json");
  const packageJson = readJson<PackageJsonShape>(packageJsonPath);

  const localUiComponentNames = fs
    .readdirSync(uiDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => entry.name.replace(/\.tsx$/i, ""));

  const dependencyNames = [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ];

  return createRuntimeLibrarySnapshot({
    localUiComponentNames,
    dependencyNames,
  });
}

describe("runtime library coverage", () => {
  it("keeps a broad local runtime library surface", () => {
    const snapshot = buildSnapshot();

    expect(snapshot.counts.localUiComponents).toBeGreaterThanOrEqual(
      RUNTIME_LIBRARY_MINIMUMS.localUiComponents,
    );
    expect(snapshot.counts.aiElements).toBeGreaterThanOrEqual(
      RUNTIME_LIBRARY_MINIMUMS.aiElements,
    );
    expect(snapshot.counts.curatedUiCollections).toBeGreaterThanOrEqual(
      RUNTIME_LIBRARY_MINIMUMS.curatedUiCollections,
    );
    expect(snapshot.counts.featuredBlockGroups).toBeGreaterThanOrEqual(
      RUNTIME_LIBRARY_MINIMUMS.featuredBlockGroups,
    );
  });

  it("covers the priority UI and AI families", () => {
    const snapshot = buildSnapshot();

    const unsatisfiedFamilies = snapshot.familyCoverage.filter((family) => !family.satisfied);
    expect(unsatisfiedFamilies).toEqual([]);
  });
});

import fs from "node:fs";
import path from "node:path";
import { createRuntimeLibrarySnapshot } from "../src/lib/builder/runtime-library-audit";

type PackageJsonShape = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function getLocalUiComponentNames(workspaceRoot: string): string[] {
  const uiDir = path.resolve(workspaceRoot, "src/components/ui");
  return fs
    .readdirSync(uiDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => entry.name.replace(/\.tsx$/i, ""))
    .sort();
}

function getDependencyNames(workspaceRoot: string): string[] {
  const packageJsonPath = path.resolve(workspaceRoot, "package.json");
  const packageJson = readJson<PackageJsonShape>(packageJsonPath);
  return [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ].sort();
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none";
}

function main() {
  const workspaceRoot = process.cwd();
  const snapshot = createRuntimeLibrarySnapshot({
    localUiComponentNames: getLocalUiComponentNames(workspaceRoot),
    dependencyNames: getDependencyNames(workspaceRoot),
  });

  console.log("# Runtime Component Library Audit");
  console.log("");
  console.log(`- Local UI components: ${snapshot.counts.localUiComponents}`);
  console.log(`- AI elements: ${snapshot.counts.aiElements}`);
  console.log(`- Curated UI collections: ${snapshot.counts.curatedUiCollections}`);
  console.log(`- Featured block groups: ${snapshot.counts.featuredBlockGroups}`);
  console.log(`- Featured block items: ${snapshot.counts.featuredBlockItems}`);
  console.log("");
  console.log("## AI Category Breakdown");
  snapshot.aiCategoryBreakdown.forEach((category) => {
    console.log(`- ${category.label}: ${category.count}`);
  });
  console.log("");
  console.log("## Priority Family Coverage");
  snapshot.familyCoverage.forEach((family) => {
    console.log(`- ${family.label}: ${family.satisfied ? "ok" : "gap"}`);
    console.log(`  UI collections: ${formatList(family.uiCollections)}`);
    console.log(`  AI elements: ${formatList(family.aiElements)}`);
    console.log(`  Local UI matches: ${formatList(family.localUiMatches)}`);
    console.log(`  Dependencies present: ${formatList(family.dependenciesPresent)}`);
    if (family.missingDependencies.length > 0) {
      console.log(`  Missing dependencies: ${family.missingDependencies.join(", ")}`);
    }
  });
  console.log("");
  console.log("## Notable Gaps");
  if (snapshot.notableGaps.length === 0) {
    console.log("- none");
  } else {
    snapshot.notableGaps.forEach((gap) => console.log(`- ${gap}`));
  }
}

main();

import fs from "node:fs";
import path from "node:path";
import { createRuntimeLibrarySnapshot } from "../../src/lib/builder/runtime-library-audit";

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

  console.info("# Runtime Component Library Audit");
  console.info("");
  console.info(`- Local UI components: ${snapshot.counts.localUiComponents}`);
  console.info(`- AI elements: ${snapshot.counts.aiElements}`);
  console.info(`- Curated UI collections: ${snapshot.counts.curatedUiCollections}`);
  console.info(`- Featured block groups: ${snapshot.counts.featuredBlockGroups}`);
  console.info(`- Featured block items: ${snapshot.counts.featuredBlockItems}`);
  console.info("");
  console.info("## AI Category Breakdown");
  snapshot.aiCategoryBreakdown.forEach((category) => {
    console.info(`- ${category.label}: ${category.count}`);
  });
  console.info("");
  console.info("## Priority Family Coverage");
  snapshot.familyCoverage.forEach((family) => {
    console.info(`- ${family.label}: ${family.satisfied ? "ok" : "gap"}`);
    console.info(`  UI collections: ${formatList(family.uiCollections)}`);
    console.info(`  AI elements: ${formatList(family.aiElements)}`);
    console.info(`  Local UI matches: ${formatList(family.localUiMatches)}`);
    console.info(`  Dependencies present: ${formatList(family.dependenciesPresent)}`);
    if (family.missingDependencies.length > 0) {
      console.info(`  Missing dependencies: ${family.missingDependencies.join(", ")}`);
    }
  });
  console.info("");
  console.info("## Notable Gaps");
  if (snapshot.notableGaps.length === 0) {
    console.info("- none");
  } else {
    snapshot.notableGaps.forEach((gap) => console.info(`- ${gap}`));
  }
}

main();

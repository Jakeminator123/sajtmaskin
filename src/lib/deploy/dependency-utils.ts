import fs from "fs";
import path from "path";
import {
  SHADCN_FALLBACK_VERSIONS,
  type DependencyVersionMap,
} from "./dependency-utils-shared";

export type { DependencyVersionMap } from "./dependency-utils-shared";

let cachedVersionMap: DependencyVersionMap | null = null;

export function getRepoDependencyVersionMap(): DependencyVersionMap {
  if (cachedVersionMap) return cachedVersionMap;
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = {
      ...(parsed.dependencies || {}),
      ...(parsed.devDependencies || {}),
    };
    cachedVersionMap = Object.fromEntries(
      Object.entries(deps).filter(([, value]) => typeof value === "string" && value.trim()),
    );
  } catch (error) {
    console.warn("[Deps] Failed to read repo package.json:", error);
    cachedVersionMap = {};
  }
  return cachedVersionMap;
}

/**
 * Return a version map that merges the repo's own package.json versions
 * with SHADCN_FALLBACK_VERSIONS. Repo versions take precedence so
 * locally pinned versions are respected; fallback fills the gaps for
 * packages the repo doesn't use but v0-generated code may reference.
 */
export function getDeployVersionMap(): DependencyVersionMap {
  const repo = getRepoDependencyVersionMap();
  // Spread fallback first, then repo on top so repo wins on conflicts
  return { ...SHADCN_FALLBACK_VERSIONS, ...repo };
}

export {
  SHADCN_BASELINE_PACKAGES,
  SHADCN_FALLBACK_VERSIONS,
  collectExternalPackageNames,
  ensureDependenciesInPackageJson,
  getPackageNameFromImport,
} from "./dependency-utils-shared";

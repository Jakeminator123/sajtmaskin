import type { CodeFile } from "@/lib/gen/parser";
import { normalizeRoutePath, type RoutePlan } from "@/lib/gen/route-plan";
import type { BuildSpec } from "@/lib/gen/build-spec";
import { looksLikeEmptyPage, normPath } from "./file-heuristics";
import { buildShellPageContent, routePathToPageFilePath } from "./shell-pages";

export function ensureDeferredRouteShells(params: {
  files: CodeFile[];
  routePlan: RoutePlan | null | undefined;
  buildSpec: BuildSpec | null | undefined;
}): { files: CodeFile[]; addedPaths: string[]; preservedRealPaths: string[] } {
  const { files, routePlan, buildSpec } = params;
  if (!routePlan || !buildSpec) return { files, addedPaths: [], preservedRealPaths: [] };
  const realization = buildSpec.routeRealization ?? {
    mode: "full" as const,
    primaryRoutePath: routePlan.routes.find((route) => route.required)?.path ?? routePlan.routes[0]?.path ?? "/",
    fullRoutePaths: routePlan.routes.map((route) => route.path),
    shellRoutePaths: [],
  };

  // Post-derive view of effective-init: shell routes only get materialized
  // by build-spec when the original derive call was effective-init. Different
  // invariant than `isEffectiveInit({ generationMode, isFirstCodeGeneration })`
  // — do NOT swap for that helper here.
  const effectiveInit =
    buildSpec.generationMode === "init" ||
    realization.shellRoutePaths.length > 0;

  if (
    !effectiveInit ||
    realization.mode !== "primary-full-with-shells" ||
    realization.shellRoutePaths.length === 0
  ) {
    return { files, addedPaths: [], preservedRealPaths: [] };
  }

  const nextFiles = [...files];
  const addedPaths: string[] = [];
  const preservedRealPaths: string[] = [];

  for (const shellPath of realization.shellRoutePaths) {
    const route = routePlan.routes.find((candidate) => normalizeRoutePath(candidate.path) === shellPath);
    if (!route) continue;
    const pagePath = routePathToPageFilePath(shellPath);
    const candidatePagePaths = [pagePath, `src/${pagePath}`].map((candidate) => normPath(candidate));
    const shellContent = buildShellPageContent(route);
    let materializedExisting = false;
    let preservedRealExisting = false;

    for (let index = 0; index < nextFiles.length; index += 1) {
      const normalizedExistingPath = normPath(nextFiles[index]!.path);
      if (!candidatePagePaths.includes(normalizedExistingPath)) continue;
      // Add-only guard (P7 fix/autofix-fidelity-guards): a deferred-route
      // shell must never silently overwrite a real, content-rich page the
      // model already emitted for this route. Only materialize the shell over
      // an empty/trivial placeholder (`return null`, empty fragment, `<div/>`,
      // or no visible copy). Real pages are preserved verbatim.
      if (!looksLikeEmptyPage(nextFiles[index]!.content)) {
        preservedRealExisting = true;
        continue;
      }
      nextFiles[index] = {
        ...nextFiles[index]!,
        content: shellContent,
        language: "tsx",
      };
      materializedExisting = true;
    }

    if (materializedExisting) {
      addedPaths.push(shellPath);
      continue;
    }
    if (preservedRealExisting) {
      // A real page already covers this route — leave it untouched.
      preservedRealPaths.push(shellPath);
      continue;
    }
    nextFiles.push({
      path: pagePath,
      content: shellContent,
      language: "tsx",
    });
    addedPaths.push(shellPath);
  }

  if (addedPaths.length === 0) {
    return { files, addedPaths: [], preservedRealPaths };
  }
  return { files: nextFiles, addedPaths, preservedRealPaths };
}

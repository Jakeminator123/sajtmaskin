import { normalizeBuildIntent } from "@/lib/builder/build-intent";
import { normalizeRoutePath } from "../route-plan/path-utils";
import { getAllScaffolds } from "./registry";
import type {
  ScaffoldContractRoute,
  ScaffoldFilePromptRole,
  ScaffoldFileSerialization,
  ScaffoldManifest,
} from "./types";

export interface ScaffoldManifestIssue {
  scaffoldId: string;
  severity: "error" | "warning";
  message: string;
}

const VALID_FILE_ROLES: ReadonlySet<ScaffoldFilePromptRole> = new Set([
  "root-layout",
  "global-styles",
  "config",
  "route-page",
  "shared-component",
  "api-route",
  "default",
]);

const VALID_FILE_SERIALIZATIONS: ReadonlySet<ScaffoldFileSerialization> = new Set([
  "full",
  "excerpt",
  "signature",
]);

/**
 * SAJ-43 clarification — scaffold layout is `app/`-rooted by design.
 *
 * Two distinct layers in this codebase use different rules:
 *
 *  - **Scaffolds** (this module + `src/lib/gen/scaffolds/<id>/files/`) are
 *    Sajtmaskin's internal manifest format. They MUST use `app/`-prefix
 *    (Next.js root layout). All current scaffolds follow this. The check
 *    below fails loud if a future scaffold drifts to `src/app/`.
 *
 *  - **LLM-emitted project files** (the actual user-generated site) MAY use
 *    EITHER `app/` or `src/app/`. Several runtime code paths intentionally
 *    accept both — see `seo-defaults.ts` (`enrichLayoutMetadata`),
 *    `scaffold-aware-retry.ts` (`hasRouteCount`),
 *    `serialize.ts` (`scoreCriticalFile`),
 *    `finalize-preflight.ts` (`HOME_PAGE_REQUIRED_PATHS`),
 *    `builder/page-blocks-catalog.ts` (`PAGE_BLOCKS_TARGET_FILE_CANDIDATES`),
 *    plus editor + analyze paths. Do NOT remove `src/app/`-branches in those
 *    files — they exist because users may have v0-imported or pre-existing
 *    `src/app/`-rooted projects, and removing them would break those flows.
 */
function validateBuildIntentScope(
  scaffold: ScaffoldManifest,
  issues: ScaffoldManifestIssue[],
  routePath: string,
  fieldName: "planOnlyForBuildIntents" | "requiredOnlyForBuildIntents",
  value: string[] | undefined,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: `routeContract: ${fieldName} on ${routePath} must be a non-empty array when set`,
    });
    return;
  }
  const invalid = value.filter(
    (intent) => typeof intent !== "string" || normalizeBuildIntent(intent) !== intent,
  );
  if (invalid.length > 0) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: `routeContract: ${fieldName} on ${routePath} contains invalid build intents: ${invalid.join(", ")}`,
    });
  }
}

/**
 * Route-contract shape validation. The semantic link-vs-contract gate
 * (does every internal link resolve to a contract route, and does every
 * contract route have a link or a file?) lives in
 * `scaffold-manifest-validation.test.ts` — this only keeps the manifest
 * data itself well-formed so drift fails loud.
 */
function validateRouteContract(
  scaffold: ScaffoldManifest,
  issues: ScaffoldManifestIssue[],
): void {
  const contract = scaffold.routeContract;
  if (!contract) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message:
        "Scaffold is missing routeContract — every registered scaffold must own its route contract (requiredRoutes/optionalRoutes/declaredRoutePaths/dynamicRoutePatterns)",
    });
    return;
  }

  const seenPaths = new Map<string, string>();
  const checkPath = (rawPath: unknown, category: string, expectDynamic: boolean): void => {
    if (typeof rawPath !== "string" || !rawPath.startsWith("/")) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: ${category} contains a path that does not start with "/" (got ${JSON.stringify(rawPath)})`,
      });
      return;
    }
    if (normalizeRoutePath(rawPath) !== rawPath) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: ${category} path "${rawPath}" is not normalized (expected "${normalizeRoutePath(rawPath)}")`,
      });
    }
    const hasDynamicSegment = rawPath.includes("[");
    if (expectDynamic && !hasDynamicSegment) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: dynamicRoutePatterns entry "${rawPath}" has no dynamic segment — static routes belong in the other categories`,
      });
    }
    if (!expectDynamic && hasDynamicSegment) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: ${category} path "${rawPath}" contains a dynamic segment — patterns belong in dynamicRoutePatterns`,
      });
    }
    const priorCategory = seenPaths.get(rawPath);
    if (priorCategory) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: "${rawPath}" appears in both ${priorCategory} and ${category} — each route belongs to exactly one category`,
      });
      return;
    }
    seenPaths.set(rawPath, category);
  };

  const checkPlannedRoute = (route: ScaffoldContractRoute, category: string): void => {
    checkPath(route.path, category, false);
    if (typeof route.name !== "string" || route.name.trim().length === 0) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: ${category} entry ${route.path} is missing a name`,
      });
    }
    if (typeof route.planIntent !== "string" || route.planIntent.trim().length === 0) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: ${category} entry ${route.path} is missing a planIntent`,
      });
    }
    validateBuildIntentScope(
      scaffold,
      issues,
      route.path,
      "planOnlyForBuildIntents",
      route.planOnlyForBuildIntents,
    );
    validateBuildIntentScope(
      scaffold,
      issues,
      route.path,
      "requiredOnlyForBuildIntents",
      route.requiredOnlyForBuildIntents,
    );
    if (category === "optionalRoutes" && route.requiredOnlyForBuildIntents !== undefined) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: requiredOnlyForBuildIntents on optional route ${route.path} has no effect — optional routes are never planned as required`,
      });
    }
  };

  // Guard the collection shapes before iterating: a runtime manifest written
  // as text (backoffice lifecycle) or a legacy payload can carry null or
  // non-array fields, and the validator must report that as a structural
  // error instead of throwing (PR #982 AI-review finding F-3750ddc9db97).
  const readCollection = (name: string): unknown[] | null => {
    const value = (contract as unknown as Record<string, unknown>)[name];
    if (!Array.isArray(value)) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: ${name} must be an array (got ${value === null ? "null" : typeof value})`,
      });
      return null;
    }
    return value;
  };

  const checkPlannedEntry = (entry: unknown, category: string): void => {
    if (typeof entry !== "object" || entry === null) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `routeContract: ${category} contains a non-object entry (got ${entry === null ? "null" : typeof entry})`,
      });
      return;
    }
    checkPlannedRoute(entry as ScaffoldContractRoute, category);
  };

  for (const route of readCollection("requiredRoutes") ?? []) {
    checkPlannedEntry(route, "requiredRoutes");
  }
  for (const route of readCollection("optionalRoutes") ?? []) {
    checkPlannedEntry(route, "optionalRoutes");
  }
  for (const path of readCollection("declaredRoutePaths") ?? []) {
    checkPath(path, "declaredRoutePaths", false);
  }
  for (const pattern of readCollection("dynamicRoutePatterns") ?? []) {
    checkPath(pattern, "dynamicRoutePatterns", true);
  }
}

export function validateScaffoldManifest(scaffold: ScaffoldManifest): ScaffoldManifestIssue[] {
  const issues: ScaffoldManifestIssue[] = [];
  validateRouteContract(scaffold, issues);
  const allowedBuildIntents = (scaffold as { allowedBuildIntents?: unknown }).allowedBuildIntents;
  if (!Array.isArray(allowedBuildIntents) || allowedBuildIntents.length === 0) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: "allowedBuildIntents must contain at least one build intent",
    });
  } else {
    const invalidBuildIntents = allowedBuildIntents.filter(
      (intent) => typeof intent !== "string" || normalizeBuildIntent(intent) !== intent,
    );
    if (invalidBuildIntents.length > 0) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `allowedBuildIntents contains invalid values: ${invalidBuildIntents.join(", ")}`,
      });
    }
  }
  const filePaths = scaffold.files.map((file) => file.path);
  const uniqueFilePaths = new Set(filePaths);

  if (uniqueFilePaths.size !== filePaths.length) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: "Scaffold contains duplicate file paths",
    });
  }

  // SAJ-43 regression guard: scaffolds must use `app/`-prefix, not `src/app/`.
  // LLM-emitted output is allowed both (see JSDoc above), but our scaffold
  // manifests are an internal contract that this validator enforces.
  const srcAppFiles = scaffold.files.filter((file) => file.path.startsWith("src/app/"));
  if (srcAppFiles.length > 0) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: `Scaffold manifests must use \`app/\`-prefix, not \`src/app/\`. Drifted files: ${srcAppFiles.map((f) => f.path).join(", ")}`,
    });
  }

  // Scaffold Contract V2: validate optional per-file render policy fields
  // so manifest drift fails loud instead of silently rendering the wrong
  // shape in `serialize.ts`.
  for (const file of scaffold.files) {
    if (file.role !== undefined && !VALID_FILE_ROLES.has(file.role)) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `Invalid role "${file.role}" on ${file.path}. Allowed: ${[...VALID_FILE_ROLES].join(", ")}`,
      });
    }
    if (
      file.serialization !== undefined &&
      !VALID_FILE_SERIALIZATIONS.has(file.serialization)
    ) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `Invalid serialization "${file.serialization}" on ${file.path}. Allowed: ${[...VALID_FILE_SERIALIZATIONS].join(", ")}`,
      });
    }
    if (
      file.maxPromptChars !== undefined &&
      (!Number.isFinite(file.maxPromptChars) || file.maxPromptChars <= 0)
    ) {
      issues.push({
        scaffoldId: scaffold.id,
        severity: "error",
        message: `maxPromptChars on ${file.path} must be a positive number (got ${file.maxPromptChars})`,
      });
    }
  }

  const globalsCss = scaffold.files.find((file) => file.path === "app/globals.css");
  if (!globalsCss) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: "Scaffold is missing app/globals.css",
    });
  } else if (!globalsCss.content.includes("@theme inline")) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: "app/globals.css does not include @theme inline tokens",
    });
  }

  if (!scaffold.files.some((file) => file.path === "app/layout.tsx")) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: "Scaffold is missing app/layout.tsx",
    });
  }

  if (!scaffold.files.some((file) => file.path === "app/icon.svg")) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: "Scaffold is missing app/icon.svg default favicon",
    });
  }

  if (!scaffold.files.some((file) => file.path === "app/page.tsx")) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: "Scaffold is missing app/page.tsx",
    });
  }

  const totalFileChars = scaffold.files.reduce((sum, f) => sum + f.content.length, 0);
  if (totalFileChars > 15_000) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: `Total scaffold file content is ${totalFileChars} chars (recommended max 15 000). Large scaffolds waste prompt budget.`,
    });
  }

  if (!scaffold.qualityChecklist || scaffold.qualityChecklist.length < 3) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: `qualityChecklist should have at least 3 entries (has ${scaffold.qualityChecklist?.length ?? 0})`,
    });
  }

  if (scaffold.promptHints.length < 2) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: `promptHints should have at least 2 entries (has ${scaffold.promptHints.length})`,
    });
  }

  if (scaffold.research?.referenceTemplates) {
    for (const reference of scaffold.research.referenceTemplates) {
      if (reference.qualityScore < 0 || reference.qualityScore > 100) {
        issues.push({
          scaffoldId: scaffold.id,
          severity: "error",
          message: `Reference template ${reference.id} has an invalid quality score`,
        });
      }
    }
  }

  return issues;
}

export function runScaffoldManifestChecks(): ScaffoldManifestIssue[] {
  return getAllScaffolds().flatMap(validateScaffoldManifest);
}

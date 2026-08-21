export type ScaffoldId =
  | "base-nextjs"
  | "app-shell"
  | "landing-page"
  | "saas-landing"
  | "portfolio"
  | "blog"
  | "dashboard"
  | "auth-pages"
  | "ecommerce"
  | "projekt-bas-app";

export type ScaffoldMode = "off" | "auto" | "manual";

/**
 * Baseline used when the builder Scaffold menu is set to "Av" (`scaffoldMode: "off"`)
 * for freeform/init. Template / imported-repo chats must NOT use this — they stay
 * truly scaffold-less (`importedRepoMode`).
 */
export const SCAFFOLD_OFF_BASELINE_ID: ScaffoldId = "projekt-bas-app";

export type ScaffoldSiteKind = "marketing" | "app" | "commerce" | "editorial";
export type ScaffoldComplexity = "simple" | "medium" | "advanced";

/**
 * Scaffold Contract V2 — per-file prompt rendering policy.
 *
 * `role` describes the file's structural meaning so prompt assembly can
 * decide how much detail to inject. Defaults are derived from path
 * heuristics (see `serialize.ts → defaultRoleForPath`); manifest authors
 * only need to set `role` when the heuristic would pick the wrong one
 * (e.g. a `components/page-shell.tsx` that should render as full layout).
 */
export type ScaffoldFilePromptRole =
  | "root-layout"
  | "global-styles"
  | "config"
  | "route-page"
  | "shared-component"
  | "api-route"
  | "default";

/**
 * Scaffold Contract V2 — how much of a scaffold file is materialized in
 * the system prompt. `full` keeps the entire content when it fits the
 * critical-files budget, `excerpt` renders a FileContract with imports,
 * exports, structure, and capped representative lines, and `signature`
 * keeps imports/exports/structure without body lines. The default is
 * derived from `role`.
 */
export type ScaffoldFileSerialization = "full" | "excerpt" | "signature";

export interface ScaffoldFile {
  path: string;
  content: string;
  /**
   * V2 (optional): structural role of the file. Drives the default
   * serialization strategy in `serialize.ts`. When omitted, the role
   * is inferred from the path so existing scaffolds compile unchanged.
   */
  role?: ScaffoldFilePromptRole;
  /**
   * V2 (optional): explicit override of the default serialization
   * strategy for this file. Use when the role-default does not match
   * the file's prompt importance (e.g. a bespoke `app/page.tsx` that
   * the LLM should treat as `full`).
   */
  serialization?: ScaffoldFileSerialization;
  /**
   * V2 (optional): per-file ceiling for FileContract representative
   * lines. Used when `serialization` resolves to `"excerpt"` and when a
   * large `"full"` file falls back to FileContract.
   */
  maxPromptChars?: number;
}

/**
 * Build intents a scaffold route rule can be scoped to. Mirrors
 * `BuildIntent` in `@/lib/builder/build-intent` (kept inline like
 * `allowedBuildIntents` to avoid a scaffold→builder type dependency).
 */
export type ScaffoldRouteBuildIntent = "website" | "app" | "template";

/**
 * One concrete route the scaffold contributes to the route plan.
 */
export interface ScaffoldContractRoute {
  /** Normalized route path, e.g. "/products". */
  path: string;
  /** Route name forwarded to the planned route (e.g. "Products"). */
  name: string;
  /** Intent text forwarded verbatim to the planned route. */
  planIntent: string;
  /**
   * When set, the route is contributed to the plan ONLY for these build
   * intents (dashboard/app-shell defaults apply to "app" only). Omitted =
   * contributed for every build intent.
   */
  planOnlyForBuildIntents?: ScaffoldRouteBuildIntent[];
  /**
   * Only meaningful on `requiredRoutes`: when set, the route is planned as
   * required for these build intents and as optional (trimmable) for all
   * others. Example: blog's `/blog` is required for website/template but
   * optional for app. Omitted = required for every intent that plans it.
   */
  requiredOnlyForBuildIntents?: ScaffoldRouteBuildIntent[];
}

/**
 * The scaffold's route contract — the single owner of which routes the
 * scaffold's starter files assume. Route planning derives scaffold default
 * routes from it (`getScaffoldDefaultRoutes()` in
 * `src/lib/gen/route-plan/planning-helpers.ts`), and the deterministic
 * link-vs-contract gate in `scaffold-manifest-validation.test.ts` compares
 * every internal link in `files` against it.
 */
export interface ScaffoldRouteContract {
  /**
   * The route plan MUST include these. The scaffold's files may link to
   * them unconditionally.
   */
  requiredRoutes: ScaffoldContractRoute[];
  /**
   * May be planned (contributed as non-required) and may be trimmed by the
   * per-round page ceiling.
   */
  optionalRoutes: ScaffoldContractRoute[];
  /**
   * Static routes whose page file exists in the scaffold but which the
   * plan does not need to include every round. Never contributed to the
   * plan.
   */
  declaredRoutePaths: string[];
  /**
   * Dynamic route patterns (e.g. "/product/[id]"). Links are matched
   * against them as patterns; they are never planned as list entries.
   */
  dynamicRoutePatterns: string[];
  /**
   * SM-048 delivery coupling for the route-plan file filter in
   * `finalize-merge.ts`. Each group lists contract route paths whose starter
   * files are materialized together: when ANY member is in the route plan,
   * every member's files are delivered. Two uses:
   *
   *  - interlinked page sets where a surviving page would otherwise carry a
   *    dead link (auth-pages: /login ↔ /signup ↔ /forgot-password), and
   *  - dynamic patterns that ride on a planned list route but are NOT path
   *    descendants of it (ecommerce: /product/[id] rides on /products).
   *
   * Path descendants need no group — `app/blog/[slug]/page.tsx` already
   * follows `/blog` via `isUnderRoutePath`. Every member must be a path that
   * exists elsewhere in the contract.
   */
  deliveryGroups?: string[][];
}

export interface ScaffoldResearchMetadata {
  upgradeTargets: string[];
}

export interface ScaffoldManifest {
  id: ScaffoldId;
  label: string;
  description: string;
  /**
   * Structure role: controls baseline file/project shape.
   * Example: app-shell, one-page-marketing, editorial-hub.
   */
  structureProfile?: string;
  /**
   * Content role: controls domain/content direction independent of structure.
   * Example: service-business, portfolio-creator, ecommerce-catalog.
   */
  contentProfile?: string;
  /** First-step traits metadata for composable scaffold evolution. */
  siteKind?: ScaffoldSiteKind;
  complexity?: ScaffoldComplexity;
  features?: string[];
  allowedBuildIntents: Array<"website" | "app" | "template">;
  tags: string[];
  promptHints: string[];
  /**
   * Route contract owned by the scaffold itself (four categories:
   * required / optional / declared / dynamic). Optional in the type so
   * lightweight test fixtures compile, but `validateScaffoldManifest()`
   * requires it on every registered scaffold.
   */
  routeContract?: ScaffoldRouteContract;
  /**
   * Path or paths (within `files`) of the scaffold's navigation surfaces,
   * e.g. `components/site-header.tsx` or
   * `["components/site-header.tsx", "components/site-footer.tsx"]`.
   * `syncNavItemsFromRoutePlan` rewrites ONLY these files to mirror the
   * route plan on init — the manifest points the surfaces out, so nav
   * targets are never guessed from filenames (the SM-051 bug class).
   * A string is the single-surface form; an array lists every surface
   * (header + footer). Omit for scaffolds without a shared nav component
   * (auth-pages, portfolio, base-nextjs, projekt-bas-app); nav-sync is
   * then a no-op.
   */
  navSurface?: string | readonly string[];
  files: ScaffoldFile[];
  qualityChecklist?: string[];
  research?: ScaffoldResearchMetadata;
}

/** Normalize `navSurface` to a list of non-empty paths, order preserved. */
export function listNavSurfaces(
  navSurface: ScaffoldManifest["navSurface"] | null | undefined,
): string[] {
  if (typeof navSurface === "string") {
    return navSurface.length > 0 ? [navSurface] : [];
  }
  if (!Array.isArray(navSurface)) return [];
  return navSurface.filter((item): item is string => typeof item === "string" && item.length > 0);
}

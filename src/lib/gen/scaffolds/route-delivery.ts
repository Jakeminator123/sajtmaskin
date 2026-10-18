import type { ScaffoldRouteContract } from "./types";
import { normalizeRoutePath } from "../route-plan/path-utils";
import type { RoutePlan } from "../route-plan";

/**
 * True when `filePath` is an App Router file living under one of `routePaths`
 * (e.g. `app/blog/page.tsx` and `app/blog/[slug]/page.tsx` for `/blog`).
 * Handles both `app/` and `src/app/` layouts.
 */
export function isUnderRoutePath(
  filePath: string,
  routePaths: readonly string[],
): boolean {
  if (routePaths.length === 0) return false;
  const normalized = filePath.replace(/\\/g, "/").replace(/^src\//, "");
  if (!normalized.startsWith("app/")) return false;
  const relative = `/${normalized.slice("app/".length)}`;
  return routePaths.some(
    (route) => relative === route || relative.startsWith(`${route}/`),
  );
}

type ScaffoldRouteCategory = "required" | "optional" | "declared" | "dynamic";

export interface ScaffoldRouteDelivery {
  /** Normalized route paths present in the plan (input to the decision). */
  plannedRoutePaths: string[];
  /**
   * Returns drop info when `filePath` belongs to a contract route the plan
   * did not deliver, otherwise null (keep the file). Files that belong to no
   * contract route are SHARED (layout, globals, api, …) and always kept.
   */
  classifyDrop(
    filePath: string,
  ): { routePath: string; category: ScaffoldRouteCategory } | null;
}

/**
 * SM-048 — the route plan decides which of the scaffold's ROUTE files are
 * materialized on init. A contract route's files are delivered when the
 * route is in the plan, or when any member of its `deliveryGroups` group is
 * (auth-pages' interlinked trio, ecommerce's dynamic detail templates).
 * Required routes are contributed to every plan by contract, so they are
 * effectively always delivered — except when the plan explicitly excludes
 * them (an explicit one-page cap, the prod `90624ed9` case), and then the
 * plan wins by owner decision 2026-08-14.
 *
 * Fail-open: no contract, an empty contract, or a missing/empty plan
 * disables the filter entirely (returns null → keep everything). Only files
 * under `app/**` can ever be owned by a contract route (`isUnderRoutePath`),
 * so SHARED files (app/layout.tsx, app/globals.css, app/api/**, components/**,
 * app/icon.svg) are never dropped by construction.
 */
export function resolveScaffoldRouteDelivery(
  contract: ScaffoldRouteContract | undefined,
  routePlan: RoutePlan | null | undefined,
): ScaffoldRouteDelivery | null {
  if (!contract) return null;
  const entries: Array<{ path: string; category: ScaffoldRouteCategory }> = [];
  const pushRoutes = (routes: unknown, category: ScaffoldRouteCategory): void => {
    if (!Array.isArray(routes)) return;
    for (const route of routes) {
      const rawPath =
        typeof route === "string"
          ? route
          : typeof (route as { path?: unknown })?.path === "string"
            ? (route as { path: string }).path
            : null;
      if (rawPath === null) continue;
      const path = normalizeRoutePath(rawPath);
      if (path === "/") continue;
      entries.push({ path, category });
    }
  };
  pushRoutes(contract.requiredRoutes, "required");
  pushRoutes(contract.optionalRoutes, "optional");
  pushRoutes(contract.declaredRoutePaths, "declared");
  pushRoutes(contract.dynamicRoutePatterns, "dynamic");
  if (entries.length === 0) return null;

  const plannedRoutePaths = Array.isArray(routePlan?.routes)
    ? routePlan.routes
        .map((route) => normalizeRoutePath(route.path))
        .filter((path, index, all) => all.indexOf(path) === index)
    : [];
  if (plannedRoutePaths.length === 0) return null;
  const planned = new Set(plannedRoutePaths);

  const delivered = new Set(
    entries.map((entry) => entry.path).filter((path) => planned.has(path)),
  );
  for (const group of Array.isArray(contract.deliveryGroups)
    ? contract.deliveryGroups
    : []) {
    if (!Array.isArray(group)) continue;
    const members = group
      .filter((member): member is string => typeof member === "string")
      .map(normalizeRoutePath);
    if (members.some((member) => planned.has(member))) {
      for (const member of members) delivered.add(member);
    }
  }

  // Deepest-first so the reported owner of e.g. app/blog/[slug]/page.tsx is
  // the dynamic entry "/blog/[slug]", not its "/blog" prefix.
  const byDepth = [...entries].sort((a, b) => b.path.length - a.path.length);
  return {
    plannedRoutePaths,
    classifyDrop(filePath) {
      const owners = byDepth.filter((entry) =>
        isUnderRoutePath(filePath, [entry.path]),
      );
      if (owners.length === 0) return null;
      if (owners.some((owner) => delivered.has(owner.path))) return null;
      return { routePath: owners[0]!.path, category: owners[0]!.category };
    },
  };
}

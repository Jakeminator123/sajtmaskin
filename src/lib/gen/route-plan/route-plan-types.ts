export const ROUTE_PLAN_SITE_TYPES = [
  "one-page",
  "brochure",
  "content-heavy",
  "app-shell",
] as const;
export type RoutePlanSiteType = (typeof ROUTE_PLAN_SITE_TYPES)[number];

export function isRoutePlanSiteType(value: unknown): value is RoutePlanSiteType {
  return (
    typeof value === "string" &&
    (ROUTE_PLAN_SITE_TYPES as readonly string[]).includes(value)
  );
}

export type RoutePlanSource = "brief" | "prompt" | "scaffold";

/** Ordered route-plan contributors (e.g. prompt patterns then scaffold defaults). */
export interface RoutePlanProvenance {
  /** Drives planning UX and BuildSpec: brief wins, else scaffold if it changed IA, else prompt. */
  primarySource: RoutePlanSource;
  /** All sources that contributed routes or structure (stable order). */
  sources: RoutePlanSource[];
}

export interface PlannedRoute {
  path: string;
  name: string;
  intent: string;
  required: boolean;
}

export interface RoutePlan {
  provenance: RoutePlanProvenance;
  siteType: RoutePlanSiteType;
  reason: string;
  routes: PlannedRoute[];
  /** Set when the user explicitly stated a page count ("3 sidor"). */
  explicitPageCount?: number;
}

export function isRoutePlanSource(value: unknown): value is RoutePlanSource {
  return value === "brief" || value === "prompt" || value === "scaffold";
}

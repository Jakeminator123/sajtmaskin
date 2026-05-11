import { normalizeRoutePath } from "./path-utils";
import {
  isRoutePlanSiteType,
  isRoutePlanSource,
  type PlannedRoute,
  type RoutePlan,
  type RoutePlanProvenance,
  type RoutePlanSource,
} from "./route-plan-types";

/** Null-safe primary source; supports legacy persisted payloads that only had `source`. */
export function getRoutePlanPrimarySource(
  plan: RoutePlan | { provenance?: RoutePlanProvenance; source?: RoutePlanSource } | null | undefined,
): RoutePlanSource | null {
  if (!plan) return null;
  if ("provenance" in plan && plan.provenance?.primarySource) {
    return plan.provenance.primarySource;
  }
  if ("source" in plan && isRoutePlanSource((plan as { source?: unknown }).source)) {
    return (plan as { source: RoutePlanSource }).source;
  }
  return null;
}

/**
 * Parse a loose JSON object into RoutePlan, accepting legacy `{ source }` or new `{ provenance }`.
 */
export function parseRoutePlanFromUnknown(data: Record<string, unknown> | null | undefined): RoutePlan | null {
  if (!data || typeof data !== "object") return null;
  const siteType = data.siteType;
  const reason = data.reason;
  const routesRaw = data.routes;
  if (!isRoutePlanSiteType(siteType)) {
    return null;
  }
  if (typeof reason !== "string" || !Array.isArray(routesRaw)) return null;

  let provenance: RoutePlanProvenance | undefined;
  const prov = data.provenance;
  if (prov && typeof prov === "object" && !Array.isArray(prov)) {
    const p = prov as Record<string, unknown>;
    const primary = p.primarySource;
    const sources = p.sources;
    if (
      isRoutePlanSource(primary) &&
      Array.isArray(sources) &&
      sources.length > 0 &&
      sources.every(isRoutePlanSource)
    ) {
      provenance = { primarySource: primary, sources: [...sources] };
    }
  }
  if (!provenance && isRoutePlanSource(data.source)) {
    provenance = { primarySource: data.source, sources: [data.source] };
  }
  if (!provenance) return null;

  const routes: PlannedRoute[] = [];
  for (const item of routesRaw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.path !== "string") continue;
    const path = normalizeRoutePath(r.path);
    const name =
      typeof r.name === "string" && r.name.trim()
        ? r.name.trim()
        : path === "/"
          ? "Home"
          : path.split("/").filter(Boolean).join(" ") || "Route";
    const intent =
      typeof r.intent === "string" && r.intent.trim()
        ? r.intent.trim()
        : `Implement the ${name} route as planned.`;
    routes.push({
      path,
      name,
      intent,
      required: typeof r.required === "boolean" ? r.required : false,
    });
  }

  return {
    provenance,
    siteType,
    reason,
    routes,
  };
}

import { findMissingRequiredRoutes } from "./route-matchers";
import type { PlannedRoute, RoutePlan } from "./route-plan-types";

export function findMissingPlannedRoutes(
  routePlan: RoutePlan | null | undefined,
  actualRoutes: string[],
): PlannedRoute[] {
  if (!routePlan || routePlan.routes.length === 0) return [];
  return findMissingRequiredRoutes(routePlan.routes, actualRoutes);
}

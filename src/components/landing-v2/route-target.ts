import type { BuildIntent, BuildMethod } from "@/lib/builder/build-intent";

export type LandingRouteTarget = {
  buildMethod: BuildMethod;
  buildIntent: BuildIntent;
  source?: string;
};

export function resolveLandingRouteTarget(categoryId: string | null): LandingRouteTarget {
  switch (categoryId) {
    case "template":
    case "mall":
    case "kategori":
      return { buildMethod: "category", buildIntent: "template" };
    case "analyserad":
      return { buildMethod: "wizard", buildIntent: "website" };
    case "audit":
      return { buildMethod: "audit", buildIntent: "website", source: "audit" };
    case "fritext":
    default:
      return { buildMethod: "freeform", buildIntent: "website" };
  }
}

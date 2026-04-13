import type { BuildSpec } from "./build-spec";
import type { RoutePlan, RoutePlanSource } from "./route-plan";
import type { ScaffoldManifest } from "./scaffolds/types";

export interface ScaffoldRouteContract {
  scaffoldId: string | null;
  routeSource: RoutePlanSource;
  plannedRoutes: Array<{
    path: string;
    name: string;
    required: boolean;
  }>;
  requiredRoutePaths: string[];
}

export interface GenerationValidateContract {
  requiredRoutePaths: string[];
  requiredFiles: string[];
  previewPolicy: BuildSpec["previewPolicy"];
  verificationPolicy: BuildSpec["verificationPolicy"];
  qualityTarget: BuildSpec["qualityTarget"];
}

export interface OrchestrationContract {
  scaffoldToRoute: ScaffoldRouteContract;
  generationToValidate: GenerationValidateContract;
}

export function buildOrchestrationContract(params: {
  resolvedScaffold: ScaffoldManifest | null;
  routePlan: RoutePlan;
  buildSpec: BuildSpec;
}): OrchestrationContract {
  const { resolvedScaffold, routePlan, buildSpec } = params;
  const routeRealization = buildSpec.routeRealization ?? {
    mode: "full" as const,
    primaryRoutePath: routePlan.routes.find((route) => route.required)?.path ?? routePlan.routes[0]?.path ?? "/",
    fullRoutePaths: routePlan.routes.map((route) => route.path),
    shellRoutePaths: [],
  };
  const requiredRoutePaths =
    routeRealization.mode === "primary-full-with-shells"
      ? routeRealization.fullRoutePaths
      : routePlan.routes
          .filter((route) => route.required)
          .map((route) => route.path);
  return {
    scaffoldToRoute: {
      scaffoldId: resolvedScaffold?.id ?? null,
      routeSource: routePlan.provenance.primarySource,
      plannedRoutes: routePlan.routes.map((route) => ({
        path: route.path,
        name: route.name,
        required: route.required,
      })),
      requiredRoutePaths,
    },
    generationToValidate: {
      requiredRoutePaths,
      requiredFiles: ["app/layout.tsx", "app/page.tsx"],
      previewPolicy: buildSpec.previewPolicy,
      verificationPolicy: buildSpec.verificationPolicy,
      qualityTarget: buildSpec.qualityTarget,
    },
  };
}

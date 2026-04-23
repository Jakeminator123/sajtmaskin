/**
 * Route plan derived fields: primary-route pick, required companion auth
 * routes, route-realization policy (full vs primary-full-with-shells),
 * and the effective-init route count used by quality-target/context-policy
 * scoring.
 *
 * Split out of `build-spec.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import { FEATURES } from "@/lib/config";
import type { RoutePlan } from "../route-plan";
import {
  isEffectiveInit,
  type BuildSpecGenerationMode,
  type RouteRealizationPolicy,
} from "./types";

export function buildRoutePlanSummary(routePlan: RoutePlan): string {
  const routes = routePlan.routes
    .slice(0, 8)
    .map((route) => route.path)
    .join(",");
  return `${routePlan.provenance.primarySource}:${routePlan.siteType}:${routes || "/"}`;
}

function choosePrimaryRoutePath(params: {
  buildIntent: BuildIntent;
  routePlan: RoutePlan;
  prompt: string;
}): string {
  const { buildIntent, routePlan, prompt } = params;
  const normalizedPrompt = prompt.toLowerCase();
  const routePaths = routePlan.routes.map((route) => route.path);
  const rootRoute = routePlan.routes.find((route) => route.path === "/");
  const dashboardLikePath = routePlan.routes.find((route) =>
    ["/dashboard", "/app", "/workspace"].includes(route.path),
  )?.path;

  if (buildIntent === "app") {
    if (/\b(dashboard|instrumentpanel|workspace|app shell)\b/i.test(normalizedPrompt)) {
      return dashboardLikePath ?? rootRoute?.path ?? routePaths[0] ?? "/";
    }
    return rootRoute?.path ?? dashboardLikePath ?? routePaths[0] ?? "/";
  }

  if (rootRoute) return rootRoute.path;
  return routePaths[0] ?? "/";
}

const AUTH_ROUTE_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

function deriveRequiredCompanionRoutes(params: {
  buildIntent: BuildIntent;
  prompt: string;
  primaryRoutePath: string;
  allRoutePaths: string[];
}): string[] {
  const { buildIntent, prompt, primaryRoutePath, allRoutePaths } = params;
  const authRoutes = allRoutePaths.filter((path) => AUTH_ROUTE_PATHS.has(path));
  const authSignals =
    buildIntent === "app" ||
    /\b(auth|login|sign.?in|signup|register|forgot.?password|reset.?password|lösenord|inlogg)\b/i.test(
      prompt,
    ) ||
    authRoutes.length >= 2;

  if (!authSignals || authRoutes.length === 0) return [];
  return authRoutes.filter((path) => path !== primaryRoutePath);
}

export function deriveRouteRealizationPolicy(params: {
  generationMode: BuildSpecGenerationMode;
  buildIntent: BuildIntent;
  prompt: string;
  routePlan: RoutePlan;
  isFirstCodeGeneration?: boolean;
  existingShellRoutePaths?: string[];
}): RouteRealizationPolicy {
  const {
    generationMode,
    buildIntent,
    prompt,
    routePlan,
    isFirstCodeGeneration,
    existingShellRoutePaths = [],
  } = params;
  const allRoutePaths = routePlan.routes.map((route) => route.path);
  const primaryRoutePath = choosePrimaryRoutePath({ buildIntent, routePlan, prompt });

  const effectiveInit = isEffectiveInit({ generationMode, isFirstCodeGeneration });

  if (effectiveInit && FEATURES.deferExtraRoutesOnInit && allRoutePaths.length > 1) {
    const companionRoutePaths = deriveRequiredCompanionRoutes({
      buildIntent,
      prompt,
      primaryRoutePath,
      allRoutePaths,
    });
    const fullRoutePaths = Array.from(
      new Set([primaryRoutePath, ...companionRoutePaths]),
    );

    return {
      mode: "primary-full-with-shells",
      primaryRoutePath,
      fullRoutePaths,
      shellRoutePaths: allRoutePaths.filter((path) => !fullRoutePaths.includes(path)),
    };
  }

  if (
    !effectiveInit &&
    FEATURES.deferExtraRoutesOnInit &&
    existingShellRoutePaths.length > 0
  ) {
    const promptLower = prompt.toLowerCase();
    const shellsToPreserve = existingShellRoutePaths.filter((shellPath) => {
      const route = routePlan.routes.find(
        (r) => r.path === shellPath,
      );
      const routeName = route?.name?.toLowerCase() ?? "";
      const pathSegments = shellPath
        .split("/")
        .filter(Boolean)
        .map((s) => s.replace(/\[|\]/g, "").toLowerCase());

      const expandSignals = [
        "bygg ut",
        "bygg upp",
        "skapa sida",
        "expand",
        "fyll i",
        "fyll ut",
        "gör klar",
        "gör riktig",
        "gör komplett",
        "implementera",
        "utveckla",
        "lägg innehåll",
        "lägg till innehåll",
        "mer komplett",
        "more complete",
        "build out",
        "flesh out",
        "complete the",
        "finish the",
        "aktivera",
      ];
      const mentionsRoute =
        pathSegments.some((seg) => seg.length > 2 && promptLower.includes(seg)) ||
        (routeName.length > 2 && promptLower.includes(routeName));

      return !(mentionsRoute && expandSignals.some((sig) => promptLower.includes(sig)));
    });

    if (shellsToPreserve.length > 0) {
      return {
        mode: "primary-full-with-shells",
        primaryRoutePath,
        fullRoutePaths: allRoutePaths.filter(
          (path) => !shellsToPreserve.includes(path),
        ),
        shellRoutePaths: shellsToPreserve,
      };
    }
  }

  return {
    mode: "full",
    primaryRoutePath,
    fullRoutePaths: allRoutePaths,
    shellRoutePaths: [],
  };
}

export function effectiveInitRouteCount(params: {
  generationMode: BuildSpecGenerationMode;
  routePlan: RoutePlan;
  routeRealization: RouteRealizationPolicy;
  /**
   * Bug 04#2 (2026-04-22 audit): använd samma `isEffectiveInit`-semantik
   * som `deriveRouteRealizationPolicy`. Utan isFirstCodeGeneration fick
   * follow-up + first-code-gen hela `routePlan.routes.length` inrapporterat
   * till qualityTarget/scoreContextPolicy, vilket promotade run:en till
   * premium/heavy även när realizationen faktiskt bara byggde primary-full
   * med shell-sidor.
   */
  isFirstCodeGeneration?: boolean | null;
}): number {
  const { generationMode, routePlan, routeRealization, isFirstCodeGeneration } = params;
  const effectiveInit = isEffectiveInit({ generationMode, isFirstCodeGeneration });
  if (effectiveInit && routeRealization.mode === "primary-full-with-shells") {
    return routeRealization.fullRoutePaths.length;
  }
  return routePlan.routes.length;
}

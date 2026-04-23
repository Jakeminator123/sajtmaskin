/**
 * Derived lists: reference categories, forbidden patterns, capability flags.
 *
 * Split out of `build-spec.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import {
  HEAVY_CAPABILITY_KEYS,
  hasHeavyCapabilities,
  type InferredCapabilities,
} from "../capability-inference";
import type { PreGenerationContractContext } from "../contract/pre-generation-contracts";
import type { RoutePlan } from "../route-plan";
import type { ScaffoldManifest } from "../scaffolds/types";
import type {
  BuildSpecCapabilityFlags,
  BuildSpecChangeScope,
  BuildSpecGenerationMode,
  BuildSpecPreviewPolicy,
} from "./types";

export function deriveReferenceCategories(
  resolvedScaffold: ScaffoldManifest | null,
  routePlan: RoutePlan,
  preGenerationContracts: PreGenerationContractContext,
): string[] {
  const categories = new Set<string>();

  switch (resolvedScaffold?.id) {
    case "base-nextjs":
      categories.add("starter");
      break;
    case "landing-page":
      categories.add("marketing-sites");
      break;
    case "saas-landing":
      categories.add("saas");
      categories.add("marketing-sites");
      break;
    case "portfolio":
      categories.add("portfolio");
      break;
    case "blog":
      categories.add("blog");
      break;
    case "dashboard":
    case "app-shell":
      categories.add("admin-dashboard");
      break;
    case "auth-pages":
      categories.add("authentication");
      break;
    case "ecommerce":
      categories.add("ecommerce");
      break;
    default:
      break;
  }

  if (routePlan.routes.some((route) => route.path.startsWith("/docs"))) {
    categories.add("documentation");
  }

  if (
    preGenerationContracts.contracts.integrations.length > 0 ||
    preGenerationContracts.contracts.dataMode === "persisted"
  ) {
    categories.add("backend");
  }

  return Array.from(categories);
}

export function deriveForbiddenPatterns(params: {
  buildIntent: BuildIntent;
  generationMode: BuildSpecGenerationMode;
  changeScope: BuildSpecChangeScope;
  previewPolicy: BuildSpecPreviewPolicy;
}): string[] {
  const { buildIntent, generationMode, changeScope, previewPolicy } = params;
  const patterns = new Set<string>([
    "leave_bracket_placeholders",
    "compat_preview_primary",
  ]);

  if (buildIntent !== "app") {
    patterns.add("unrequested_app_shell");
  }
  if (generationMode === "followUp" && changeScope !== "redesign") {
    patterns.add("unrequested_full_redesign");
  }
  if (previewPolicy === "fidelity2") {
    patterns.add("require_full_build_verification");
  }
  if (changeScope === "copy") {
    patterns.add("layout_reset_for_copy_change");
  }

  return Array.from(patterns);
}

export function deriveCapabilityFlags(
  capabilities: InferredCapabilities | null,
): BuildSpecCapabilityFlags {
  if (!capabilities) return { heavy: false, signals: [] };
  // SINGLE SOURCE OF TRUTH: HEAVY_CAPABILITY_KEYS is also what
  // `hasHeavyCapabilities()` checks. Previously this function maintained
  // its own (broader) list which drifted apart from the canonical one,
  // letting `signals` include capabilities that did not actually flip
  // `heavy`. Reviewer caught the inconsistency 2026-04-21.
  const signals = HEAVY_CAPABILITY_KEYS.filter((key) => capabilities[key] === true);
  return {
    heavy: hasHeavyCapabilities(capabilities),
    signals: signals.map((key) => String(key)),
  };
}

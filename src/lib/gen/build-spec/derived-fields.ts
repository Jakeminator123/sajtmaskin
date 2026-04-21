/**
 * Pure derivation helpers for BuildSpec fields that can be computed from
 * already-resolved scaffolds / route plan / contracts without touching
 * prompt text.
 *
 * Extracted from `src/lib/gen/build-spec.ts` 2026-04-21. Behavior-preserving.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { PreGenerationContractContext } from "../contract/pre-generation-contracts";
import type { RoutePlan } from "../route-plan";
import type { ScaffoldManifest } from "../scaffolds/types";
import type {
  BuildSpecChangeScope,
  BuildSpecContextPolicy,
  BuildSpecGenerationMode,
  BuildSpecPreviewPolicy,
  BuildSpecTokenBudgets,
} from "../build-spec";

/**
 * Token budgets per `contextPolicy`. Tuned to be **generous but not absurd**:
 * `inferContextPolicy` picks the right tier based on change scope, route
 * count, integrations and capability heaviness, so these absolute numbers
 * just need enough headroom that block pruning rarely fires unless we're
 * genuinely overflowing.
 *
 * Rationale (as of 2026-04):
 * - Largest scaffold (ecommerce) is ~7.3k tokens fully serialized.
 * - Modern context windows (GPT-5, Claude 4) are 200k+; even `heavy` here
 *   sits at ~80k and leaves plenty for chat history + completion tokens.
 * - `*Chars` mirrors via `CHARS_PER_TOKEN_ESTIMATE = 3.2` for refs and
 *   system context; `scaffoldChars` is tighter (~1.9 ratio) so the
 *   scaffold block can't dominate the dynamic context.
 */
export function tokenBudgetsForContextPolicy(
  contextPolicy: BuildSpecContextPolicy,
): BuildSpecTokenBudgets {
  switch (contextPolicy) {
    case "light":
      return {
        scaffoldTokens: 13_000,
        refsTokens: 5_000,
        systemContextTokens: 22_000,
        scaffoldChars: 24_000,
        refsChars: 16_000,
        systemContextChars: 70_000,
      };
    case "heavy":
      return {
        scaffoldTokens: 32_000,
        refsTokens: 16_000,
        systemContextTokens: 80_000,
        scaffoldChars: 60_000,
        refsChars: 50_000,
        systemContextChars: 256_000,
      };
    default:
      return {
        scaffoldTokens: 22_000,
        refsTokens: 12_000,
        systemContextTokens: 60_000,
        scaffoldChars: 42_000,
        refsChars: 38_000,
        systemContextChars: 192_000,
      };
  }
}

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
    case "content-site":
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

/**
 * Canonical fan-in type for own-engine generation.
 *
 * Every signal the model needs — scaffold, routes, contracts, brief, theme,
 * prompts — is consolidated into this single artifact before generation.
 * Callers should treat this as the sole source of truth for what was fed
 * into the LLM (and optionally log/persist it for lineage).
 */
import { createHash } from "node:crypto";

import type { OrchestrationBase, OrchestrationInput } from "./orchestrate";
import type { BuildSpec } from "./build-spec";

export interface GenerationInputPackage extends OrchestrationBase {
  /** User's original prompt text. */
  userPrompt: string;
  /** Structured brief (deep brief) when available. */
  brief: Record<string, unknown> | null;
  /** Scaffold selection mode used for this generation. */
  scaffoldMode: "auto" | "manual" | "off";
  /** Full system prompt (STATIC_CORE + dynamic) for own engine. */
  engineSystemPrompt: string;
  /** Dynamic-only context for plan mode, prompt dump, and debug. */
  dynamicContext: string;
  /** SHA-256 of deterministic inputs for lineage tracking. */
  lineageHash: string;
}

/**
 * Compute a stable hash over the deterministic inputs that shaped generation.
 * Time-dependent or embedding-dependent fields are excluded so the same
 * logical input always produces the same hash.
 */
export function computeLineageHash(pkg: {
  userPrompt: string;
  brief: unknown;
  scaffoldMode: string;
  scaffoldContext: string | undefined;
  routePlan: unknown;
  preGenerationContracts: unknown;
  buildSpec?: BuildSpec | null;
  capabilityHints: string;
}): string {
  const h = createHash("sha256");
  h.update(pkg.userPrompt);
  h.update(JSON.stringify(pkg.brief ?? null));
  h.update(pkg.scaffoldMode);
  h.update(pkg.scaffoldContext ?? "");
  h.update(JSON.stringify(pkg.routePlan ?? null));
  h.update(JSON.stringify(pkg.preGenerationContracts ?? null));
  h.update(JSON.stringify(pkg.buildSpec ?? null));
  h.update(pkg.capabilityHints);
  return h.digest("hex");
}

/**
 * Serialise the package to a JSON-safe object for prompt dumps and logging.
 * Omits the full system prompt (large, already dumped separately) and keeps
 * only a length indicator.
 */
export function serializePackageForDump(
  pkg: GenerationInputPackage,
): Record<string, unknown> {
  return {
    lineageHash: pkg.lineageHash,
    userPrompt: pkg.userPrompt,
    brief: pkg.brief,
    scaffoldMode: pkg.scaffoldMode,
    scaffoldId: pkg.resolvedScaffold?.id ?? null,
    scaffoldFamily: pkg.resolvedScaffold?.family ?? null,
    scaffoldSelection: pkg.scaffoldSelection ?? null,
    buildSpec: pkg.buildSpec,
    routePlan: pkg.routePlan,
    orchestrationContract: pkg.orchestrationContract,
    contracts: pkg.preGenerationContracts,
    capabilityHints: pkg.scaffoldAndCapability,
    engineSystemPromptLength: pkg.engineSystemPrompt.length,
    dynamicContextLength: pkg.dynamicContext.length,
  };
}

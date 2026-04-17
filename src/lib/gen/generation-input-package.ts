/**
 * Canonical orchestration/system fan-in type for own-engine generation.
 *
 * Captures the system-side inputs that shape generation before the LLM call:
 * scaffold, routes, contracts, brief, theme, dynamic context, and lineage.
 * User-turn and chat history are still assembled separately by the API/pipeline
 * layer, so this artifact should be read as the canonical source of truth for
 * orchestration/system assembly — not the entire completions request.
 */
import { createHash } from "node:crypto";

import type { OrchestrationBase } from "./orchestrate";
import type { BuildSpec } from "./build-spec";
import type { DynamicContextBlockTrace, DynamicContextPruning } from "./system-prompt";

export interface GenerationInputPackage extends OrchestrationBase {
  /** User-turn text that shaped orchestration/system assembly for this run. */
  userPrompt: string;
  /** Deep Brief when available. */
  brief: Record<string, unknown> | null;
  /** Scaffold selection mode used for this generation. */
  scaffoldMode: "auto" | "manual" | "off";
  /** Full system prompt (STATIC_CORE + dynamic) for own engine. */
  engineSystemPrompt: string;
  /** Dynamic-only context for plan mode, prompt dump, and debug. */
  dynamicContext: string;
  /** Token budgeting / pruning applied to dynamic context (see `buildBudgetedSystemPrompt`). */
  dynamicContextPruning: DynamicContextPruning;
  /** Structured observability for the dynamic prompt blocks before/after pruning. */
  dynamicContextBlocks: DynamicContextBlockTrace[];
  /** Chosen scaffold variant for this generation. */
  variantId: string | null;
  /** SHA-256 of deterministic inputs for lineage tracking. */
  lineageHash: string;
}

/**
 * Compute a stable hash over the deterministic inputs that shaped generation.
 * Time-dependent or embedding-dependent fields are excluded so the same
 * logical input always produces the same hash.
 *
 * **Lineage invariant:** if any field in here changes between two runs, the
 * resulting system prompt MAY differ. The optional fields cover signals that
 * end up in the dynamic context (theme tokens, custom instructions, palette,
 * design references, picked variant) — leaving them out caused two different
 * prompts to share the same hash.
 */
export function computeLineageHash(pkg: {
  userPrompt: string;
  brief: unknown;
  scaffoldMode: string;
  scaffoldContext: string | undefined;
  capabilityHints?: string | undefined;
  routePlan: unknown;
  preGenerationContracts: unknown;
  buildSpec?: BuildSpec | null;
  customInstructions?: string | null;
  themeColors?: unknown;
  componentPalette?: unknown;
  designReferences?: unknown;
  variantId?: string | null;
}): string {
  const h = createHash("sha256");
  h.update(pkg.userPrompt);
  h.update(JSON.stringify(pkg.brief ?? null));
  h.update(pkg.scaffoldMode);
  h.update(pkg.scaffoldContext ?? "");
  h.update(pkg.capabilityHints ?? "");
  h.update(JSON.stringify(pkg.routePlan ?? null));
  h.update(JSON.stringify(pkg.preGenerationContracts ?? null));
  h.update(JSON.stringify(pkg.buildSpec ?? null));
  h.update(pkg.customInstructions ?? "");
  h.update(JSON.stringify(pkg.themeColors ?? null));
  h.update(JSON.stringify(pkg.componentPalette ?? null));
  h.update(JSON.stringify(pkg.designReferences ?? null));
  h.update(pkg.variantId ?? "");
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
    scaffoldSelection: pkg.scaffoldSelection ?? null,
    buildSpec: pkg.buildSpec,
    routePlan: pkg.routePlan,
    orchestrationContract: pkg.orchestrationContract,
    contracts: pkg.preGenerationContracts,
    capabilityHints: pkg.capabilityHints ?? null,
    engineSystemPromptLength: pkg.engineSystemPrompt.length,
    dynamicContextLength: pkg.dynamicContext.length,
    dynamicContextPruning: pkg.dynamicContextPruning,
    dynamicContextBlocks: pkg.dynamicContextBlocks,
    variantId: pkg.variantId,
  };
}

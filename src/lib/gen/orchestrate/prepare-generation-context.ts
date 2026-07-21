/**
 * `prepareGenerationContext` — the one-call entry point that runs base
 * resolution, prompt finalization and package assembly. Moved verbatim from
 * `src/lib/gen/orchestrate.ts` (structural split, no behavior change).
 */
import { type GenerationInputPackage } from "../generation-input-package";
import {
  buildGenerationInputPackage,
  writeOrchestrationDynamicDump,
} from "./generation-package";
import { finalizeOrchestrationPrompts } from "./finalize-prompts";
import { resolveOrchestrationBase } from "./resolve-base";
import type { OrchestrationInput } from "./types";

/**
 * Prepare all generation context in one place so that scaffold, brief,
 * theme, and intent flow identically across all own-engine callers.
 *
 * Returns a `GenerationInputPackage` — the canonical fan-in artifact
 * that captures every signal used to shape generation.
 */
export async function prepareGenerationContext(
  input: OrchestrationInput,
): Promise<GenerationInputPackage> {
  const base = await resolveOrchestrationBase(input);
  const finalized = await finalizeOrchestrationPrompts(base, input);
  const pkg = buildGenerationInputPackage(base, input, finalized);
  writeOrchestrationDynamicDump(pkg);

  return pkg;
}

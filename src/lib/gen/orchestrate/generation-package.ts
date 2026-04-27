import { PROMPT_DUMP_CATEGORY, writeLatestPromptDump } from "../prompt-dump";
import {
  type GenerationInputPackage,
  computeLineageHash,
  serializePackageForDump,
} from "../generation-input-package";

interface OrchestrationBaseLike {
  resolvedScaffold: GenerationInputPackage["resolvedScaffold"];
  scaffoldSelection?: GenerationInputPackage["scaffoldSelection"];
  orchestrationContract: GenerationInputPackage["orchestrationContract"];
  scaffoldContext: GenerationInputPackage["scaffoldContext"];
  capabilityHints: GenerationInputPackage["capabilityHints"];
  routePlan: GenerationInputPackage["routePlan"];
  preGenerationContracts: GenerationInputPackage["preGenerationContracts"];
  capabilities: GenerationInputPackage["capabilities"];
  buildSpec: GenerationInputPackage["buildSpec"];
  serializeMode: GenerationInputPackage["serializeMode"];
  componentReferences: GenerationInputPackage["componentReferences"];
  dossierSelection?: GenerationInputPackage["dossierSelection"];
  requestedCapabilityTiers?: GenerationInputPackage["requestedCapabilityTiers"];
  scaffoldVariantId: GenerationInputPackage["scaffoldVariantId"];
  capabilityModifyHint: GenerationInputPackage["capabilityModifyHint"];
}

interface OrchestrationInputLike {
  prompt: string;
  rawPrompt?: string;
  brief?: Record<string, unknown> | null;
  scaffoldMode?: "auto" | "manual" | "off";
  customInstructions?: string;
  themeColors?: unknown;
  componentPalette?: unknown;
  designReferences?: unknown;
}

interface FinalizedOrchestrationContextLike {
  engineSystemPrompt: string;
  dynamicContext: string;
  dynamicContextPruning: GenerationInputPackage["dynamicContextPruning"];
  dynamicContextBlocks: GenerationInputPackage["dynamicContextBlocks"];
  variantId: string | null;
}

export function buildGenerationInputPackage(
  base: OrchestrationBaseLike,
  input: OrchestrationInputLike,
  finalized: FinalizedOrchestrationContextLike,
): GenerationInputPackage {
  const lineageHash = computeLineageHash({
    userPrompt: input.prompt,
    brief: input.brief,
    scaffoldMode: input.scaffoldMode ?? "auto",
    scaffoldContext: base.scaffoldContext,
    routePlan: base.routePlan,
    preGenerationContracts: base.preGenerationContracts,
    buildSpec: base.buildSpec,
    capabilityHints: base.capabilityHints,
    customInstructions: input.customInstructions ?? null,
    themeColors: input.themeColors ?? null,
    componentPalette: input.componentPalette ?? null,
    designReferences: input.designReferences ?? null,
    variantId: finalized.variantId,
  });

  return {
    ...base,
    userPrompt: input.prompt,
    rawPrompt: input.rawPrompt ?? input.prompt,
    brief: (input.brief as Record<string, unknown>) ?? null,
    scaffoldMode: input.scaffoldMode ?? "auto",
    engineSystemPrompt: finalized.engineSystemPrompt,
    dynamicContext: finalized.dynamicContext,
    dynamicContextPruning: finalized.dynamicContextPruning,
    dynamicContextBlocks: finalized.dynamicContextBlocks,
    variantId: finalized.variantId,
    lineageHash,
  };
}

export function writeOrchestrationDynamicDump(pkg: GenerationInputPackage): void {
  writeLatestPromptDump(
    PROMPT_DUMP_CATEGORY.orchestrationDynamic,
    {
      "latest.md": pkg.dynamicContext,
      "generation-input-package.json": JSON.stringify(
        serializePackageForDump(pkg),
        null,
        2,
      ),
    },
    {
      lineageHash: pkg.lineageHash,
      buildIntent: pkg.buildSpec.buildIntent,
      scaffoldId: pkg.resolvedScaffold?.id ?? null,
      buildSpecChangeScope: pkg.buildSpec.changeScope,
      buildSpecContextPolicy: pkg.buildSpec.contextPolicy,
      buildSpecPreviewPolicy: pkg.buildSpec.previewPolicy,
      promptLength: pkg.userPrompt.length,
      dynamicContextBudgetTokens: pkg.dynamicContextPruning.budgetTokens,
      dynamicContextUsedTokens: pkg.dynamicContextPruning.usedTokens,
      dynamicContextDroppedBlocks: pkg.dynamicContextPruning.droppedBlockKeys,
      variantId: pkg.variantId ?? null,
    },
  );
}

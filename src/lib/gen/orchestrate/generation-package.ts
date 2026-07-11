import { PROMPT_DUMP_CATEGORY, isPromptDumpEnabled, writeLatestPromptDump } from "../prompt-dump";
import {
  type GenerationInputPackage,
  buildGenerationPromptSize,
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
  effectiveBrief?: Record<string, unknown> | null;
  buildSpec: GenerationInputPackage["buildSpec"];
  serializeMode: GenerationInputPackage["serializeMode"];
  uiRecipes: GenerationInputPackage["uiRecipes"];
  dossierRequestedCapabilities: GenerationInputPackage["dossierRequestedCapabilities"];
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
  const effectiveBrief = base.effectiveBrief ?? input.brief ?? null;
  const lineageHash = computeLineageHash({
    userPrompt: input.prompt,
    brief: effectiveBrief,
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

  const promptSize = buildGenerationPromptSize({
    engineSystemPrompt: finalized.engineSystemPrompt,
    dynamicContext: finalized.dynamicContext,
    dynamicContextPruning: finalized.dynamicContextPruning,
    dynamicContextBlocks: finalized.dynamicContextBlocks,
  });

  return {
    ...base,
    userPrompt: input.prompt,
    rawPrompt: input.rawPrompt ?? input.prompt,
    brief: effectiveBrief,
    scaffoldMode: input.scaffoldMode ?? "auto",
    engineSystemPrompt: finalized.engineSystemPrompt,
    dynamicContext: finalized.dynamicContext,
    dynamicContextPruning: finalized.dynamicContextPruning,
    dynamicContextBlocks: finalized.dynamicContextBlocks,
    promptSize,
    variantId: finalized.variantId,
    lineageHash,
  };
}

export function writeOrchestrationDynamicDump(pkg: GenerationInputPackage): void {
  // `latest.md` is an existing string (cheap reference). The full-package JSON
  // is a large pretty-printed serialization that writeLatestPromptDump only
  // persists when dumping is enabled; building it unconditionally allocated a
  // multi-MB string that prod discards, contributing to heap-OOM on large
  // builds. Build it only when it will actually be written (same predicate the
  // writer uses to decide whether files are written: isPromptDumpEnabled()).
  const files: Record<string, string> = { "latest.md": pkg.dynamicContext };
  if (isPromptDumpEnabled()) {
    files["generation-input-package.json"] = JSON.stringify(
      serializePackageForDump(pkg),
      null,
      2,
    );
  }
  writeLatestPromptDump(
    PROMPT_DUMP_CATEGORY.orchestrationDynamic,
    files,
    {
      lineageHash: pkg.lineageHash,
      buildIntent: pkg.buildSpec.buildIntent,
      scaffoldId: pkg.resolvedScaffold?.id ?? null,
      buildSpecChangeScope: pkg.buildSpec.changeScope,
      buildSpecContextPolicy: pkg.buildSpec.contextPolicy,
      buildSpecPreviewPolicy: pkg.buildSpec.previewPolicy,
      promptLength: pkg.userPrompt.length,
      engineSystemPromptLength: pkg.promptSize.total.chars,
      engineSystemPromptEstimatedTokens: pkg.promptSize.total.estimatedTokens,
      staticCoreLength: pkg.promptSize.staticCore.chars,
      staticCoreEstimatedTokens: pkg.promptSize.staticCore.estimatedTokens,
      dynamicContextLength: pkg.promptSize.dynamicContext.chars,
      dynamicContextEstimatedTokens: pkg.promptSize.dynamicContext.estimatedTokens,
      dynamicContextBudgetTokens: pkg.dynamicContextPruning.budgetTokens,
      dynamicContextUsedTokens: pkg.dynamicContextPruning.usedTokens,
      dynamicContextDroppedBlocks: pkg.dynamicContextPruning.droppedBlockKeys,
      dynamicContextLargestBlocks: pkg.promptSize.blocks.largest,
      variantId: pkg.variantId ?? null,
    },
  );
}

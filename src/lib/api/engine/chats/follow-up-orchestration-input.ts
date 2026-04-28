import type { BuildIntent } from "@/lib/builder/build-intent";
import type { FollowUpCapabilityDetection } from "@/lib/builder/follow-up-capability-detection";
import { inferCapabilities } from "@/lib/gen/capability-inference";
import { buildFollowUpBriefFromSnapshot } from "@/lib/gen/orchestration-snapshot";
import type { OrchestrationInput } from "@/lib/gen/orchestrate";

import type { ParsedChatRequestMeta } from "./parse-chat-request-meta";

export type FollowUpOrchestrationInputMode = "plan" | "codegen";

export interface BuildFollowUpOrchestrationInputParams {
  mode: FollowUpOrchestrationInputMode;
  optimizedMessage: string;
  message: string;
  buildIntent: BuildIntent;
  parsedMeta: Pick<
    ParsedChatRequestMeta,
    | "brief"
    | "themeColors"
    | "palette"
    | "designThemePreset"
    | "scaffoldMode"
    | "scaffoldId"
    | "lifecycleStage"
  >;
  resolvedImageGenerations: boolean;
  designReferences: OrchestrationInput["designReferences"];
  persistedScaffoldId: string | null;
  previousFilesCount: number;
  hasFollowUpBase: boolean;
  ignorePersistedScaffoldForMatch: boolean;
  promptStrategyMeta: OrchestrationInput["promptStrategyMeta"];
  existingRoutePaths: string[];
  existingShellRoutePaths: string[];
  followUpCapabilityDetection: FollowUpCapabilityDetection;
  followUpIntent: OrchestrationInput["followUpIntent"] | null;
  orchestrationSnapshot: Record<string, unknown> | null;
  engineModelId: string;
  persistedVariantId?: string | null;
  contractAnswers?: OrchestrationInput["contractAnswers"];
  customInstructions?: string;
  chatId?: string;
  priorQualityTarget?: OrchestrationInput["priorQualityTarget"];
  requestKind?: OrchestrationInput["requestKind"];
}

export function buildFollowUpOrchestrationInput(
  params: BuildFollowUpOrchestrationInputParams,
): OrchestrationInput {
  const detectedDossierCapabilities =
    params.hasFollowUpBase &&
    params.followUpCapabilityDetection.capabilityIds.length > 0 &&
    params.followUpIntent !== "capability-modify";
  const capabilityModifyHint =
    params.hasFollowUpBase &&
    params.followUpIntent === "capability-modify" &&
    params.followUpCapabilityDetection.capabilityIds.length > 0
      ? {
          capabilityIds: params.followUpCapabilityDetection.capabilityIds,
          references: params.followUpCapabilityDetection.modifyReferenceMatches,
        }
      : null;

  const commonInput: OrchestrationInput = {
    prompt: params.optimizedMessage,
    rawPrompt: params.message,
    routePlanPrompt: params.message,
    buildSpecPrompt: params.message,
    contractsPrompt: params.message,
    capabilitiesPrompt: params.message,
    scaffoldMatchPrompt: params.message,
    buildIntent: params.buildIntent,
    scaffoldMode: params.parsedMeta.scaffoldMode,
    scaffoldId: params.parsedMeta.scaffoldId,
    brief:
      params.parsedMeta.brief ??
      buildFollowUpBriefFromSnapshot(params.orchestrationSnapshot),
    themeColors: params.parsedMeta.themeColors,
    imageGenerations: params.resolvedImageGenerations,
    componentPalette: params.parsedMeta.palette,
    designThemePreset: params.parsedMeta.designThemePreset,
    designReferences: params.designReferences,
    persistedScaffoldId: params.persistedScaffoldId,
    previousFilesCount: params.previousFilesCount,
    generationMode: params.hasFollowUpBase ? "followUp" : undefined,
    isFirstCodeGeneration:
      !params.hasFollowUpBase && Boolean(params.persistedScaffoldId),
    ignorePersistedScaffoldForMatch: params.ignorePersistedScaffoldForMatch,
    promptStrategyMeta: params.promptStrategyMeta,
    existingRoutePaths: params.existingRoutePaths,
    existingShellRoutePaths: params.existingShellRoutePaths,
    capabilities: params.hasFollowUpBase ? inferCapabilities(params.message) : undefined,
    requestedDossierCapabilities: detectedDossierCapabilities
      ? params.followUpCapabilityDetection.capabilityIds
      : undefined,
    requestedCapabilityTiers: detectedDossierCapabilities
      ? params.followUpCapabilityDetection.tierByCapability
      : undefined,
    capabilityModifyHint,
    engineModelId: params.engineModelId,
    lifecycleStage: params.parsedMeta.lifecycleStage,
  };

  if (params.mode === "plan") {
    return commonInput;
  }

  return {
    ...commonInput,
    persistedVariantId: params.persistedVariantId,
    contractAnswers: params.contractAnswers,
    customInstructions: params.customInstructions,
    chatId: params.chatId,
    followUpIntent: params.hasFollowUpBase ? params.followUpIntent ?? undefined : undefined,
    priorQualityTarget: params.priorQualityTarget,
    requestKind: params.requestKind ?? null,
  };
}

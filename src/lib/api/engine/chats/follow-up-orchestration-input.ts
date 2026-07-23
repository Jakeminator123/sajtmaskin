import type { BuildIntent } from "@/lib/builder/build-intent";
import type { FollowUpCapabilityDetection } from "@/lib/builder/follow-up-capability-detection";
import { inferCapabilities } from "@/lib/gen/capability-inference";
import {
  buildFollowUpBriefFromSnapshot,
  buildFollowUpContract,
} from "@/lib/gen/orchestration-snapshot";
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
  /**
   * All previous-version file paths. Forwarded as-is to orchestrate so the
   * dossier renderer can skip verbatim blocks for files that already exist
   * in `## Current Project Files`. Defaults to `[]` for plan mode / callers
   * that don't carry the full file list.
   */
  previousFilePaths?: string[];
  followUpCapabilityDetection: FollowUpCapabilityDetection;
  followUpIntent: OrchestrationInput["followUpIntent"] | null;
  /**
   * P2 F3-loop (åtgärd 2): dossier capability ids derived from an APPROVED
   * F3 integration proposal (provider → capability via
   * `mapProviderKeysToDossierCapabilities`). Merged into
   * `requestedDossierCapabilities` unconditionally — the approval reply
   * text ("Godkänn förslag") carries no capability keywords, so without
   * this the build round would run without the hard-dossier templates.
   */
  additionalDossierCapabilities?: string[];
  /**
   * Provider keys from the same APPROVED F3 proposal (e.g. `["mongodb"]`).
   * Forwarded as `dossierProviderHints` so sibling selection under a shared
   * capability keeps the approved provider — the approval reply text alone
   * would fall back to the capability default (Codex P1 on PR #445).
   */
  approvedProviders?: string[] | null;
  orchestrationSnapshot: Record<string, unknown> | null;
  engineModelId: string;
  persistedVariantId?: string | null;
  contractAnswers?: OrchestrationInput["contractAnswers"];
  customInstructions?: string;
  chatId?: string;
  priorQualityTarget?: OrchestrationInput["priorQualityTarget"];
  requestKind?: OrchestrationInput["requestKind"];
  /**
   * Env keys the project has a real stored value for (resolved by the stream
   * caller from `getStoredProjectEnvVarMap`). Forwarded to orchestrate so the
   * hard-dossier `configured` prompt signal reflects the project's env instead
   * of the platform `process.env` (fix-isconfigured).
   */
  configuredEnvKeys?: ReadonlySet<string>;
  /** File-derived parent-version F3 build plan from the readiness gate. */
  tier3BuildSpec?: OrchestrationInput["tier3BuildSpec"];
  /**
   * True when the chat started from a verbatim repo import (v0-template /
   * ZIP) — `edit_kind="imported_repo"` in the chat's version history. Forces
   * `scaffoldMode: "off"` (no scaffold auto-match onto an arbitrary repo) and
   * threads `importedRepoMode` to orchestrate/system-prompt so the LLM edits
   * the repo on its own terms instead of assuming the scaffold stack.
   */
  importedRepoMode?: boolean;
}

function buildClearRedesignBriefFallbackFromSnapshot(
  snapshot: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const snapshotBrief = buildFollowUpBriefFromSnapshot(snapshot);
  if (!snapshotBrief) return null;

  const fallback: Record<string, unknown> = {};
  const requestedCapabilities = snapshotBrief.requestedCapabilities;
  if (Array.isArray(requestedCapabilities) && requestedCapabilities.length > 0) {
    fallback.requestedCapabilities = requestedCapabilities;
  }
  if (typeof snapshotBrief.domainProfile === "string") {
    fallback.domainProfile = snapshotBrief.domainProfile;
  }
  if (typeof snapshotBrief.projectTitle === "string") {
    fallback.projectTitle = snapshotBrief.projectTitle;
  }
  if (typeof snapshotBrief.brandName === "string") {
    fallback.brandName = snapshotBrief.brandName;
  }

  return Object.keys(fallback).length > 0 ? fallback : null;
}

function resolveFollowUpActiveBrief(
  params: BuildFollowUpOrchestrationInputParams,
): Record<string, unknown> | null {
  if (params.parsedMeta.brief) {
    return params.parsedMeta.brief;
  }
  if (params.hasFollowUpBase && params.followUpIntent === "clear-redesign") {
    return buildClearRedesignBriefFallbackFromSnapshot(params.orchestrationSnapshot);
  }
  return buildFollowUpBriefFromSnapshot(params.orchestrationSnapshot);
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

  const importedRepoMode = params.importedRepoMode === true;

  const commonInput: OrchestrationInput = {
    prompt: params.optimizedMessage,
    rawPrompt: params.message,
    routePlanPrompt: params.message,
    buildSpecPrompt: params.message,
    contractsPrompt: params.message,
    capabilitiesPrompt: params.message,
    scaffoldMatchPrompt: params.message,
    buildIntent: params.buildIntent,
    // Imported repos never get a scaffold matched/pinned onto them — the
    // repo is the project. resolve-base additionally neutralizes any
    // persisted scaffold id when `importedRepoMode` is set.
    scaffoldMode: importedRepoMode ? "off" : params.parsedMeta.scaffoldMode,
    scaffoldId: importedRepoMode ? null : params.parsedMeta.scaffoldId,
    importedRepoMode,
    brief: resolveFollowUpActiveBrief(params),
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
    previousFilePaths: params.previousFilePaths ?? [],
    capabilities: params.hasFollowUpBase ? inferCapabilities(params.message) : undefined,
    requestedDossierCapabilities: (() => {
      const merged = Array.from(
        new Set([
          ...(detectedDossierCapabilities
            ? params.followUpCapabilityDetection.capabilityIds
            : []),
          ...(params.additionalDossierCapabilities ?? []),
        ]),
      );
      return merged.length > 0 ? merged : undefined;
    })(),
    dossierProviderHints:
      params.approvedProviders && params.approvedProviders.length > 0
        ? params.approvedProviders
        : undefined,
    requestedCapabilityTiers: detectedDossierCapabilities
      ? params.followUpCapabilityDetection.tierByCapability
      : undefined,
    capabilityModifyHint,
    engineModelId: params.engineModelId,
    lifecycleStage: params.parsedMeta.lifecycleStage,
    tier3BuildSpec: params.tier3BuildSpec,
    configuredEnvKeys: params.configuredEnvKeys,
    // 5-1: consolidate the scattered inherited/frozen follow-up signals into
    // one readable object. Additive — does not change how the fields above
    // are read by orchestrate (parity preserved).
    followUpContract: buildFollowUpContract({
      snapshot: params.orchestrationSnapshot,
      persistedScaffoldId: params.persistedScaffoldId,
      persistedVariantId: params.persistedVariantId,
      existingRoutePaths: params.existingRoutePaths,
      existingShellRoutePaths: params.existingShellRoutePaths,
      priorQualityTarget: params.priorQualityTarget,
    }),
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

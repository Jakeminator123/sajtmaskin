/**
 * System prompt builder for sajtmaskin's own code generation engine.
 *
 * Architecture (post 2026-04-18 directive-cascade removal):
 *  ┌─────────────────────────────────────────────────┐
 *  │  Static Core — config/codegen-core-manifest.json +             │
 *  │    config/prompt-core/*.md (immutable product rules,           │
 *  │    incl. visual-design + coding-direction)                     │
 *  │  (~8–10K tokens, mtime-cached per process)       │
 *  ├─────────────────────────────────────────────────┤
 *  │  Dynamic context  (varies per request)           │
 *  │  → Build intent, scaffold variant, brief, route, │
 *  │    contracts, dossiers, guidance                 │
 *  └─────────────────────────────────────────────────┘
 *
 * Per-request signal cascade (highest precedence first):
 *  1. EXPLICIT  — Brief/prompt provides an exact value
 *  2. INDICATED — Brief-LLM infers from context
 *  3. INFERRED  — `resolveGuidanceBlocks` (deterministic heuristics)
 *  4. STATIC    — Plain text in `config/prompt-core/*.md`
 *
 * The legacy `prompt-directives/` folder + `directive-loader.ts` were
 * removed 2026-04-18: only `visual-design` and `content-voice` were ever
 * runtime-injected, so they are now plain core fragments. The 10 unused
 * directive files were aspirational placeholders the substitution engine
 * never actually used. Brief and scaffold variant carry the per-request
 * signal those defaults pretended to switch on.
 *
 * What reaches the model (own-engine):
 *  - **Static Core** (`getStaticCoreFromWorkspace`) + `SYSTEM_PROMPT_SEPARATOR` +
 *    **dynamic context** from this file = full **system** message.
 *  - **User turn** = current request prompt; not duplicated here.
 *  - **Chat history** = prior turns, assembled by the generation pipeline.
 * Canonical map: `docs/architecture/fas2-orchestration-and-build.md`.
 *
 * Split out of the pre-OMTAG-03 monolith `system-prompt.ts` into the
 * `system-prompt/` package. Public API stays identical and is re-exported
 * from `./index.ts` (barrel). No behavior change.
 */

import { debugLog } from "@/lib/utils/debug";
import { pickScaffoldVariant } from "../scaffold-variants";
import { BUILD_INTENT_GUIDANCE } from "../intent-guidance";
import {
  buildBudgetedSystemPrompt,
  type PromptBudgetBlock,
} from "../tokens";
import { splitContextIntoBudgetBlocks, DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS } from "./budget";
import type {
  BuildDynamicContextResult,
  DynamicContextOptions,
} from "./types";
import {
  renderBuildIntentBlock,
  renderCustomInstructionsBlock,
  renderF2ContractBlock,
  renderGenerationModeBlock,
  renderGenerationProfileBlock,
} from "./sections/intro";
import {
  renderDesignPriorityBlock,
  renderScaffoldVariantBlock,
} from "./sections/scaffold-variant";
import {
  renderScaffoldContextBlock,
  renderScaffoldResearchBlock,
  renderToolkitBlock,
} from "./sections/scaffold-and-toolkit";
import {
  renderCapabilityModifyHintBlock,
  renderDossierBlocks,
} from "./sections/dossiers";
import { renderRoutePlanBlock } from "./sections/route-plan";
import {
  renderPreGenerationContractsBlock,
  renderTier3IntegrationBlock,
} from "./sections/contracts";
import { renderBriefBlocks } from "./sections/brief";
import {
  renderDesignReferencesBlock,
  renderGuidanceBlocks,
  renderVisualIdentityBlock,
} from "./sections/visual-and-guidance";
import {
  renderComponentReferencesBlock,
  renderImageryBlock,
  renderMediaCatalogBlock,
  renderSeoBlock,
} from "./sections/imagery-media-seo";
import { renderRequiredImportsChecklistBlock } from "./sections/required-imports-checklist";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}

/**
 * Builds the dynamic (per-request) portion of the system prompt.
 * Contains build intent guidance, project context, visual identity, and media catalog.
 */
export function buildDynamicContext(
  options: DynamicContextOptions,
): BuildDynamicContextResult {
  const {
    intent,
    brief,
    themeOverride,
    imageGenerations: _imageGenerations = false,
    mediaCatalog,
    scaffoldContext,
    capabilityHints,
    resolvedScaffold,
    resolvedVariant,
    routePlan,
    preGenerationContracts,
    componentPalette,
    designThemePreset,
    designReferences,
    customInstructions,
    userPrompt,
    generationMode,
    buildSpec,
    sessionSeed,
    chatId,
    componentReferences,
  } = options;

  const isFollowUp = generationMode === "followUp";
  const styleKeywords = strList(brief?.visualDirection?.styleKeywords);
  const toneKeywords = strList(brief?.toneAndVoice);

  // Variant resolution: production callers (orchestrate) always pass
  // `resolvedVariant`. The fallback below exists for legacy callers
  // (`buildSystemPrompt` from eval/runner). Keep its inputs aligned with
  // `orchestrate.resolveScaffoldVariant` so the fallback picks the same
  // variant as orchestrate would — otherwise `variantId` logged downstream
  // can drift from what shaped the prompt. Prefer the raw user prompt
  // (canonical orchestrate input); fall back to brief-derived text only
  // when no userPrompt is available.
  const fallbackVariantPrompt =
    str(userPrompt) ||
    [
      str(brief?.oneSentencePitch),
      str(brief?.tagline),
      strList(brief?.mustHave).join(" "),
      toneKeywords.join(" "),
      styleKeywords.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    BUILD_INTENT_GUIDANCE[intent].rules.join(" ");
  // resolvedVariant is the embedding-driven pick from resolveOrchestrationBase
  // (orchestrate.ts → pickScaffoldVariantAsync). The keyword fallback below
  // only runs when buildDynamicContext is called outside the standard
  // orchestrate flow (e.g. legacy tests, snapshot rendering) — keeping it
  // sync avoids forcing this whole function async.
  const effectiveVariant =
    resolvedVariant ??
    pickScaffoldVariant({
      prompt: fallbackVariantPrompt,
      scaffoldId: resolvedScaffold?.id ?? buildSpec?.scaffoldId ?? null,
      styleKeywords,
      toneKeywords,
      generationMode,
      sessionSeed,
    });

  const parts: string[] = [];
  parts.push(...renderGenerationModeBlock(isFollowUp));
  parts.push(...renderCustomInstructionsBlock(customInstructions));
  parts.push(...renderF2ContractBlock(buildSpec));
  parts.push(...renderBuildIntentBlock(intent));
  parts.push(...renderGenerationProfileBlock(buildSpec));
  parts.push(...renderScaffoldVariantBlock(effectiveVariant));
  parts.push(...renderDesignPriorityBlock());

  // ── Import Rules & Known Pitfalls live in config/prompt-core/01-behavioral-contract.md
  // (static core, cached per process — no longer eats dynamic context token budget)

  parts.push(...renderScaffoldContextBlock(scaffoldContext));
  parts.push(...renderScaffoldResearchBlock(resolvedScaffold));
  parts.push(
    ...renderToolkitBlock({
      resolvedScaffold,
      capabilityHints,
      componentPalette,
    }),
  );
  parts.push(...renderDossierBlocks(options.dossierSelection));
  // Plan 11 / open-question #12: when the follow-up was classified as
  // `capability-modify` the dossier branch above is intentionally
  // empty (upstream suppresses `requestedDossierCapabilities`). Restore
  // a directional signal to the LLM so it knows to mutate the existing
  // scene file rather than fall back to a generic dossier-less render.
  parts.push(...renderCapabilityModifyHintBlock(options.capabilityModifyHint));
  parts.push(
    ...renderRoutePlanBlock({
      routePlan,
      buildSpec,
      isFollowUp,
      chatId,
      userPrompt,
      resolvedScaffold,
    }),
  );
  // E4 (OMTAG fas 2·C) — deterministic shadcn imports checklist. Placed
  // right after the route plan so the LLM has scaffold + route context
  // in mind when it reads which components are about to be in play.
  // Stops `autofix.heavy_load` from being triggered by forgotten imports
  // of components the model demonstrably knows how to use.
  parts.push(
    ...renderRequiredImportsChecklistBlock({
      routePlan,
      capabilityHints,
    }),
  );
  parts.push(...renderTier3IntegrationBlock({ buildSpec, preGenerationContracts }));
  parts.push(...renderPreGenerationContractsBlock(preGenerationContracts));
  parts.push(...renderBriefBlocks(brief));
  parts.push(
    ...renderVisualIdentityBlock({ themeOverride, brief, designThemePreset }),
  );
  parts.push(...renderDesignReferencesBlock(designReferences));
  parts.push(
    ...renderGuidanceBlocks({
      userPrompt,
      intent,
      brief,
      themeOverride,
      toneKeywords,
      styleKeywords,
    }),
  );
  parts.push(...renderImageryBlock({ brief, styleKeywords }));
  parts.push(...renderMediaCatalogBlock(mediaCatalog));
  parts.push(...renderComponentReferencesBlock(componentReferences));
  parts.push(...renderSeoBlock(brief));

  // User prompt text is carried by the **user** message in the chat/completions
  // request — do not duplicate it here as a second "original request" block.

  let context = parts.join("\n").trim();
  const contextBlocks = splitContextIntoBudgetBlocks(context);
  const budgetTokens = Math.max(
    900,
    buildSpec?.tokenBudgets.systemContextTokens ?? DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS,
  );
  const budgeted = buildBudgetedSystemPrompt({
    staticCore: "",
    separator: "",
    dynamicBlocks: contextBlocks as PromptBudgetBlock[],
    dynamicBudgetTokens: budgetTokens,
  });
  context = budgeted.dynamicContext;
  const keptKeys = new Set(budgeted.keptKeys);
  const blockTrace = contextBlocks.map((block) => ({
    key: block.key,
    title: block.title,
    priority: block.priority,
    required: Boolean(block.required),
    estimatedTokens: block.estimatedTokens,
    kept: keptKeys.has(block.key),
  }));

  if (budgeted.droppedKeys.length > 0) {
    try {
      debugLog("engine", "Dynamic context pruned to token budget", {
        budgetTokens,
        usedTokens: budgeted.usedTokens,
        droppedBlocks: budgeted.droppedKeys,
        keptBlocks: budgeted.keptKeys,
      });
    } catch {
      // Some isolated tests mock "@/lib/utils/debug" without debugLog.
    }
  }

  return {
    context,
    pruning: {
      budgetTokens: budgeted.budgetTokens,
      usedTokens: budgeted.usedTokens,
      droppedBlockKeys: budgeted.droppedKeys,
      keptBlockKeys: budgeted.keptKeys,
    },
    blocks: blockTrace,
    variantId: effectiveVariant?.id ?? null,
  };
}

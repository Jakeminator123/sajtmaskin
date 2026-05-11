/**
 * URL-expansion + deterministic autofix — the two pre-phases that run
 * before `runFinalizeFastPath` inside `finalizeAndSaveVersion`.
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change.
 */

import type { BuildSpec } from "@/lib/gen/build-spec";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { CanonicalModelId } from "@/lib/models/catalog";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { expandUrls } from "@/lib/gen/url-compress";
import { devLogAppend } from "@/lib/logging/devLog";
import { createFinalizeStepTelemetry } from "./step-telemetry";
import type {
  FinalizeProgressCallback,
  FinalizeStepTelemetryMap,
} from "./types";

export function runUrlExpandPhase(params: {
  accumulatedContent: string;
  urlMap: Record<string, string>;
  onProgress?: FinalizeProgressCallback;
  stepTelemetry: FinalizeStepTelemetryMap;
}): string {
  const { accumulatedContent, urlMap, onProgress, stepTelemetry } = params;
  const urlExpandStartedAt = Date.now();
  onProgress?.("url_expand", { phase: "start" });
  const expanded = expandUrls(accumulatedContent, urlMap);
  onProgress?.("url_expand", {
    phase: "done",
    durationMs: Date.now() - urlExpandStartedAt,
  });
  stepTelemetry.url_expand = createFinalizeStepTelemetry(urlExpandStartedAt, "done");
  return expanded;
}

export interface AutofixPhaseResult {
  contentForVersion: string;
  autofixSucceeded: boolean;
  autoFixFixCount: number;
  autoFixWarningCount: number;
  autoFixDependencyCount: number;
  autoFixHeavyLoad: boolean;
}

export async function runAutofixPrePhase(params: {
  runAutofix: boolean;
  contentForVersion: string;
  chatId: string;
  model: string;
  requestedCapabilities?: string[];
  buildSpec?: BuildSpec | null;
  resolvedScaffold: ScaffoldManifest | null;
  resolvedTier?: CanonicalModelId;
  /**
   * Orchestrate-resolved variant id (snapshot/meta). Forwarded to
   * `runAutoFix` so `font-import-fixer` can materialize the variant's
   * first font pair into baseline `app/layout.tsx` deterministically.
   * No-op when null/undefined.
   */
  variantId?: string | null;
  onProgress?: FinalizeProgressCallback;
  stepTelemetry: FinalizeStepTelemetryMap;
}): Promise<AutofixPhaseResult> {
  const {
    runAutofix,
    chatId,
    model,
    requestedCapabilities,
    buildSpec,
    resolvedScaffold,
    resolvedTier,
    variantId,
    onProgress,
    stepTelemetry,
  } = params;
  let contentForVersion = params.contentForVersion;
  let autoFixFixCount = 0;
  let autoFixWarningCount = 0;
  let autoFixDependencyCount = 0;
  let autoFixHeavyLoad = false;
  let autofixSucceeded = false;

  if (!runAutofix) {
    stepTelemetry.autofix = createFinalizeStepTelemetry(Date.now(), "skipped", {
      reason: "disabled",
    });
    return {
      contentForVersion,
      autofixSucceeded,
      autoFixFixCount,
      autoFixWarningCount,
      autoFixDependencyCount,
      autoFixHeavyLoad,
    };
  }

  const autoFixStartedAt = Date.now();
  onProgress?.("autofix", { phase: "start", chatId });
  try {
    const autoFixResult = await runAutoFix(contentForVersion, {
      chatId,
      model,
      requestedCapabilities,
      previewPolicy: buildSpec?.previewPolicy,
      scaffoldId: resolvedScaffold?.id ?? null,
      variantId: variantId ?? null,
    });
    contentForVersion = autoFixResult.fixedContent;
    autofixSucceeded = true;
    autoFixFixCount = autoFixResult.fixes.length;
    autoFixWarningCount = autoFixResult.warnings.length;
    autoFixDependencyCount = Object.keys(autoFixResult.dependencies).length;
    autoFixHeavyLoad = autoFixFixCount > 5;

    if (autoFixResult.fixes.length > 0 || autoFixResult.warnings.length > 0) {
      devLogAppend("in-progress", {
        type: "autofix.result",
        chatId,
        fixes: autoFixResult.fixes,
        warnings: autoFixResult.warnings.slice(0, 20),
        dependencies: autoFixResult.dependencies,
        scaffoldId: resolvedScaffold?.id ?? null,
        resolvedTier: resolvedTier ?? null,
      });
    }
    if (autoFixHeavyLoad) {
      devLogAppend("in-progress", {
        type: "autofix.heavy_load",
        chatId,
        fixCount: autoFixFixCount,
        threshold: 5,
        warning:
          "Deterministic autofix had to repair many issues. This usually indicates instability earlier in generation.",
        scaffoldId: resolvedScaffold?.id ?? null,
      });
    }
    onProgress?.("autofix", {
      phase: "done",
      durationMs: Date.now() - autoFixStartedAt,
      fixes: autoFixResult.fixes.length,
      warnings: autoFixResult.warnings.length,
    });
    stepTelemetry.autofix = createFinalizeStepTelemetry(autoFixStartedAt, "done", {
      fixCount: autoFixResult.fixes.length,
      warningCount: autoFixResult.warnings.length,
      dependencyCount: Object.keys(autoFixResult.dependencies).length,
    });
  } catch (autofixErr) {
    console.warn("[autofix] Pipeline error, using raw content:", autofixErr);
    onProgress?.("autofix", { phase: "error" });
    stepTelemetry.autofix = createFinalizeStepTelemetry(autoFixStartedAt, "error");
  }

  return {
    contentForVersion,
    autofixSucceeded,
    autoFixFixCount,
    autoFixWarningCount,
    autoFixDependencyCount,
    autoFixHeavyLoad,
  };
}

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
import type { FixEntry } from "@/lib/gen/autofix/types";
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
  autoFixOutcome: "done" | "skipped" | "error";
  autoFixFixCount: number;
  autoFixWarningCount: number;
  autoFixDependencyCount: number;
  autoFixHeavyLoad: boolean;
  autoFixFixers: AutofixFixerSummary[];
  previewBlockingWarnings: string[];
}

export interface AutofixFixerSummary {
  fixer: string;
  category: FixEntry["category"];
  lane?: string;
  count: number;
  files?: string[];
  examples?: string[];
}

const MAX_FIXER_GROUPS = 12;
const MAX_FIXER_FILES = 3;
const MAX_FIXER_EXAMPLES = 2;
const MAX_EXAMPLE_CHARS = 140;

function compactString(value: string, maxChars = MAX_EXAMPLE_CHARS): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function summarizeAutofixFixers(fixes: FixEntry[]): AutofixFixerSummary[] {
  if (fixes.length === 0) return [];
  const grouped = new Map<string, AutofixFixerSummary>();

  for (const fix of fixes) {
    const fixer = fix.fixer.trim() || "unknown-fixer";
    const category = fix.category;
    const lane = fix.lane ? String(fix.lane) : undefined;
    const key = `${fixer}\u0000${category}\u0000${lane ?? ""}`;
    const current =
      grouped.get(key) ??
      ({
        fixer,
        category,
        ...(lane ? { lane } : {}),
        count: 0,
      } satisfies AutofixFixerSummary);

    current.count += 1;

    if (fix.file && fix.file.trim()) {
      const files = current.files ?? [];
      const file = compactString(fix.file, 120);
      if (!files.includes(file) && files.length < MAX_FIXER_FILES) {
        files.push(file);
        current.files = files;
      }
    }

    if (fix.description && fix.description.trim()) {
      const examples = current.examples ?? [];
      const example = compactString(fix.description);
      if (!examples.includes(example) && examples.length < MAX_FIXER_EXAMPLES) {
        examples.push(example);
        current.examples = examples;
      }
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.count - a.count || a.fixer.localeCompare(b.fixer))
    .slice(0, MAX_FIXER_GROUPS);
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
  let autoFixOutcome: AutofixPhaseResult["autoFixOutcome"] = "skipped";
  let autoFixFixers: AutofixFixerSummary[] = [];
  let previewBlockingWarnings: string[] = [];
  let autofixSucceeded = false;

  if (!runAutofix) {
    stepTelemetry.autofix = createFinalizeStepTelemetry(Date.now(), "skipped", {
      reason: "disabled",
    });
    return {
      contentForVersion,
      autofixSucceeded,
      autoFixOutcome,
      autoFixFixCount,
      autoFixWarningCount,
      autoFixDependencyCount,
      autoFixHeavyLoad,
      autoFixFixers,
      previewBlockingWarnings,
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
    autoFixOutcome = "done";
    autoFixFixCount = autoFixResult.fixes.length;
    autoFixWarningCount = autoFixResult.warnings.length;
    autoFixDependencyCount = Object.keys(autoFixResult.dependencies).length;
    autoFixHeavyLoad = autoFixFixCount > 5;
    autoFixFixers = summarizeAutofixFixers(autoFixResult.fixes);
    previewBlockingWarnings = autoFixResult.warnings.filter((warning) =>
      warning.includes("preview-blocking:"),
    );

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
      dependencies: Object.keys(autoFixResult.dependencies).length,
      fixers: autoFixFixers,
      previewBlockingWarnings: previewBlockingWarnings.length,
      heavyLoad: autoFixHeavyLoad,
    });
    stepTelemetry.autofix = createFinalizeStepTelemetry(autoFixStartedAt, "done", {
      fixCount: autoFixResult.fixes.length,
      warningCount: autoFixResult.warnings.length,
      dependencyCount: Object.keys(autoFixResult.dependencies).length,
    });
  } catch (autofixErr) {
    console.warn("[autofix] Pipeline error, using raw content:", autofixErr);
    autoFixOutcome = "error";
    onProgress?.("autofix", { phase: "error" });
    stepTelemetry.autofix = createFinalizeStepTelemetry(autoFixStartedAt, "error");
  }

  return {
    contentForVersion,
    autofixSucceeded,
    autoFixOutcome,
    autoFixFixCount,
    autoFixWarningCount,
    autoFixDependencyCount,
    autoFixHeavyLoad,
    autoFixFixers,
    previewBlockingWarnings,
  };
}

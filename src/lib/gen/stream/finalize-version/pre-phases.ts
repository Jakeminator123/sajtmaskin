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
import { getFixerRiskById } from "@/lib/gen/autofix/fixer-registry";
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
  autoFixRisk: AutofixRiskSummary;
  autoFixFixers: AutofixFixerSummary[];
  previewBlockingWarnings: string[];
}

export interface AutofixRiskSummary {
  safeFixCount: number;
  riskyFixCount: number;
  riskyFixerIds: string[];
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
const EMPTY_AUTOFIX_RISK: AutofixRiskSummary = {
  safeFixCount: 0,
  riskyFixCount: 0,
  riskyFixerIds: [],
};

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

export function summarizeAutofixRisk(fixes: FixEntry[]): AutofixRiskSummary {
  if (fixes.length === 0) return { ...EMPTY_AUTOFIX_RISK };

  let safeFixCount = 0;
  let riskyFixCount = 0;
  const riskyFixerIds: string[] = [];
  const seenRiskyFixers = new Set<string>();

  for (const fix of fixes) {
    const fixer = fix.fixer.trim() || "unknown-fixer";
    // Fail closed: a fixer missing from the registry can mutate generated code
    // but has no audited classification, so treat it as risky.
    const risk = getFixerRiskById(fixer) ?? "risky";
    if (risk === "safe") {
      safeFixCount += 1;
      continue;
    }
    riskyFixCount += 1;
    if (!seenRiskyFixers.has(fixer)) {
      seenRiskyFixers.add(fixer);
      riskyFixerIds.push(fixer);
    }
  }

  return { safeFixCount, riskyFixCount, riskyFixerIds };
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
  let autoFixRisk: AutofixRiskSummary = { ...EMPTY_AUTOFIX_RISK };
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
      autoFixRisk,
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
    autoFixRisk = summarizeAutofixRisk(autoFixResult.fixes);
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
    if (autoFixResult.fixes.length > 0) {
      devLogAppend("in-progress", {
        type: "autofix.risk",
        chatId,
        safeFixCount: autoFixRisk.safeFixCount,
        riskyFixCount: autoFixRisk.riskyFixCount,
        riskyFixerIds: autoFixRisk.riskyFixerIds,
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
      safeFixCount: autoFixRisk.safeFixCount,
      riskyFixCount: autoFixRisk.riskyFixCount,
      riskyFixerIds: autoFixRisk.riskyFixerIds,
    });
    stepTelemetry.autofix = createFinalizeStepTelemetry(autoFixStartedAt, "done", {
      fixCount: autoFixResult.fixes.length,
      warningCount: autoFixResult.warnings.length,
      dependencyCount: Object.keys(autoFixResult.dependencies).length,
      ...autoFixRisk,
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
    autoFixRisk,
    autoFixFixers,
    previewBlockingWarnings,
  };
}

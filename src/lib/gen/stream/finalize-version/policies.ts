/**
 * Pure policy helpers for `finalizeAndSaveVersion`:
 * - image materialization cap per BuildSpec
 * - verifier pass gate (deep-path + BuildSpec signals)
 * - follow-up imagery-intent detection
 * - finalize fast/deep-path decision
 *
 * Extracted from `src/lib/gen/stream/finalize-version.ts` 2026-04-21.
 */

import type { BuildSpec } from "../../build-spec";
import { isVerifierPassEnabled } from "../../verify/verifier-pass";

export interface FinalizePathPolicy {
  runDeepPath: boolean;
  reason:
    | "default"
    | "fast_path_disabled_by_flag"
    | "repair_pass"
    | "light_followup_fast_policy";
}

export function resolveImageMaterializationLimit(
  buildSpec?: BuildSpec | null,
): number {
  if (!buildSpec) return 6;
  if (
    buildSpec.previewPolicy === "fidelity3" ||
    buildSpec.qualityTarget === "release-candidate"
  ) {
    return 8;
  }
  if (
    buildSpec.qualityTarget !== "standard" ||
    buildSpec.buildIntent === "app" ||
    buildSpec.contextPolicy === "heavy" ||
    buildSpec.changeScope === "integration"
  ) {
    return 7;
  }
  return 6;
}

export function resolveVerifierPassPolicy(params: {
  buildSpec?: BuildSpec | null;
  finalizePath: FinalizePathPolicy;
  repairPassIndex: number;
}): { run: boolean; reason: string } {
  const { buildSpec, finalizePath, repairPassIndex } = params;

  if (!finalizePath.runDeepPath) {
    return { run: false, reason: finalizePath.reason };
  }
  if (repairPassIndex > 0) {
    return { run: false, reason: "repair_pass" };
  }
  if (!isVerifierPassEnabled()) {
    return { run: false, reason: "disabled" };
  }
  if (!buildSpec) {
    return { run: true, reason: "missing_build_spec" };
  }
  if (buildSpec.verificationPolicy === "strict") {
    return { run: true, reason: "strict_policy" };
  }
  if (buildSpec.qualityTarget !== "standard") {
    return { run: true, reason: "high_quality_target" };
  }
  if (buildSpec.buildIntent === "app") {
    return { run: true, reason: "app_intent" };
  }
  if (buildSpec.contextPolicy === "heavy") {
    return { run: true, reason: "heavy_context" };
  }
  if (
    buildSpec.changeScope === "integration" ||
    buildSpec.changeScope === "page-addition"
  ) {
    return { run: true, reason: "high_risk_change_scope" };
  }
  if (
    buildSpec.generationMode === "followUp" &&
    buildSpec.changeScope === "redesign"
  ) {
    return { run: true, reason: "followup_redesign" };
  }
  return { run: false, reason: "no_verifier_signal" };
}

const IMAGERY_PROMPT_PATTERN =
  /\b(bild|bilder|bildspel|foto|foton|hero|galleri|gallery|image|images|photo|photos|carousel|slideshow|illustration|illustrations|illustrat|porträtt|portrait|video|film|media|spela|player|uppspelning|poster|thumbnail|embed|iframe)\b/i;

const IMAGERY_PLACEHOLDER_PATTERN =
  /\/placeholder\.svg|UNSPLASH_PLACEHOLDER|via\.placeholder\.com|placehold\.co/i;

export function followUpRequestsImagery(params: {
  originalPrompt?: string;
  accumulatedContent?: string;
}): boolean {
  if (params.originalPrompt && IMAGERY_PROMPT_PATTERN.test(params.originalPrompt)) {
    return true;
  }
  if (
    params.accumulatedContent &&
    IMAGERY_PLACEHOLDER_PATTERN.test(params.accumulatedContent)
  ) {
    return true;
  }
  return false;
}

export function resolveFinalizePathPolicy(params: {
  buildSpec?: BuildSpec | null;
  repairPassIndex: number;
  originalPrompt?: string;
  accumulatedContent?: string;
}): FinalizePathPolicy {
  const { buildSpec, repairPassIndex, originalPrompt, accumulatedContent } = params;
  // Historical `FEATURES.useFinalizeDeepPath` flag was always on (opt-in
  // fast path); kept the light-path shortcut as the default.
  if (repairPassIndex > 0) {
    return { runDeepPath: true, reason: "repair_pass" };
  }
  const isLightFollowUp =
    buildSpec?.generationMode === "followUp" &&
    buildSpec?.verificationPolicy === "fast" &&
    buildSpec?.contextPolicy === "light" &&
    (buildSpec?.changeScope === "copy" || buildSpec?.changeScope === "local-layout");
  if (isLightFollowUp) {
    // Light path skips `materialize_images`. If the user explicitly asked for
    // imagery (or the model emitted placeholders), force the deep path so
    // Unsplash materialization actually runs — otherwise the preview ships
    // with `/placeholder.svg` instead of the requested photo.
    if (followUpRequestsImagery({ originalPrompt, accumulatedContent })) {
      return { runDeepPath: true, reason: "default" };
    }
    return { runDeepPath: false, reason: "light_followup_fast_policy" };
  }
  return { runDeepPath: true, reason: "default" };
}

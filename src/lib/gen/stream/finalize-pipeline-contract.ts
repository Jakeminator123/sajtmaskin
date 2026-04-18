/**
 * Canonical ordering of own-engine work after the main codegen stream finishes.
 * Step 0 is always `streamText` (+ tools) in `src/lib/gen/engine.ts`; these are
 * deterministic / secondary-LLM passes that run inside `finalizeAndSaveVersion`.
 *
 * Keep this list in sync with `finalize-version.ts` — it is used for typing,
 * tests, and UI/telemetry. SSE `progress.step` for these phases MUST use `id`
 * (not legacy aliases like `validation` / `finalizing`).
 */
export const OWN_ENGINE_POST_STREAM_PIPELINE = [
  {
    id: "autofix",
    label: "Deterministic autofix (imports, structure)",
    labelSv: "Autofix",
  },
  {
    id: "url_expand",
    label: "URL decompression",
    labelSv: "URL-expansion",
  },
  {
    id: "validate_syntax",
    label: "Syntax validation + targeted fix rounds",
    labelSv: "Syntaxvalidering",
  },
  {
    id: "pre_vm_typecheck",
    label: "Pre-VM TypeScript typecheck against warm scaffold cache",
    labelSv: "Pre-VM typecheck",
  },
  {
    id: "materialize_images",
    label: "Placeholder image materialization",
    labelSv: "Bildmaterialisering",
  },
  {
    id: "verifier",
    label: "Read-only verifier LLM (blocking/quality findings, telemetry)",
    labelSv: "Verifiering",
  },
  {
    id: "parse_merge_preflight",
    label: "Parse, merge, preflight, persist",
    labelSv: "Parsning, merge och förkontroll",
  },
] as const;

export type OwnEnginePostStreamPhaseId = (typeof OWN_ENGINE_POST_STREAM_PIPELINE)[number]["id"];

/**
 * Phases that always run in the light finalize path (`runDeepPath === false`).
 * `verifier` is intentionally excluded because it is gated by deep-path policy
 * in `resolveVerifierPassPolicy()` inside `finalize-version.ts`.
 */
export const OWN_ENGINE_FINALIZE_FAST_ONLY_PHASES: OwnEnginePostStreamPhaseId[] = [
  "autofix",
  "url_expand",
  "validate_syntax",
  "pre_vm_typecheck",
  "parse_merge_preflight",
];

/**
 * Phases that are only considered when deep path is active.
 * `materialize_images` runs on deep path; `verifier` is deep-path gated and can
 * still be skipped by additional policy checks.
 */
export const OWN_ENGINE_FINALIZE_DEEP_PATH_PHASES: OwnEnginePostStreamPhaseId[] = [
  "materialize_images",
  "verifier",
];

const POST_STREAM_PHASE_ID_SET = new Set<string>(
  OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id),
);

export function isOwnEnginePostStreamPhaseId(
  value: string,
): value is OwnEnginePostStreamPhaseId {
  return POST_STREAM_PHASE_ID_SET.has(value);
}

export function ownEnginePostStreamStepLabelSv(step: OwnEnginePostStreamPhaseId): string {
  for (const row of OWN_ENGINE_POST_STREAM_PIPELINE) {
    if (row.id === step) return row.labelSv;
  }
  return step;
}

/**
 * Canonical ordering of own-engine work after the main codegen stream finishes.
 * Step 0 is always `streamText` (+ tools) in `src/lib/gen/engine.ts`; these are
 * deterministic / secondary-LLM passes that run inside `finalizeAndSaveVersion`.
 *
 * Keep this list in sync with `finalize-version.ts` — it is used for typing,
 * tests, and future UI/telemetry labels.
 */
export const OWN_ENGINE_POST_STREAM_PIPELINE = [
  { id: "autofix", label: "Deterministic autofix (imports, structure)" },
  { id: "url_expand", label: "URL decompression" },
  { id: "materialize_images", label: "Placeholder image materialization" },
  { id: "polish", label: "Optional polish LLM (copy / placeholders)" },
  { id: "validate_syntax", label: "Syntax validation + targeted fix rounds" },
  { id: "parse_merge_preflight", label: "Parse, merge, preflight, persist" },
] as const;

export type OwnEnginePostStreamPhaseId = (typeof OWN_ENGINE_POST_STREAM_PIPELINE)[number]["id"];

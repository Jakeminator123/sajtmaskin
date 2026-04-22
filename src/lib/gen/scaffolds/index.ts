/**
 * Public barrel for the scaffold system.
 *
 * Only symbols used from outside `src/lib/gen/scaffolds/` are exposed here.
 * Registry helpers like `getAllScaffolds`/`getScaffoldIds` are consumed via
 * direct imports from `./registry` by the few internal callers that need
 * them; keeping them out of this barrel prevents accidental public uptake.
 */

export type {
  ScaffoldComplexity,
  ScaffoldFile,
  ScaffoldId,
  ScaffoldManifest,
  ScaffoldMode,
  ScaffoldSiteKind,
} from "./types";
export { getScaffoldById, getScaffoldIds } from "./registry";
export { matchScaffold, matchScaffoldAuto } from "./matcher";
export type {
  ScaffoldSelectionConfidence,
  ScaffoldQueryContext,
  ScaffoldSelectionMeta,
  ScaffoldSelectionMethod,
  ScaffoldSelectionResult,
} from "./matcher";
export { serializeScaffoldForPrompt } from "./serialize";
export type { ScaffoldSerializeMode } from "./serialize";

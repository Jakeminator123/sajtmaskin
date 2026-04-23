/**
 * Barrel re-exports — public API of `@/lib/gen/stream/finalize-version`.
 *
 * Split out of the pre-OMTAG-03 monolith `finalize-version.ts`. All
 * consumers continue to import from `@/lib/gen/stream/finalize-version`
 * (or `./finalize-version`) unchanged — Node.js resolves the directory
 * to `index.ts`.
 */

export type { FinalizeParams, FinalizeProgressCallback, FinalizeResult } from "./types";
export { EmptyGenerationError, PartialFileOutputError } from "./errors";
export { finalizeAndSaveVersion } from "./runner";

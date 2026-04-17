export { getAllScaffoldVariants, getVariantById, getVariantsForScaffold } from "./registry";
export { pickScaffoldVariant, pickScaffoldVariantAsync } from "./matcher";
export type { PickScaffoldVariantAsyncOptions } from "./matcher";
export {
  selectVariantStructuralFiles,
  selectCapabilityStructuralFiles,
  clearStructuralFilePriorityCache,
} from "./structural-files";
export type {
  FontPairing,
  PickScaffoldVariantInput,
  ScaffoldVariant,
  ScaffoldVariantId,
  ScaffoldVariantThemeTokens,
} from "./types";
export type {
  VariantStructuralFileReference,
  VariantStructuralFilesSelection,
} from "./structural-files";
export {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "./variant-hints";
export type { VariantHints } from "./variant-hints";

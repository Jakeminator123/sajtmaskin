export { getAllScaffoldVariants, getVariantById, getVariantsForScaffold } from "./registry";
export { pickScaffoldVariant } from "./matcher";
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

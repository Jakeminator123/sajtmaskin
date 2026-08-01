export {
  getDefaultVariantForScaffold,
  getVariantById,
  getVariantsForScaffold,
} from "./registry";
export { pickScaffoldVariant, pickScaffoldVariantAsync } from "./matcher";
export type { PickScaffoldVariantAsyncOptions } from "./matcher";
export type {
  FontPairing,
  PickScaffoldVariantInput,
  ScaffoldVariant,
  ScaffoldVariantId,
  ScaffoldVariantThemeTokens,
} from "./types";
export {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "./variant-hints";
export type { VariantHints } from "./variant-hints";
export {
  buildVariantTemplateReferenceAttachments,
  extractVariantTemplateStructuralReferences,
  resolveVariantTemplateInspiration,
  selectVariantTemplateReference,
  VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES,
} from "./template-inspiration";
export type {
  VariantTemplateFullProjectCategory,
  VariantTemplateInspiration,
  VariantTemplateStructuralReference,
} from "./template-inspiration";

/**
 * Build the generation source receipt from already-selected ingredients
 * plus post-budget pruning. Selection is not changed here.
 */
import type { ShadcnUiRecipe } from "../data/shadcn-ui-recipes";
import type { DossierSelectionResult } from "../dossiers";
import type {
  GenerationSource,
  GenerationSourceAuthority,
} from "../generation-input-package";
import type { VariantTemplateInspiration } from "../scaffold-variants";
import type { VariantTemplateAddendumResolution } from "../scaffold-variants/variant-template-addendum";
import type {
  DesignReferenceAsset,
  DynamicContextPruning,
  MediaCatalogItem,
} from "../system-prompt";

const VARIANT_BLOCK_KEYS = ["variant_template_inspiration"] as const;
const UI_RECIPE_BLOCK_KEYS = ["ui_recipes"] as const;
const DOSSIER_BLOCK_KEYS = [
  "available_dossiers",
  "selected_dossier_instructions",
  "dossier_files_to_emit_verbatim",
] as const;
const MEDIA_BLOCK_KEYS = ["media_catalog"] as const;
const DESIGN_REFERENCE_BLOCK_KEYS = ["design_references"] as const;

export type SourceReceiptInput = {
  variantTemplateInspiration?: VariantTemplateInspiration | null;
  variantTemplateAddendumState?: VariantTemplateAddendumResolution["state"] | null;
  uiRecipes?: ShadcnUiRecipe[];
  dossierSelection?: DossierSelectionResult | null;
  mediaCatalog?: MediaCatalogItem[];
  designReferences?: DesignReferenceAsset[];
  pruning: Pick<DynamicContextPruning, "keptBlockKeys">;
};

function reachedPrompt(
  pruning: Pick<DynamicContextPruning, "keptBlockKeys">,
  blockKeys: readonly string[],
): boolean {
  const kept = new Set(pruning.keptBlockKeys ?? []);
  return blockKeys.some((key) => kept.has(key));
}

function variantReason(
  state: VariantTemplateAddendumResolution["state"] | null | undefined,
): string {
  if (state === "hit" || state === "disabled") return `addendum:${state}`;
  if (state === "missing" || state === "stale" || state === "invalid") {
    return `zip-fallback:${state}`;
  }
  return "complete-project reference";
}

function uiRecipeOrigin(recipe: ShadcnUiRecipe): string {
  if (recipe.source === "official") return "shadcn-official";
  const namespace = recipe.name.split("/")[0]?.replace(/^@/, "").trim();
  return namespace || "community";
}

function uiRecipeReason(recipe: ShadcnUiRecipe): string {
  const hasCode = recipe.files.some((file) => file.content.trim().length > 0);
  return `${recipe.reason}; ${hasCode ? "source-code" : "metadata-only"}`;
}

function dossierAuthority(
  reason: DossierSelectionResult["selected"][number]["reason"],
): GenerationSourceAuthority {
  return reason === "capability-match" ? "krav" : "mönster";
}

export function buildSourceReceipt(input: SourceReceiptInput): GenerationSource[] {
  const sources: GenerationSource[] = [];
  const inspiration = input.variantTemplateInspiration;
  if (inspiration) {
    sources.push({
      kind: "variant-reference",
      id: inspiration.templateId,
      origin: "blob-template",
      reason: variantReason(input.variantTemplateAddendumState),
      authority: "inspiration",
      reachedPrompt: reachedPrompt(input.pruning, VARIANT_BLOCK_KEYS),
    });
  }

  for (const recipe of input.uiRecipes ?? []) {
    sources.push({
      kind: "ui-recipe",
      id: recipe.name,
      origin: uiRecipeOrigin(recipe),
      reason: uiRecipeReason(recipe),
      authority: "mönster",
      reachedPrompt: reachedPrompt(input.pruning, UI_RECIPE_BLOCK_KEYS),
    });
  }

  for (const selected of input.dossierSelection?.selected ?? []) {
    sources.push({
      kind: "dossier",
      id: selected.entry.id,
      origin: selected.entry.class,
      reason: `${selected.reason} (${selected.entry.capability})`,
      authority: dossierAuthority(selected.reason),
      reachedPrompt: reachedPrompt(input.pruning, DOSSIER_BLOCK_KEYS),
    });
  }

  for (const item of input.mediaCatalog ?? []) {
    sources.push({
      kind: "media",
      id: item.alias,
      origin: "media-catalog",
      reason: item.alt ? `catalog alias (${item.alt})` : "catalog alias",
      authority: "inspiration",
      reachedPrompt: reachedPrompt(input.pruning, MEDIA_BLOCK_KEYS),
    });
  }

  for (const reference of input.designReferences ?? []) {
    const label = reference.label.trim();
    if (!label) continue;
    sources.push({
      kind: "media",
      id: label,
      origin: `design-reference:${reference.kind}`,
      reason: reference.note?.trim() || "design reference",
      authority: "inspiration",
      reachedPrompt: reachedPrompt(input.pruning, DESIGN_REFERENCE_BLOCK_KEYS),
    });
  }

  return sources;
}

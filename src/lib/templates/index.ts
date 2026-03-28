/**
 * Public API for the template catalog subsystem.
 *
 * External consumers should import from `@/lib/templates` rather than
 * reaching into `template-data.ts`, `template-catalog.ts` or other
 * internal modules directly. The internal structure may change; this
 * barrel stays stable.
 *
 * `TemplateCatalogSource = "v0"` refers to the **data source** (v0.app
 * gallery), not the codegen motor or the `/api/v0/` version prefix.
 */

// --- template-data (raw catalog, categories, helpers) ---
export {
  CATEGORIES,
  CATEGORY_IDS,
  CATEGORY_TITLES,
  COMPONENT_CATEGORIES,
  COMPONENTS,
  TEMPLATES,
  V0_CATEGORIES,
  getAllV0Categories,
  getCategory,
  getQuickPromptsForCategory,
  getTemplateById,
  getTemplateCategoryId,
  getTemplateCategoryTitle,
  getTemplateImageUrl,
  getTemplatesByCategory,
  getV0CategoryTitle,
  type CategoryInfo,
  type QuickPrompt,
  type Template,
  type TemplateComponentCategory,
} from "./template-data";

// --- template-catalog (catalog items with build intent) ---
export {
  getTemplateCatalog,
  getTemplateCatalogItemById,
  type TemplateCatalogItem,
  type TemplateCatalogSource,
} from "./template-catalog";

// --- template-search ---
export {
  searchTemplates,
  cosineSimilarity,
  invalidateEmbeddingsCache,
  type TemplateSearchResult,
} from "./template-search";

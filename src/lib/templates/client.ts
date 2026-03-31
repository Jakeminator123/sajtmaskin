/**
 * Client-safe template exports.
 *
 * Keep this file limited to static catalog data/helpers that do not touch
 * filesystem-backed search or server-only providers.
 */
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

export {
  getTemplateCatalog,
  getTemplateCatalogItemById,
  type TemplateCatalogItem,
  type TemplateCatalogSource,
} from "./template-catalog";

/**
 * Backoffice Module
 * =================
 *
 * Generiskt CMS-system för genererade sajter.
 *
 * Huvudfunktioner:
 * - Extrahera redigerbart innehåll från kod
 * - Hantera texter, bilder, färger och produkter
 * - Lösenordsskyddad admin-panel på /backoffice
 */

// Content extraction
export {
  extractContent,
  validateManifest,
  type ContentItem,
  type ProductItem,
  type ColorTheme,
  type ContentManifest,
} from "./content-extractor";

// Types and constants
export {
  BACKOFFICE_ROUTES,
  CONTENT_TYPE_LABELS,
  SECTION_LABELS,
  type BackofficeConfig,
  type ContentEdit,
  type BackofficeSession,
  type BackofficeAuthResponse,
  type ContentUpdateRequest,
  type ContentUpdateResponse,
} from "./types";

// Template generator
export { generateBackofficeFiles, type BackofficeFileSet } from "./template-generator";

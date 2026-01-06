/**
 * Backoffice Types
 * ================
 *
 * Shared types for the backoffice system.
 */

// Re-export content types
export type {
  ContentItem,
  ProductItem,
  ColorTheme,
  ContentManifest,
} from "./content-extractor";

/**
 * Backoffice configuration stored with the site
 */
export interface BackofficeConfig {
  enabled: boolean;
  passwordHash: string; // bcrypt hash of admin password
  createdAt: string;
  lastModified?: string;
}

/**
 * Content edit record - tracks changes to content
 */
export interface ContentEdit {
  id: string;
  contentId: string; // References ContentItem.id
  oldValue: string;
  newValue: string;
  editedAt: string;
  editedBy?: string; // For future multi-user support
}

/**
 * Session for backoffice authentication
 */
export interface BackofficeSession {
  id: string;
  siteId: string;
  createdAt: string;
  expiresAt: string;
  isValid: boolean;
}

/**
 * API response types
 */
export interface BackofficeAuthResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export interface ContentUpdateRequest {
  contentId: string;
  newValue: string;
}

export interface ContentUpdateResponse {
  success: boolean;
  content?: ContentItem;
  error?: string;
}

/**
 * Backoffice pages/routes
 */
export const BACKOFFICE_ROUTES = {
  login: "/backoffice",
  dashboard: "/backoffice/dashboard",
  content: "/backoffice/content",
  images: "/backoffice/images",
  colors: "/backoffice/colors",
  products: "/backoffice/products",
  settings: "/backoffice/settings",
} as const;

/**
 * Content type labels in Swedish
 */
export const CONTENT_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  image: "Bild",
  color: "Färg",
  link: "Länk",
  product: "Produkt",
};

/**
 * Section labels in Swedish
 */
export const SECTION_LABELS: Record<string, string> = {
  hero: "Hero-sektion",
  header: "Sidhuvud",
  footer: "Sidfot",
  about: "Om oss",
  contact: "Kontakt",
  pricing: "Priser",
  features: "Funktioner",
  testimonials: "Omdömen",
  products: "Produkter",
  team: "Team",
  gallery: "Galleri",
  faq: "Vanliga frågor",
  cta: "Call to action",
  general: "Övrigt",
};

// Import ContentItem type for the record
import type { ContentItem } from "./content-extractor";

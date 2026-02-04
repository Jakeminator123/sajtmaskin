/**
 * shadcn Registry Service
 * =======================
 *
 * Central service for fetching components from shadcn/ui registry.
 * Designed for user-friendly component browsing in the builder.
 *
 * Features:
 * - Fetch registry index with all available blocks/components
 * - Category-based organization
 * - Caching to reduce API calls
 * - Clean, typed API
 */

import type { ShadcnRegistryItem } from "@/lib/shadcn-registry-types";
import { getRegistryBaseUrl, getRegistryStyle } from "@/lib/v0/v0-url-parser";

// ============================================
// TYPES
// ============================================

export interface RegistryIndexItem {
  name: string;
  type: string;
  description?: string;
  categories?: string[];
}

export interface RegistryIndex {
  items: RegistryIndexItem[];
}

export interface ComponentCategory {
  id: string;
  label: string;
  labelSv: string;
  icon: string;
  items: ComponentItem[];
}

export interface ComponentItem {
  name: string;
  title: string;
  description: string;
  category: string;
  type: "block" | "component";
  previewUrl?: string;
  lightImageUrl?: string;
  darkImageUrl?: string;
}

// ============================================
// CATEGORY CONFIGURATION
// ============================================

const CATEGORY_CONFIG: Record<
  string,
  { label: string; labelSv: string; icon: string; order: number }
> = {
  authentication: { label: "Authentication", labelSv: "Inloggning", icon: "🔐", order: 1 },
  login: { label: "Login", labelSv: "Inloggning", icon: "🔑", order: 2 },
  signup: { label: "Sign Up", labelSv: "Registrering", icon: "📝", order: 3 },
  dashboard: { label: "Dashboard", labelSv: "Kontrollpanel", icon: "📊", order: 4 },
  sidebar: { label: "Sidebar", labelSv: "Sidofält", icon: "📋", order: 5 },
  charts: { label: "Charts", labelSv: "Diagram", icon: "📈", order: 6 },
  calendar: { label: "Calendar", labelSv: "Kalender", icon: "📅", order: 7 },
  forms: { label: "Forms", labelSv: "Formulär", icon: "📄", order: 8 },
  marketing: { label: "Marketing", labelSv: "Marknadsföring", icon: "🎯", order: 9 },
  landing: { label: "Landing Pages", labelSv: "Landningssidor", icon: "🚀", order: 10 },
  other: { label: "Other", labelSv: "Övrigt", icon: "📦", order: 99 },
};

// ============================================
// CACHE
// ============================================

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ============================================
// URL BUILDERS
// ============================================

export function buildRegistryIndexUrl(style?: string): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle = style?.trim() || getRegistryStyle();
  return `${baseUrl}/r/styles/${resolvedStyle}/registry.json`;
}

export function buildRegistryItemUrl(name: string, style?: string): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle = style?.trim() || getRegistryStyle();
  return `${baseUrl}/r/styles/${resolvedStyle}/${name}.json`;
}

export function buildPreviewUrl(name: string, style?: string): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle = style?.trim() || getRegistryStyle();
  return `${baseUrl}/view/${resolvedStyle}/${name}`;
}

export function buildPreviewImageUrl(
  name: string,
  theme: "light" | "dark",
  style?: string,
): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle = style?.trim() || getRegistryStyle();
  return `${baseUrl}/r/styles/${resolvedStyle}/${name}-${theme}.png`;
}

// ============================================
// FETCH FUNCTIONS
// ============================================

/**
 * Fetch the registry index containing all available items
 */
export async function fetchRegistryIndex(style?: string): Promise<RegistryIndex> {
  const cacheKey = `index:${style || "default"}`;
  const cached = getCached<RegistryIndex>(cacheKey);
  if (cached) return cached;

  const url = buildRegistryIndexUrl(style);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch registry index: ${response.status}`);
  }

  const data = (await response.json()) as RegistryIndex;
  setCache(cacheKey, data);
  return data;
}

/**
 * Fetch a specific registry item (component/block)
 */
export async function fetchRegistryItem(
  name: string,
  style?: string,
): Promise<ShadcnRegistryItem> {
  const cacheKey = `item:${name}:${style || "default"}`;
  const cached = getCached<ShadcnRegistryItem>(cacheKey);
  if (cached) return cached;

  const url = buildRegistryItemUrl(name, style);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch registry item "${name}": ${response.status}`);
  }

  const data = (await response.json()) as ShadcnRegistryItem;
  setCache(cacheKey, data);
  return data;
}

// ============================================
// BLOCK/COMPONENT HELPERS
// ============================================

function toTitleCase(value: string): string {
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCategoryConfig(rawCategory: string) {
  const normalized = rawCategory.trim().toLowerCase();
  return CATEGORY_CONFIG[normalized] || CATEGORY_CONFIG.other;
}

/**
 * Get all blocks organized by category (for the component picker)
 */
export async function getBlocksByCategory(style?: string): Promise<ComponentCategory[]> {
  const index = await fetchRegistryIndex(style);

  // Filter to only blocks
  const blocks = index.items.filter(
    (item) => item.type === "registry:block" && typeof item.name === "string",
  );

  // Group by category
  const categoryMap = new Map<string, ComponentItem[]>();

  for (const block of blocks) {
    const rawCategory = block.categories?.[0] || "other";
    const categoryId = rawCategory.toLowerCase();

    const item: ComponentItem = {
      name: block.name,
      title: toTitleCase(block.name),
      description: block.description || "",
      category: categoryId,
      type: "block",
      previewUrl: buildPreviewUrl(block.name, style),
      lightImageUrl: buildPreviewImageUrl(block.name, "light", style),
      darkImageUrl: buildPreviewImageUrl(block.name, "dark", style),
    };

    const existing = categoryMap.get(categoryId) || [];
    existing.push(item);
    categoryMap.set(categoryId, existing);
  }

  // Convert to sorted array
  const categories: ComponentCategory[] = [];

  for (const [categoryId, items] of categoryMap) {
    const config = getCategoryConfig(categoryId);
    categories.push({
      id: categoryId,
      label: config.label,
      labelSv: config.labelSv,
      icon: config.icon,
      items: items.sort((a, b) => a.title.localeCompare(b.title)),
    });
  }

  // Sort categories by configured order
  return categories.sort((a, b) => {
    const aOrder = getCategoryConfig(a.id).order;
    const bOrder = getCategoryConfig(b.id).order;
    return aOrder - bOrder;
  });
}

/**
 * Search blocks by query string
 */
export function searchBlocks(
  categories: ComponentCategory[],
  query: string,
): ComponentCategory[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return categories;

  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const searchText = `${item.title} ${item.name} ${item.description}`.toLowerCase();
        return searchText.includes(trimmed);
      }),
    }))
    .filter((category) => category.items.length > 0);
}

// ============================================
// FEATURED BLOCKS (Curated for users)
// ============================================

export const FEATURED_BLOCKS = [
  {
    id: "login",
    titleSv: "Inloggning",
    descriptionSv: "Professionella inloggningsformulär",
    icon: "🔐",
    blocks: ["login-01", "login-02", "login-03", "login-04", "login-05"],
  },
  {
    id: "signup",
    titleSv: "Registrering",
    descriptionSv: "Registreringsformulär med olika layouts",
    icon: "📝",
    blocks: ["signup-01", "signup-02", "signup-03", "signup-04", "signup-05"],
  },
  {
    id: "otp",
    titleSv: "Verifiering (OTP)",
    descriptionSv: "Engångskod-verifiering",
    icon: "🔢",
    blocks: ["otp-01", "otp-02", "otp-03", "otp-04", "otp-05"],
  },
  {
    id: "dashboard",
    titleSv: "Kontrollpanel",
    descriptionSv: "Moderna dashboard-layouts med diagram",
    icon: "📊",
    blocks: ["dashboard-01"],
  },
  {
    id: "sidebar",
    titleSv: "Sidofält",
    descriptionSv: "Navigeringssidofält med olika stilar",
    icon: "📋",
    blocks: [
      "sidebar-01",
      "sidebar-02",
      "sidebar-03",
      "sidebar-04",
      "sidebar-05",
      "sidebar-06",
      "sidebar-07",
      "sidebar-08",
    ],
  },
  {
    id: "calendar",
    titleSv: "Kalender & Datum",
    descriptionSv: "Datumväljare och kalendrar",
    icon: "📅",
    blocks: [
      "calendar-01",
      "calendar-04",
      "calendar-10",
      "calendar-16",
      "calendar-22",
      "calendar-23",
      "calendar-27",
      "calendar-31",
    ],
  },
  {
    id: "charts",
    titleSv: "Diagram",
    descriptionSv: "Interaktiva diagram och grafer",
    icon: "📈",
    blocks: [
      "chart-area-interactive",
      "chart-bar-interactive",
      "chart-line-interactive",
      "chart-pie-interactive",
      "chart-radar-default",
      "chart-radial-simple",
    ],
  },
];

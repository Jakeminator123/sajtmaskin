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
import { getRegistryBaseUrl, resolveRegistryStyle } from "@/lib/v0/v0-url-parser";

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

export interface RegistrySummary {
  total: number;
  blocks: number;
  components: number;
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
  lightImageUrl?: string;
  darkImageUrl?: string;
}

export type RegistryItemKind = "block" | "component";

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
  forms: { label: "Forms", labelSv: "Formulär", icon: "📝", order: 8 },
  inputs: { label: "Inputs", labelSv: "Inmatning", icon: "⌨️", order: 9 },
  navigation: { label: "Navigation", labelSv: "Navigation", icon: "🧭", order: 10 },
  layout: { label: "Layout", labelSv: "Layout", icon: "🧱", order: 11 },
  overlay: { label: "Overlay", labelSv: "Overlay", icon: "🪟", order: 12 },
  feedback: { label: "Feedback", labelSv: "Feedback", icon: "💬", order: 13 },
  data: { label: "Data", labelSv: "Data", icon: "🗂️", order: 14 },
  table: { label: "Tables", labelSv: "Tabeller", icon: "📋", order: 15 },
  typography: { label: "Typography", labelSv: "Typografi", icon: "🔤", order: 16 },
  commerce: { label: "Commerce", labelSv: "E‑handel", icon: "🛒", order: 17 },
  marketing: { label: "Marketing", labelSv: "Marknadsföring", icon: "🎯", order: 18 },
  landing: { label: "Landing Pages", labelSv: "Landningssidor", icon: "🚀", order: 19 },
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

async function parseRegistryError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return "";
  try {
    const data = JSON.parse(text) as { error?: string; details?: string };
    if (data?.error && data?.details) return `${data.error}: ${data.details}`;
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return text;
}

// ============================================
// URL BUILDERS
// ============================================

export function buildRegistryIndexUrl(style?: string): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle = resolveRegistryStyle(style, baseUrl);
  return `${baseUrl}/r/styles/${resolvedStyle}/registry.json`;
}

export function buildRegistryItemUrl(name: string, style?: string): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle = resolveRegistryStyle(style, baseUrl);
  return `${baseUrl}/r/styles/${resolvedStyle}/${name}.json`;
}

function buildRegistryProxyIndexUrl(
  style?: string,
  options: { force?: boolean; source?: string } = {},
): string {
  const params = new URLSearchParams();
  if (style?.trim()) params.set("style", style.trim());
  if (options.force) params.set("force", "1");
  if (options.source) params.set("source", options.source);
  const query = params.toString();
  return `/api/shadcn/registry/index${query ? `?${query}` : ""}`;
}

function buildRegistryProxyItemUrl(
  name: string,
  style?: string,
  options: { force?: boolean; source?: string } = {},
): string {
  const params = new URLSearchParams();
  params.set("name", name);
  if (style?.trim()) params.set("style", style.trim());
  if (options.force) params.set("force", "1");
  if (options.source) params.set("source", options.source);
  return `/api/shadcn/registry/item?${params.toString()}`;
}

export function buildPreviewImageUrl(
  name: string,
  theme: "light" | "dark",
  style?: string,
): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle = resolveRegistryStyle(style, baseUrl);
  return `${baseUrl}/r/styles/${resolvedStyle}/${name}-${theme}.png`;
}

// ============================================
// FETCH FUNCTIONS
// ============================================

/**
 * Fetch the registry index containing all available items
 */
export async function fetchRegistryIndex(style?: string): Promise<RegistryIndex> {
  const force = false;
  const cacheKey = `index:${style || "default"}`;
  const cached = getCached<RegistryIndex>(cacheKey);
  if (cached) return cached;

  const url =
    typeof window === "undefined"
      ? buildRegistryIndexUrl(style)
      : buildRegistryProxyIndexUrl(style, { force });
  const response = await fetch(url);

  if (!response.ok) {
    const details = await parseRegistryError(response);
    const suffix = details ? ` - ${details}` : "";
    throw new Error(`Kunde inte hämta registry-index (HTTP ${response.status})${suffix}`);
  }

  const data = (await response.json()) as RegistryIndex;
  if (!data || !Array.isArray(data.items)) {
    throw new Error("Registry response saknar giltiga items");
  }
  setCache(cacheKey, data);
  return data;
}

export async function fetchRegistryIndexWithOptions(
  style?: string,
  options: { force?: boolean; source?: string } = {},
): Promise<RegistryIndex> {
  const force = Boolean(options.force);
  const cacheKey = `index:${style || "default"}`;
  const cached = getCached<RegistryIndex>(cacheKey);
  if (cached && !force) return cached;

  const url =
    typeof window === "undefined"
      ? buildRegistryIndexUrl(style)
      : buildRegistryProxyIndexUrl(style, { force, source: options.source });
  const response = await fetch(url, force ? { cache: "no-store" } : undefined);

  if (!response.ok) {
    const details = await parseRegistryError(response);
    const suffix = details ? ` - ${details}` : "";
    throw new Error(`Kunde inte hämta registry-index (HTTP ${response.status})${suffix}`);
  }

  const data = (await response.json()) as RegistryIndex;
  if (!data || !Array.isArray(data.items)) {
    throw new Error("Registry response saknar giltiga items");
  }
  setCache(cacheKey, data);
  return data;
}

/**
 * Fetch a summary of registry contents (counts)
 */
export async function fetchRegistrySummary(style?: string): Promise<RegistrySummary> {
  const index = await fetchRegistryIndex(style);
  const items = index.items || [];
  const blocks = items.filter((item) => isRegistryItemKind(item, "block")).length;
  const components = items.filter((item) => isRegistryItemKind(item, "component")).length;
  return { total: items.length, blocks, components };
}

/**
 * Fetch a specific registry item (component/block)
 */
export async function fetchRegistryItem(name: string, style?: string): Promise<ShadcnRegistryItem> {
  const cacheKey = `item:${name}:${style || "default"}`;
  const cached = getCached<ShadcnRegistryItem>(cacheKey);
  if (cached) return cached;

  const url =
    typeof window === "undefined"
      ? buildRegistryItemUrl(name, style)
      : buildRegistryProxyItemUrl(name, style);
  const response = await fetch(url);

  if (!response.ok) {
    const details = await parseRegistryError(response);
    const suffix = details ? ` - ${details}` : "";
    throw new Error(`Kunde inte hämta registry-item "${name}" (HTTP ${response.status})${suffix}`);
  }

  const data = (await response.json()) as ShadcnRegistryItem;
  setCache(cacheKey, data);
  return data;
}

export async function fetchRegistryItemWithOptions(
  name: string,
  style?: string,
  options: { force?: boolean; source?: string } = {},
): Promise<ShadcnRegistryItem> {
  const force = Boolean(options.force);
  const cacheKey = `item:${name}:${style || "default"}`;
  const cached = getCached<ShadcnRegistryItem>(cacheKey);
  if (cached && !force) return cached;

  const url =
    typeof window === "undefined"
      ? buildRegistryItemUrl(name, style)
      : buildRegistryProxyItemUrl(name, style, { force, source: options.source });
  const response = await fetch(url, force ? { cache: "no-store" } : undefined);

  if (!response.ok) {
    const details = await parseRegistryError(response);
    const suffix = details ? ` - ${details}` : "";
    throw new Error(`Kunde inte hämta registry-item "${name}" (HTTP ${response.status})${suffix}`);
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
  if (!normalized) return CATEGORY_CONFIG.other;
  const config = CATEGORY_CONFIG[normalized];
  if (config) return config;
  const label = toTitleCase(normalized);
  return { label, labelSv: label, icon: "🧩", order: 50 };
}

function isRegistryItemKind(item: RegistryIndexItem, kind: RegistryItemKind) {
  const rawType = item.type?.toLowerCase() || "";
  if (kind === "block") return rawType === "registry:block" || rawType === "block";
  return (
    rawType === "registry:ui" ||
    rawType === "ui" ||
    rawType === "registry:component" ||
    rawType === "component"
  );
}

/**
 * Get registry items organized by category (blocks or components)
 */
export async function getRegistryItemsByCategory(
  style?: string,
  kind: RegistryItemKind = "block",
  options: { force?: boolean } = {},
): Promise<ComponentCategory[]> {
  const index = options.force
    ? await fetchRegistryIndexWithOptions(style, options)
    : await fetchRegistryIndex(style);

  // Filter by type
  const filteredItems = index.items.filter(
    (item) => isRegistryItemKind(item, kind) && typeof item.name === "string",
  );

  // Group by category
  const categoryMap = new Map<string, ComponentItem[]>();

  for (const item of filteredItems) {
    const rawCategory = item.categories?.[0]?.trim() || "other";
    const categoryId = rawCategory.toLowerCase() || "other";

    const entry: ComponentItem = {
      name: item.name,
      title: toTitleCase(item.name),
      description: item.description || "",
      category: categoryId,
      type: kind,
      lightImageUrl: kind === "block" ? buildPreviewImageUrl(item.name, "light", style) : undefined,
      darkImageUrl: kind === "block" ? buildPreviewImageUrl(item.name, "dark", style) : undefined,
    };

    const existing = categoryMap.get(categoryId) || [];
    existing.push(entry);
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
 * Get all blocks organized by category (for the component picker)
 */
export async function getBlocksByCategory(
  style?: string,
  options: { force?: boolean } = {},
): Promise<ComponentCategory[]> {
  return getRegistryItemsByCategory(style, "block", options);
}

/**
 * Get all components organized by category (for the component picker)
 */
export async function getComponentsByCategory(
  style?: string,
  options: { force?: boolean } = {},
): Promise<ComponentCategory[]> {
  return getRegistryItemsByCategory(style, "component", options);
}

/**
 * Search blocks by query string
 */
export function searchBlocks(categories: ComponentCategory[], query: string): ComponentCategory[] {
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

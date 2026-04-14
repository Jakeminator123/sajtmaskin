/**
 * URL parser and helpers for shadcn registry URLs.
 */

const DEFAULT_REGISTRY_BASE_URL = "https://ui.shadcn.com";
const DEFAULT_REGISTRY_STYLE = "radix-vega";

/** Default style segment when resolving legacy (v3) registry items — matches shadcn CLI "new-york". */
export const LEGACY_STYLE_DEFAULT = "new-york";

/**
 * Build a docs URL for a shadcn/ui component.
 * Canonical form is `https://ui.shadcn.com/docs/components/{slug}` (no `/radix/` prefix) —
 * matches the official llms.txt and sidebar navigation.
 */
export function buildShadcnDocsUrl(
  componentName: string,
  options: { baseUrl?: string } = {},
): string {
  const base = options.baseUrl?.trim() || getRegistryBaseUrl();
  const slug = componentName.trim().toLowerCase();
  return `${base}/docs/components/${encodeURIComponent(slug)}`;
}

function normalizeRegistryBaseUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function getRegistryBaseUrl(): string {
  const envValue = process.env.NEXT_PUBLIC_REGISTRY_BASE_URL || "";
  return normalizeRegistryBaseUrl(envValue) || DEFAULT_REGISTRY_BASE_URL;
}

export function getRegistryStyle(fallback: string = DEFAULT_REGISTRY_STYLE): string {
  const envValue = process.env.NEXT_PUBLIC_REGISTRY_STYLE?.trim();
  return envValue || fallback;
}

export function resolveRegistryStyle(
  style?: string,
  baseUrl?: string,
  options: { allowLegacy?: boolean } = {},
): string {
  const rawStyle = style?.trim() || getRegistryStyle();
  const resolvedBase = baseUrl
    ? normalizeRegistryBaseUrl(baseUrl) || getRegistryBaseUrl()
    : getRegistryBaseUrl();
  if (!options.allowLegacy && resolvedBase.includes("ui.shadcn.com") && rawStyle === "new-york") {
    return "radix-vega";
  }
  return rawStyle;
}

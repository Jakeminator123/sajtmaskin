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

/**
 * Ordered fallback chain for registry style resolution.
 * Primary style first, then legacy styles to try if primary returns 404.
 * Used by any fetch that needs graceful degradation across style renames.
 */
export function getStyleFallbackChain(style?: string, baseUrl?: string): string[] {
  const primary = resolveRegistryStyle(style, baseUrl);
  const chain = [primary];
  if (primary !== "new-york-v4") chain.push("new-york-v4");
  if (primary !== LEGACY_STYLE_DEFAULT && !chain.includes(LEGACY_STYLE_DEFAULT)) {
    chain.push(LEGACY_STYLE_DEFAULT);
  }
  return chain;
}

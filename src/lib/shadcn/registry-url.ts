/**
 * URL parser and helpers for shadcn registry URLs.
 */

const DEFAULT_REGISTRY_BASE_URL = "https://ui.shadcn.com";

/**
 * Canonical registry style for ui.shadcn.com.
 *
 * `new-york-v4` is the Tailwind v4 / React 19 "New York" set — the COMPLETE,
 * screenshot-backed style on ui.shadcn.com (full block + chart catalog, every
 * `{name}-{theme}.png` preview, non-empty component payloads). The newer
 * `radix-vega` label renders the same look but is only partially populated
 * upstream (empty `form.json`, no chart blocks, missing preview PNGs), which
 * made the Elements picker show "Ingen preview" walls and dropped charts.
 * We therefore standardize the official registry on `new-york-v4` and coerce
 * the incomplete/legacy aliases to it. Flip back to `radix-vega` once shadcn
 * finishes populating that namespace upstream.
 */
const DEFAULT_REGISTRY_STYLE = "new-york-v4";

/**
 * Official ui.shadcn.com style aliases that are legacy or incompletely
 * populated and must resolve to {@link DEFAULT_REGISTRY_STYLE} so the picker
 * and insertion code always hit the fully-populated catalog. Custom registries
 * (non ui.shadcn.com base URLs) pass through untouched.
 */
const OFFICIAL_COERCED_STYLES = new Set(["new-york", "default", "radix-vega"]);

/** Last-resort fallback style for ui.shadcn.com (pre-v4 "New York"). */
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
  if (
    !options.allowLegacy &&
    resolvedBase.includes("ui.shadcn.com") &&
    OFFICIAL_COERCED_STYLES.has(rawStyle)
  ) {
    return DEFAULT_REGISTRY_STYLE;
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

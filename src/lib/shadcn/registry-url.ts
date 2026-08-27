/**
 * URL parser and helpers for shadcn registry URLs.
 */

const DEFAULT_REGISTRY_BASE_URL = "https://ui.shadcn.com";

/**
 * Canonical registry style for ui.shadcn.com.
 *
 * `new-york-v4` is the Tailwind v4 / React 19 "New York" JSON set on
 * ui.shadcn.com (full block + chart catalog and non-empty component payloads).
 * Preview PNG availability is sparse and owned separately by
 * `registry-service.ts`; the JSON style does not imply a screenshot. The newer
 * `radix-vega` label renders the same look but is only partially populated
 * upstream (empty `form.json`, no chart blocks, missing preview PNGs), which
 * made the Elements picker show "Ingen preview" walls and dropped charts.
 * We therefore standardize the official registry on `new-york-v4` and coerce
 * the incomplete/legacy aliases to it. Flip back to `radix-vega` once shadcn
 * finishes populating that namespace upstream.
 *
 * NOTE: `components.json` deliberately keeps a schema-valid `style` alias
 * (`radix-vega`). The official components.json `$schema` enum lists
 * `default` / `new-york` / `radix-*` / `base-*` but NOT `new-york-v4`, so
 * putting `new-york-v4` there would make the shadcn CLI/MCP reject the config.
 * The canonical runtime style + coercion live HERE, not in components.json.
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
 * Style path that still hosts the block preview PNGs on ui.shadcn.com.
 *
 * The 2026-07 site redesign removed the `{name}-{theme}.png` screenshots from
 * the `new-york-v4` style path (verified 404 2026-07-24), while the legacy
 * `new-york` path still serves a sparse verified subset (200, image/png).
 * Availability is owned by `OFFICIAL_BLOCK_PREVIEW_IMAGE_NAMES`; JSON payloads
 * stay on {@link DEFAULT_REGISTRY_STYLE}; ONLY preview-image URLs use this
 * constant.
 * Re-verify with `https://ui.shadcn.com/r/styles/new-york/dashboard-01-light.png`
 * if thumbnails go blank again.
 */
export const PREVIEW_IMAGE_STYLE = "new-york";

/**
 * Resolve the style segment for preview-image URLs (`{name}-{theme}.png`).
 * Official ui.shadcn.com → {@link PREVIEW_IMAGE_STYLE} (the style path that
 * hosts the verified subset). Custom registry hosts pass through the normal
 * style resolution untouched.
 */
export function resolvePreviewImageStyle(style?: string, baseUrl?: string): string {
  const resolvedBase = baseUrl
    ? normalizeRegistryBaseUrl(baseUrl) || getRegistryBaseUrl()
    : getRegistryBaseUrl();
  if (resolvedBase.includes("ui.shadcn.com")) return PREVIEW_IMAGE_STYLE;
  return resolveRegistryStyle(style, baseUrl);
}

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

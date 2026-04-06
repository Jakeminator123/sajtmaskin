/**
 * URL parser and helpers for shadcn registry URLs.
 */

const DEFAULT_REGISTRY_BASE_URL = "https://ui.shadcn.com";
const DEFAULT_REGISTRY_STYLE = "new-york-v4";

/** Default style segment when resolving legacy (v3) registry items — matches shadcn CLI "new-york". */
export const LEGACY_STYLE_DEFAULT = "new-york";

/**
 * Component slugs whose documentation on ui.shadcn.com lives under `/docs/components/radix/...`.
 * Other slugs use `/docs/components/{slug}` (e.g. some marketing-only or experimental pages).
 * Keep in sync with https://ui.shadcn.com/docs/components — both URL shapes often work, but radix is canonical for primitives.
 */
const SHADCN_RADIX_DOC_SLUGS = new Set<string>([
  "accordion",
  "alert",
  "alert-dialog",
  "aspect-ratio",
  "avatar",
  "badge",
  "breadcrumb",
  "button",
  "button-group",
  "calendar",
  "card",
  "carousel",
  "chart",
  "checkbox",
  "collapsible",
  "command",
  "context-menu",
  "dialog",
  "drawer",
  "dropdown-menu",
  "empty",
  "field",
  "form",
  "hover-card",
  "input",
  "input-group",
  "input-otp",
  "item",
  "kbd",
  "label",
  "menubar",
  "navigation-menu",
  "native-select",
  "pagination",
  "popover",
  "progress",
  "radio-group",
  "resizable",
  "scroll-area",
  "select",
  "separator",
  "sheet",
  "sidebar",
  "skeleton",
  "slider",
  "sonner",
  "spinner",
  "switch",
  "table",
  "tabs",
  "textarea",
  "toggle",
  "toggle-group",
  "tooltip",
]);

export function shadcnDocsPathUsesRadix(componentSlug: string): boolean {
  const key = componentSlug.trim().toLowerCase();
  return SHADCN_RADIX_DOC_SLUGS.has(key);
}

export function buildShadcnDocsUrl(
  componentName: string,
  options: { radix?: boolean; baseUrl?: string } = {},
): string {
  const base = options.baseUrl?.trim() || getRegistryBaseUrl();
  const slug = componentName.trim().toLowerCase();
  const useRadix = options.radix ?? shadcnDocsPathUsesRadix(slug);
  const radixSegment = useRadix ? "/radix" : "";
  return `${base}/docs/components${radixSegment}/${encodeURIComponent(slug)}`;
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
  if (!options.allowLegacy && resolvedBase.includes("ui.shadcn.com") && !rawStyle.endsWith("-v4")) {
    return `${rawStyle}-v4`;
  }
  return rawStyle;
}

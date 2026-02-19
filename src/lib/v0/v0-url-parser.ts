/**
 * URL Parser for shadcn/v0 registry URLs
 * ======================================
 *
 * Validates and parses registry URLs for component imports.
 *
 * Registry URL formats:
 * - https://ui.shadcn.com/r/styles/new-york-v4/{component}.json
 * - https://ui.shadcn.com/r/{component}.json
 * - Custom registries following same spec
 */

export interface ParsedRegistryUrl {
  /** The base registry URL (e.g., https://ui.shadcn.com) */
  baseUrl: string;
  /** Style variant (e.g., 'new-york-v4', 'default') */
  style?: string;
  /** Component name extracted from URL */
  componentName?: string;
  /** Full original URL */
  originalUrl: string;
}

const DEFAULT_REGISTRY_BASE_URL = "https://ui.shadcn.com";
const DEFAULT_REGISTRY_STYLE = "new-york-v4";

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

/**
 * Check if a URL looks like a registry URL
 * Registry URLs typically:
 * - End with .json
 * - Contain /r/ in the path
 */
export function isRegistryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith(".json") && pathname.includes("/r/");
  } catch {
    return false;
  }
}

/**
 * Parse a registry URL to extract metadata
 *
 * @param url - The registry URL to parse
 * @returns Parsed registry metadata
 */
export function parseRegistryUrl(url: string): ParsedRegistryUrl {
  const result: ParsedRegistryUrl = {
    baseUrl: "",
    originalUrl: url,
  };

  try {
    const parsed = new URL(url);
    result.baseUrl = `${parsed.protocol}//${parsed.host}`;

    // Extract path segments
    // Example: /r/styles/new-york-v4/login-01.json
    const pathSegments = parsed.pathname.split("/").filter(Boolean);

    // Find the .json file (component name)
    const jsonFile = pathSegments.find((seg) => seg.endsWith(".json"));
    if (jsonFile) {
      result.componentName = jsonFile.replace(".json", "");
    }

    // Check for style in path (e.g., /r/styles/new-york-v4/)
    const stylesIndex = pathSegments.indexOf("styles");
    if (stylesIndex !== -1 && pathSegments[stylesIndex + 1]) {
      result.style = pathSegments[stylesIndex + 1];
    }
  } catch {
    // Invalid URL - return minimal result
  }

  return result;
}

/**
 * Build a shadcn registry URL from component name
 *
 * @param componentName - The component name (e.g., 'login-01')
 * @param style - Style variant (default: 'new-york-v4')
 * @returns Full registry URL
 */
export function buildShadcnRegistryUrl(componentName: string, style?: string): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle = resolveRegistryStyle(style, baseUrl);
  return `${baseUrl}/r/styles/${resolvedStyle}/${componentName}.json`;
}

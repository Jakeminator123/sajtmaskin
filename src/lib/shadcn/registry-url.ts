/**
 * URL parser and helpers for shadcn registry URLs.
 */

export interface ParsedRegistryUrl {
  baseUrl: string;
  style?: string;
  componentName?: string;
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

export function isRegistryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith(".json") && pathname.includes("/r/");
  } catch {
    return false;
  }
}

export function parseRegistryUrl(url: string): ParsedRegistryUrl {
  const result: ParsedRegistryUrl = {
    baseUrl: "",
    originalUrl: url,
  };

  try {
    const parsed = new URL(url);
    result.baseUrl = `${parsed.protocol}//${parsed.host}`;

    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const jsonFile = pathSegments.find((seg) => seg.endsWith(".json"));
    if (jsonFile) {
      result.componentName = jsonFile.replace(".json", "");
    }

    const stylesIndex = pathSegments.indexOf("styles");
    if (stylesIndex !== -1 && pathSegments[stylesIndex + 1]) {
      result.style = pathSegments[stylesIndex + 1];
    }
  } catch {
    // Invalid URL - return minimal result
  }

  return result;
}

export function buildShadcnRegistryUrl(componentName: string, style?: string): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle = resolveRegistryStyle(style, baseUrl);
  return `${baseUrl}/r/styles/${resolvedStyle}/${componentName}.json`;
}

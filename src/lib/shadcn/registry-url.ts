/**
 * URL parser and helpers for shadcn registry URLs.
 */

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

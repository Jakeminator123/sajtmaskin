/**
 * Community-registry HTTP helpers.
 *
 * shadcnblocks Pro items need `Authorization: Bearer ${SHADCNBLOCKS_API_KEY}`.
 * Their apex host (`shadcnblocks.com`) 301:ar till `www` och tappar den
 * headern — hämta därför alltid www. Officiella ui.shadcn.com-fetchen använder
 * `REGISTRY_AUTH_TOKEN` i `registry-cache.ts`; skicka aldrig shadcnblocks-nyckeln dit.
 *
 * Headers läggs inte i `components.json`: publikt repo, och shadcn CLI kräver
 * då env även för fria poster.
 */

const SHADCNBLOCKS_APEX_HOST = "shadcnblocks.com";
const SHADCNBLOCKS_WWW_HOST = "www.shadcnblocks.com";

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isShadcnblocksRegistryUrl(url: string): boolean {
  const host = hostnameOf(url);
  return host === SHADCNBLOCKS_APEX_HOST || host === SHADCNBLOCKS_WWW_HOST;
}

export function rewriteCommunityRegistryUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() === SHADCNBLOCKS_APEX_HOST) {
      parsed.hostname = SHADCNBLOCKS_WWW_HOST;
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

export function communityRegistryFetchHeaders(url: string): Record<string, string> {
  if (!isShadcnblocksRegistryUrl(url)) return {};
  const key = process.env.SHADCNBLOCKS_API_KEY?.trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

function plainHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

export function buildCommunityRegistryRequest(
  url: string,
  init: RequestInit = {},
): { url: string; init: RequestInit } {
  const safeUrl = rewriteCommunityRegistryUrl(url);
  const auth = communityRegistryFetchHeaders(safeUrl);
  if (Object.keys(auth).length === 0) {
    return { url: safeUrl, init };
  }
  return {
    url: safeUrl,
    init: {
      ...init,
      headers: {
        ...plainHeaders(init.headers),
        ...auth,
      },
    },
  };
}

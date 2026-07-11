/**
 * Public URL policy for generated customer sites.
 *
 * A generated site keeps its provider URL for diagnostics and rollback, but
 * users should receive a stable Sajtmaskin URL until they verify their own
 * domain. All values here are deliberately hostnames, never request supplied
 * URLs, so tenant routing cannot be influenced by untrusted input.
 */

const DEFAULT_RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "preview",
  "www",
]);

function isAffirmative(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function normalizeDomainHostname(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  let hostname = raw.toLowerCase().replace(/\.$/, "");
  if (/^https?:\/\//i.test(raw)) {
    try {
      hostname = new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
    } catch {
      return null;
    }
  }
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname.includes("/") ||
    hostname.includes(":") ||
    hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    return null;
  }
  return hostname;
}

export function getBrandedLiveSiteDomain(): string | null {
  if (!isAffirmative(process.env.SAJTMASKIN_BRANDED_LIVE_URLS)) return null;
  return normalizeDomainHostname(process.env.SAJTMASKIN_LIVE_SITE_DOMAIN);
}

export function buildBrandedLiveDomain(slug: string, baseDomain = getBrandedLiveSiteDomain()): string | null {
  const normalizedSlug = slug.trim().toLowerCase();
  if (
    !baseDomain ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalizedSlug) ||
    DEFAULT_RESERVED_SLUGS.has(normalizedSlug)
  ) {
    return null;
  }
  return `${normalizedSlug}.${baseDomain}`;
}

export function toHttpsUrl(hostname: string | null | undefined): string | null {
  const normalized = normalizeDomainHostname(hostname);
  return normalized ? `https://${normalized}` : null;
}

export function resolveLiveUrl(params: {
  providerUrl?: string | null;
  brandedDomain?: string | null;
  brandedDomainVerifiedAt?: Date | string | null;
  customDomain?: string | null;
  customDomainVerifiedAt?: Date | string | null;
}): string | null {
  if (params.customDomain && params.customDomainVerifiedAt) {
    return toHttpsUrl(params.customDomain);
  }
  const brandedBase = getBrandedLiveSiteDomain();
  const normalizedBranded = normalizeDomainHostname(params.brandedDomain);
  if (
    brandedBase &&
    normalizedBranded?.endsWith(`.${brandedBase}`) &&
    params.brandedDomainVerifiedAt
  ) {
    return toHttpsUrl(params.brandedDomain);
  }
  return toHttpsUrl(params.providerUrl);
}

/**
 * Stable, human-readable candidate. Persistence owns collision handling, so
 * this helper must remain deterministic and cannot append random values.
 */
export function slugCandidate(value: string): string {
  const candidate = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return candidate && !DEFAULT_RESERVED_SLUGS.has(candidate) ? candidate : "site";
}

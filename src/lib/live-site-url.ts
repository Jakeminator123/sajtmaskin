/**
 * Public URL policy for generated customer sites.
 *
 * A generated site keeps its provider URL for diagnostics and rollback, but
 * A2 only inventories branded candidates: it never presents a branded host as
 * active. Users keep the provider URL until they verify their own domain. All
 * values here are deliberately hostnames, never request supplied URLs, so
 * tenant routing cannot be influenced by untrusted input.
 */

import { resolveBrandedPilotEligibility } from "@/lib/branded-pilot-eligibility";

export const RESERVED_BRANDED_SLUGS = ["admin", "api", "app", "assets", "preview", "www"] as const;

const DEFAULT_RESERVED_SLUGS = new Set<string>(RESERVED_BRANDED_SLUGS);

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

const PLATFORM_VERCEL_APP_HOST = "sajtmaskin.vercel.app";

/**
 * Extra reject for Vercel git-branch aliases. Not the production gate:
 * per-deployment hosts (`{name}-{hash}-{scope}.vercel.app`) have no `-git-`.
 */
export function isGitPreviewVercelHost(value: string | null | undefined): boolean {
  const host = normalizeDomainHostname(value);
  return Boolean(host?.endsWith(".vercel.app") && host.includes("-git-"));
}

/**
 * Opaque Vercel deployment token: 8–12 `[a-z0-9]` and at least one digit.
 * Dictionary hyphen-words (`bonanova`, `komplett`) are not hashes.
 */
function isOpaqueVercelDeploymentHash(token: string): boolean {
  return /^[a-z0-9]{8,12}$/i.test(token) && /[0-9]/.test(token);
}

/**
 * Vercel per-deployment host: `{name}-{hash}-{scope}.vercel.app`.
 * The hash is an opaque 8–12 token that is followed by a scope (team slug
 * may itself contain hyphens). A trailing project hash alone
 * (`…-ec66b7c6.vercel.app`) is a production alias, not a unique deploy host.
 */
export function isUniqueVercelDeploymentHost(value: string | null | undefined): boolean {
  const host = normalizeDomainHostname(value);
  if (!host?.endsWith(".vercel.app") || isGitPreviewVercelHost(host)) return false;
  const parts = host.slice(0, -".vercel.app".length).split("-");
  return parts.some(
    (part, index) => index < parts.length - 1 && isOpaqueVercelDeploymentHash(part),
  );
}

/**
 * 3-label `*.vercel.app` production-alias shape. Team/user suffixes are
 * included. Git aliases and the platform host are not. Per-deployment
 * URLs have the same shape — do not use this as a SITE_URL source; read
 * aliases from the project payload instead.
 */
export function isVercelProductionAliasHost(value: string | null | undefined): boolean {
  const host = normalizeDomainHostname(value);
  if (!host || isGitPreviewVercelHost(host) || host === PLATFORM_VERCEL_APP_HOST) return false;
  const labels = host.split(".");
  return labels.length === 3 && labels[1] === "vercel" && labels[2] === "app";
}

/**
 * Last-working provider host we may keep while the alias read is unknown.
 * Rejects unique-deployment-shaped hosts so a stored per-deployment URL
 * cannot become SITE_URL.
 */
export function isProductionProviderVercelHost(value: string | null | undefined): boolean {
  const host = normalizeDomainHostname(value);
  return Boolean(host && isVercelProductionAliasHost(host) && !isUniqueVercelDeploymentHost(host));
}

/**
 * Customer-facing production alias from a Vercel payload list. Deterministic:
 * shortest hostname, then lexicographic. Never invents a name and never
 * uses word/suffix heuristics — truncated and `aaa-red-one` aliases stay
 * exactly as Vercel returned them.
 */
export function pickCustomerFacingProductionAlias(
  aliases: ReadonlyArray<string | null | undefined>,
): string | null {
  const attested = aliases
    .map((entry) => normalizeDomainHostname(entry))
    .filter((host): host is string => Boolean(host && isVercelProductionAliasHost(host)));
  attested.sort((left, right) => left.length - right.length || (left < right ? -1 : left > right ? 1 : 0));
  return attested[0] ?? null;
}

export type CurrentProductionHostProof = {
  attestedProductionHost?: string | null;
  verifiedCustomerHosts?: ReadonlyArray<string | null | undefined> | null;
  /** Temporary alias-read failure: keep a last-working 3-label provider host. */
  allowLastWorkingProvider?: boolean;
};

function verifiedCustomerHostSet(
  hosts: CurrentProductionHostProof["verifiedCustomerHosts"],
): Set<string> {
  const next = new Set<string>();
  for (const entry of hosts ?? []) {
    const host = normalizeDomainHostname(entry);
    if (host) next.add(host);
  }
  return next;
}

/**
 * Current production identity. A host counts only with live proof: the
 * attested same-project alias, a currently verified customer/branded host,
 * or — when the alias read is temporarily unknown — a last-working
 * 3-label provider host.
 */
export function selectCurrentProductionIdentityUrl(
  row: { url?: string | null; providerUrl?: string | null },
  proof: CurrentProductionHostProof = {},
): string | null {
  const urlHost = normalizeDomainHostname(row.url);
  if (urlHost && isCurrentProductionSiteHost(urlHost, proof)) return `https://${urlHost}`;
  const providerHost = normalizeDomainHostname(row.providerUrl);
  if (providerHost && isCurrentProductionSiteHost(providerHost, proof)) {
    return `https://${providerHost}`;
  }
  return null;
}

export function isCurrentProductionSiteHost(
  value: string | null | undefined,
  proof: CurrentProductionHostProof = {},
): boolean {
  const host = normalizeDomainHostname(value);
  if (!host || isGitPreviewVercelHost(host)) return false;
  if (verifiedCustomerHostSet(proof.verifiedCustomerHosts).has(host)) return true;
  const attested = normalizeDomainHostname(proof.attestedProductionHost);
  if (attested && host === attested) return true;
  return Boolean(proof.allowLastWorkingProvider && isProductionProviderVercelHost(host));
}

export function getBrandedLiveSiteDomain(): string | null {
  if (!isAffirmative(process.env.SAJTMASKIN_BRANDED_LIVE_URLS)) return null;
  return normalizeDomainHostname(process.env.SAJTMASKIN_LIVE_SITE_DOMAIN);
}

export function buildBrandedLiveDomain(
  slug: string,
  baseDomain = getBrandedLiveSiteDomain(),
): string | null {
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

export type PersistableDeploymentUrlParams = {
  /** Contract URL from this publish. Wins when present; may be custom. */
  policyUrl?: string | null;
  /** Already stored `deployments.url`. Kept when it is persist-safe. */
  existingUrl?: string | null;
  /** Provider URL only. Persisted when it is alias-shaped, never custom. */
  candidateUrl?: string | null;
  verifiedCustomerHosts?: CurrentProductionHostProof["verifiedCustomerHosts"];
};

function persistSafeHost(value: string | null | undefined): string | null {
  const host = normalizeDomainHostname(value);
  if (!host || isGitPreviewVercelHost(host) || isUniqueVercelDeploymentHost(host)) return null;
  return host;
}

/**
 * URL we may write to `deployments.url`. That column is last-working for the
 * next publish — never a dead custom from `resolveLiveUrl`, never unique/git.
 */
export function persistableDeploymentUrl(params: PersistableDeploymentUrlParams): string | null {
  if (params.policyUrl != null && params.policyUrl.trim() !== "") {
    const policyHost = normalizeDomainHostname(params.policyUrl);
    if (!policyHost || isGitPreviewVercelHost(policyHost)) return null;
    return `https://${policyHost}`;
  }

  const existingHost = persistSafeHost(params.existingUrl);
  if (existingHost) {
    if (isProductionProviderVercelHost(existingHost)) return `https://${existingHost}`;
    if (verifiedCustomerHostSet(params.verifiedCustomerHosts).has(existingHost)) {
      return `https://${existingHost}`;
    }
  }

  const candidateHost = persistSafeHost(params.candidateUrl);
  return candidateHost && isProductionProviderVercelHost(candidateHost)
    ? `https://${candidateHost}`
    : null;
}

export function resolveLiveUrl(params: {
  projectId?: string | null;
  versionId?: string | null;
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
    params.brandedDomainVerifiedAt &&
    resolveBrandedPilotEligibility({
      projectId: params.projectId,
      versionId: params.versionId,
    }).allowed
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

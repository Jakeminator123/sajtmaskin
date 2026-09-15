import { PLACEHOLDER_SITE_URL } from "@/lib/seo/audit";
import {
  isCanonicalHttpsProof,
  type CanonicalHttpsProofResult,
} from "@/lib/deploy/canonical-https-proof";
import {
  isCurrentProductionSiteHost,
  isGitPreviewVercelHost,
  normalizeDomainHostname,
  type CurrentProductionHostProof,
} from "@/lib/live-site-url";

export const CANONICAL_ADDRESS_FEATURE_ENV = "SAJTMASKIN_CANONICAL_ADDRESS_CONTRACT";
export const CANONICAL_SITE_URL_ENV = "NEXT_PUBLIC_SITE_URL";

const PLATFORM_HOSTS = new Set([
  "sajtmaskin.se",
  "www.sajtmaskin.se",
  "sajtmaskin.com",
  "www.sajtmaskin.com",
  "preview.sajtmaskin.se",
  "sajtmaskin.vercel.app",
  "sites.sajtmaskin.se",
]);

const METADATA_FILE_SUFFIXES = [
  "app/layout.tsx",
  "app/robots.ts",
  "app/sitemap.ts",
];

type DeployTextFile = { name: string; content: string };

export type CanonicalAddressActivationReason =
  | "feature_disabled"
  | "activation_not_ready"
  | "preview_protected"
  | "https_not_ready"
  | "https_unknown"
  | "https_invalid"
  | "provider_unknown"
  | "provider_invalid"
  | "identity_mismatch"
  | "same_host"
  | "missing_alias"
  | "platform_host"
  | "ready";

export type CanonicalAddressContract = {
  requested: boolean;
  enabled: boolean;
  activationReason: CanonicalAddressActivationReason;
  canonicalUrl: string | null;
  canonicalHost: string | null;
  providerHost: string | null;
  projectId: string;
  vercelProjectId: string;
  target: "production" | "preview";
  redirectReady: boolean;
  pendingAddress: string | null;
  usedLastWorkingIdentity: boolean;
};

export type CanonicalHostRedirectCandidate = {
  canonicalUrl: string;
  providerHost: string;
  projectId: string;
  vercelProjectId: string;
  target: "production";
};

export type CanonicalAddressDeployIdentity = {
  projectId: string;
  vercelProjectId: string;
  target: "production" | "preview";
};

export type CanonicalAddressPreparation = {
  contract: CanonicalAddressContract;
  hostRedirectCandidate: CanonicalHostRedirectCandidate | null;
  envVars: Record<string, string>;
  warnings: string[];
};

export type CanonicalAddressProofInput = {
  featureRequested: boolean;
  projectId: string;
  vercelProjectId: string;
  target: "production" | "preview";
  verifiedLiveUrl: string | null;
  verifiedProviderDomain: string | null;
  verifiedCustomerHosts?: ReadonlyArray<string | null | undefined> | null;
  lastWorkingCanonicalUrl?: string | null;
  lastWorkingProviderHost?: string | null;
  httpsProof?: CanonicalHttpsProofResult | null;
  providerAliasStatus?: "attested" | "unknown" | "missing";
  configuredEnv: Record<string, string>;
};

function isAffirmative(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function isCanonicalAddressContractEnabled(
  value = process.env[CANONICAL_ADDRESS_FEATURE_ENV],
): boolean {
  return isAffirmative(value);
}

export function isProtectedPlatformHost(hostname: string | null | undefined): boolean {
  const host = normalizeDomainHostname(hostname);
  return Boolean(host && PLATFORM_HOSTS.has(host));
}

function normalizeHttpsOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const host = normalizeDomainHostname(url.hostname);
    if (!host || isProtectedPlatformHost(host) || isGitPreviewVercelHost(host)) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

function normalizeBareHostname(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (
    !raw ||
    raw !== value.trim() ||
    raw.includes(":") ||
    raw.includes("/") ||
    raw.includes("@") ||
    raw.includes("?") ||
    raw.includes("#")
  ) {
    return null;
  }
  const host = normalizeDomainHostname(raw);
  return host && !isProtectedPlatformHost(host) && !isGitPreviewVercelHost(host) ? host : null;
}

function normalizeCandidateHttpsOrigin(value: string): string | null {
  const raw = value.trim();
  if (raw !== value || !/^https:\/\//i.test(raw)) return null;
  return normalizeHttpsOrigin(raw);
}

function isExactIdentity(value: string): boolean {
  return Boolean(value) && value === value.trim();
}

function originHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function envConflictWarning(configured: string, policy: string): string {
  return (
    `Kundens ${CANONICAL_SITE_URL_ENV} (${configured}) skiljer sig från den verifierade ` +
    `adresspolicyn (${policy}). Den verifierade adressen används i bygget.`
  );
}

function proofMatchesIdentity(
  proof: CanonicalHttpsProofResult | null | undefined,
  projectId: string,
  vercelProjectId: string,
  canonicalUrl: string,
): proof is Extract<CanonicalHttpsProofResult, { status: "ready" }> {
  if (!proof || proof.status !== "ready") return false;
  if (!isCanonicalHttpsProof(proof.proof)) return false;
  return (
    Boolean(vercelProjectId) &&
    proof.proof.projectId === projectId &&
    proof.proof.vercelProjectId === vercelProjectId &&
    proof.proof.origin === canonicalUrl &&
    proof.proof.hostname === originHost(canonicalUrl)
  );
}

function providerOrigin(host: string | null): string | null {
  return host ? `https://${host}` : null;
}

function productionHostProof(
  attestedProductionHost: string | null | undefined,
  verifiedCustomerHosts?: CanonicalAddressProofInput["verifiedCustomerHosts"],
  allowLastWorkingProvider = false,
): CurrentProductionHostProof {
  return {
    attestedProductionHost,
    verifiedCustomerHosts,
    allowLastWorkingProvider,
  };
}

function usablePolicyUrl(
  url: string | null | undefined,
  proof: CurrentProductionHostProof = {},
): string | null {
  const origin = normalizeHttpsOrigin(url);
  if (!origin) return null;
  const host = originHost(origin);
  if (!host || isProtectedPlatformHost(host)) return null;
  return isCurrentProductionSiteHost(host, proof) ? origin : null;
}

export function shouldProbeCanonicalHttps(params: {
  featureRequested: boolean;
  target: "production" | "preview";
  verifiedLiveUrl: string | null;
  attestedProviderHost: string | null;
}): boolean {
  if (!params.featureRequested || params.target !== "production") return false;
  const liveHost = originHost(normalizeHttpsOrigin(params.verifiedLiveUrl));
  const canonical = usablePolicyUrl(
    params.verifiedLiveUrl,
    productionHostProof(params.attestedProviderHost, liveHost ? [liveHost] : null),
  );
  const provider = normalizeBareHostname(params.attestedProviderHost);
  const host = originHost(canonical);
  return Boolean(canonical && provider && host && host !== provider && !isProtectedPlatformHost(provider));
}

function lastWorkingRedirectCandidate(
  params: CanonicalAddressProofInput,
  lastWorkingUrl: string | null,
  lastWorkingProvider: string | null,
): CanonicalHostRedirectCandidate | null {
  if (!params.featureRequested || params.target !== "production") return null;
  if (!isExactIdentity(params.projectId) || !isExactIdentity(params.vercelProjectId)) return null;
  const proof = productionHostProof(
    params.providerAliasStatus === "attested"
      ? normalizeBareHostname(params.verifiedProviderDomain)
      : null,
    params.verifiedCustomerHosts,
    params.providerAliasStatus === "unknown",
  );
  const canonicalUrl = usablePolicyUrl(lastWorkingUrl, proof);
  const providerHost = normalizeBareHostname(lastWorkingProvider);
  const host = originHost(canonicalUrl);
  if (!canonicalUrl || !providerHost || !host || host === providerHost) return null;
  if (isProtectedPlatformHost(providerHost)) return null;
  return {
    canonicalUrl,
    providerHost,
    projectId: params.projectId,
    vercelProjectId: params.vercelProjectId,
    target: "production",
  };
}

function closedPreparation(
  contract: CanonicalAddressContract,
  envVars: Record<string, string>,
  warnings: string[],
  hostRedirectCandidate: CanonicalHostRedirectCandidate | null = null,
): CanonicalAddressPreparation {
  return {
    contract: {
      ...contract,
      redirectReady: Boolean(hostRedirectCandidate),
      enabled: contract.enabled,
    },
    hostRedirectCandidate,
    envVars,
    warnings,
  };
}

/**
 * Build the shared address policy for this deploy. SITE_URL comes from the
 * verified project identity even when the redirect flag and SEO copy are off.
 * A free env value never becomes the redirect target. Redirects stay closed
 * unless the flag, same-project HTTPS proof and attested production alias
 * all hold.
 */
export function prepareCanonicalAddressContract(
  params: CanonicalAddressProofInput,
): CanonicalAddressPreparation {
  const envVars = { ...params.configuredEnv };
  const warnings: string[] = [];
  const requested = params.featureRequested;
  const aliasStatus = params.providerAliasStatus ?? "missing";
  const attestedProvider = aliasStatus === "attested"
    ? normalizeBareHostname(params.verifiedProviderDomain)
    : null;
  const hostProof = productionHostProof(
    attestedProvider,
    params.verifiedCustomerHosts,
    aliasStatus === "unknown",
  );
  const attestedOrigin = providerOrigin(attestedProvider);
  const attemptedUrl = normalizeHttpsOrigin(params.verifiedLiveUrl);
  const candidateUrl = usablePolicyUrl(params.verifiedLiveUrl, hostProof);
  const lastWorkingUrl = usablePolicyUrl(params.lastWorkingCanonicalUrl, hostProof);
  const lastWorkingProvider = normalizeBareHostname(params.lastWorkingProviderHost);
  const proof = params.httpsProof;
  const proofUnknown = proof?.status === "not_ready" && proof.verdict === "unknown";
  const proofInvalid = proof?.status === "not_ready" && proof.verdict === "invalid";

  let policyUrl: string | null = null;
  let pendingAddress: string | null = null;
  let usedLastWorkingIdentity = false;

  // 1. verified customer domain (only with valid HTTPS)  2. attested
  // production alias  3. last-working provider while the alias read is
  // unknown  4. keep env. Never invent an origin. Unknown proof/alias
  // must not promote the unproven custom candidate.
  if (proofUnknown || aliasStatus === "unknown") {
    policyUrl = lastWorkingUrl ?? attestedOrigin;
    usedLastWorkingIdentity = Boolean(lastWorkingUrl && policyUrl === lastWorkingUrl);
  } else if (proofInvalid) {
    const keptLastWorking = lastWorkingUrl && lastWorkingUrl !== candidateUrl ? lastWorkingUrl : null;
    policyUrl = keptLastWorking ?? attestedOrigin;
    usedLastWorkingIdentity = Boolean(keptLastWorking && policyUrl === keptLastWorking);
  } else {
    policyUrl = candidateUrl ?? attestedOrigin ?? lastWorkingUrl;
    usedLastWorkingIdentity = Boolean(
      !candidateUrl && !attestedOrigin && lastWorkingUrl && policyUrl === lastWorkingUrl,
    );
  }

  policyUrl = usablePolicyUrl(policyUrl, hostProof);
  pendingAddress = attemptedUrl && attemptedUrl !== policyUrl ? attemptedUrl : null;

  const configuredSiteUrl = params.configuredEnv[CANONICAL_SITE_URL_ENV];
  if (policyUrl) {
    if (configuredSiteUrl && normalizeHttpsOrigin(configuredSiteUrl) !== policyUrl) {
      warnings.push(envConflictWarning(configuredSiteUrl, policyUrl));
    }
    envVars[CANONICAL_SITE_URL_ENV] = policyUrl;
  } else if (configuredSiteUrl) {
    warnings.push(
      `Kundens ${CANONICAL_SITE_URL_ENV} behålls i bygget men används inte som kanonisk adress ` +
        "eller redirectmål eftersom den inte kommer från verifierad projektidentitet.",
    );
  }

  const canonicalUrl = policyUrl;
  const canonicalHost = originHost(canonicalUrl);
  const providerHost = attestedProvider ?? lastWorkingProvider;
  let activationReason: CanonicalAddressActivationReason = requested
    ? "activation_not_ready"
    : "feature_disabled";
  if (params.target === "preview") {
    activationReason = requested ? "preview_protected" : "feature_disabled";
  } else if (proofUnknown) {
    activationReason = proof?.reason === "provider_unknown" ? "provider_unknown" : "https_unknown";
  } else if (proofInvalid) {
    activationReason = proof?.reason === "provider_invalid" ? "provider_invalid" : "https_invalid";
  } else if (aliasStatus === "unknown" && requested) {
    activationReason = "provider_unknown";
  }

  const baseContract: CanonicalAddressContract = {
    requested,
    enabled: false,
    activationReason,
    canonicalUrl,
    canonicalHost,
    providerHost,
    projectId: params.projectId,
    vercelProjectId: params.vercelProjectId,
    target: params.target,
    redirectReady: false,
    pendingAddress,
    usedLastWorkingIdentity,
  };

  const preservedRedirect = lastWorkingRedirectCandidate(
    params,
    lastWorkingUrl,
    lastWorkingProvider,
  );

  if (!requested) {
    return closedPreparation(baseContract, envVars, warnings);
  }
  if (params.target !== "production") {
    return closedPreparation(
      { ...baseContract, activationReason: "preview_protected" },
      envVars,
      warnings,
    );
  }
  if (!isExactIdentity(params.projectId) || !isExactIdentity(params.vercelProjectId)) {
    return closedPreparation(
      { ...baseContract, activationReason: "identity_mismatch" },
      envVars,
      warnings,
    );
  }
  if (aliasStatus === "unknown") {
    return closedPreparation(
      {
        ...baseContract,
        activationReason: "provider_unknown",
        usedLastWorkingIdentity: Boolean(lastWorkingUrl),
      },
      envVars,
      warnings,
      preservedRedirect,
    );
  }
  if (!attestedProvider || aliasStatus === "missing") {
    return closedPreparation(
      { ...baseContract, activationReason: "missing_alias" },
      envVars,
      warnings,
      preservedRedirect,
    );
  }
  if (!canonicalUrl || !canonicalHost) {
    return closedPreparation(
      { ...baseContract, activationReason: "activation_not_ready" },
      envVars,
      warnings,
      preservedRedirect,
    );
  }
  if (canonicalHost === attestedProvider) {
    return closedPreparation(
      { ...baseContract, activationReason: "same_host", providerHost: attestedProvider },
      envVars,
      warnings,
    );
  }
  if (isProtectedPlatformHost(canonicalHost) || isProtectedPlatformHost(attestedProvider)) {
    return closedPreparation(
      { ...baseContract, activationReason: "platform_host" },
      envVars,
      warnings,
    );
  }
  if (!proofMatchesIdentity(proof, params.projectId, params.vercelProjectId, canonicalUrl)) {
    const reason = proof?.status === "not_ready"
      ? proof.verdict === "unknown"
        ? proof.reason === "provider_unknown"
          ? "provider_unknown"
          : "https_unknown"
        : proof.reason === "provider_invalid"
          ? "provider_invalid"
          : "https_invalid"
      : "https_not_ready";
    return closedPreparation(
      { ...baseContract, activationReason: reason, pendingAddress: attemptedUrl ?? pendingAddress },
      envVars,
      warnings,
      preservedRedirect,
    );
  }

  const hostRedirectCandidate: CanonicalHostRedirectCandidate = {
    canonicalUrl,
    providerHost: attestedProvider,
    projectId: params.projectId,
    vercelProjectId: params.vercelProjectId,
    target: "production",
  };
  return {
    contract: {
      ...baseContract,
      enabled: true,
      redirectReady: true,
      activationReason: "ready",
      providerHost: attestedProvider,
      pendingAddress: null,
      usedLastWorkingIdentity: false,
    },
    hostRedirectCandidate,
    envVars,
    warnings,
  };
}

function isManagedProviderRedirect(value: unknown, providerHost: string): boolean {
  if (!value || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  if (rule.source !== "/:path*" || rule.permanent !== false) return false;
  if (typeof rule.destination !== "string" || !rule.destination.endsWith("/:path*")) return false;
  if (Array.isArray(rule.missing) && rule.missing.length > 0) return false;
  const conditions = Array.isArray(rule.has) ? rule.has : [];
  if (conditions.length !== 1) return false;
  const condition = conditions[0];
  if (!condition || typeof condition !== "object") return false;
  const item = condition as Record<string, unknown>;
  if (item.type !== "host" || !item.value || typeof item.value !== "object") return false;
  const match = item.value as Record<string, unknown>;
  return match.eq === providerHost;
}

function isManagedNoindexHeader(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const header = value as { key?: unknown; value?: unknown };
  return header.key === "X-Robots-Tag" && typeof header.value === "string" && header.value.includes("noindex");
}

function matchesManagedNoindexHost(rule: Record<string, unknown>, providerHost: string | null): boolean {
  if (rule.source !== "/:path*") return false;
  const conditions = Array.isArray(rule.has) ? rule.has : [];
  if (conditions.length === 0) {
    return providerHost === null;
  }
  if (conditions.length !== 1 || !providerHost) return false;
  const condition = conditions[0];
  if (!condition || typeof condition !== "object") return false;
  const item = condition as Record<string, unknown>;
  if (item.type !== "host" || !item.value || typeof item.value !== "object") return false;
  return (item.value as { eq?: unknown }).eq === providerHost;
}

function isManagedProviderNoindex(value: unknown, providerHost: string | null): boolean {
  if (!value || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  const headers = Array.isArray(rule.headers) ? rule.headers : [];
  return headers.some(isManagedNoindexHeader) && matchesManagedNoindexHost(rule, providerHost);
}

/** Remove only our X-Robots-Tag. Keep the rule when other headers remain. */
function stripManagedNoindexRule(value: unknown, providerHost: string | null): unknown | null {
  if (!isManagedProviderNoindex(value, providerHost) || !value || typeof value !== "object") {
    return value;
  }
  const rule = value as Record<string, unknown>;
  const headers = (Array.isArray(rule.headers) ? rule.headers : []).filter(
    (header) => !isManagedNoindexHeader(header),
  );
  if (headers.length === 0) return null;
  return { ...rule, headers };
}

function isExactIdentityPair(
  candidate: CanonicalHostRedirectCandidate,
  deployIdentity: CanonicalAddressDeployIdentity,
): boolean {
  return (
    isExactIdentity(candidate.projectId) &&
    isExactIdentity(candidate.vercelProjectId) &&
    isExactIdentity(deployIdentity.projectId) &&
    isExactIdentity(deployIdentity.vercelProjectId) &&
    candidate.projectId === deployIdentity.projectId &&
    candidate.vercelProjectId === deployIdentity.vercelProjectId
  );
}

function validateCanonicalHostRedirectCandidate(
  candidate: CanonicalHostRedirectCandidate,
  deployIdentity: CanonicalAddressDeployIdentity,
):
  | { candidate: CanonicalHostRedirectCandidate; warning: null }
  | { candidate: null; warning: string } {
  if (!isExactIdentityPair(candidate, deployIdentity)) {
    return {
      candidate: null,
      warning:
        "Host-omdirigeringen aktiverades inte eftersom kandidatens projektidentitet inte matchar den aktuella deployen.",
    };
  }
  if (candidate.target !== "production" || deployIdentity.target !== "production") {
    return {
      candidate: null,
      warning: "Host-omdirigeringen aktiverades inte eftersom den kräver en produktionsdeploy.",
    };
  }

  const canonicalUrl = normalizeCandidateHttpsOrigin(candidate.canonicalUrl);
  if (!canonicalUrl) {
    return {
      candidate: null,
      warning:
        "Host-omdirigeringen aktiverades inte eftersom den kanoniska URL:en inte är en giltig HTTPS-origin.",
    };
  }
  const providerHost = normalizeBareHostname(candidate.providerHost);
  if (!providerHost) {
    return {
      candidate: null,
      warning:
        "Host-omdirigeringen aktiverades inte eftersom provider-hosten inte är ett giltigt bart värdnamn.",
    };
  }
  if (new URL(canonicalUrl).hostname === providerHost) {
    return {
      candidate: null,
      warning:
        "Host-omdirigeringen aktiverades inte eftersom kanonisk host och provider-host är samma värd.",
    };
  }

  return {
    candidate: { ...candidate, canonicalUrl, providerHost },
    warning: null,
  };
}

function parseVercelConfig(files: DeployTextFile[]): {
  config: Record<string, unknown>;
  configIndex: number;
  warning: string | null;
} {
  const configIndexes = files.flatMap((file, index) =>
    file.name.replace(/^\/+/, "") === "vercel.json" ? [index] : [],
  );
  if (configIndexes.length > 1) {
    return {
      config: {},
      configIndex: -1,
      warning:
        "Host-omdirigeringen aktiverades inte eftersom deployen innehåller flera root-ekvivalenta vercel.json-filer.",
    };
  }
  if (files.some((file) => ["vercel.ts", "vercel.toml"].includes(file.name.replace(/^\/+/, "")))) {
    return {
      config: {},
      configIndex: -1,
      warning:
        "Host-omdirigeringen aktiverades inte eftersom projektet redan använder vercel.ts eller vercel.toml.",
    };
  }
  const configIndex = configIndexes[0] ?? -1;
  if (configIndex < 0) return { config: {}, configIndex: -1, warning: null };
  try {
    const parsed = JSON.parse(files[configIndex].content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
    const config = parsed as Record<string, unknown>;
    if ("redirects" in config && !Array.isArray(config.redirects)) throw new Error("redirects");
    if ("headers" in config && !Array.isArray(config.headers)) throw new Error("headers");
    return { config, configIndex, warning: null };
  } catch {
    return {
      config: {},
      configIndex,
      warning:
        "Host-omdirigeringen aktiverades inte eftersom befintlig vercel.json inte kunde slås ihop säkert.",
    };
  }
}

function writeVercelConfig(
  files: DeployTextFile[],
  configIndex: number,
  config: Record<string, unknown>,
): DeployTextFile[] {
  const nextConfig = `${JSON.stringify(config, null, 2)}\n`;
  const nextFiles = [...files];
  if (configIndex >= 0) {
    nextFiles[configIndex] = { ...nextFiles[configIndex], content: nextConfig };
  } else {
    nextFiles.push({ name: "vercel.json", content: nextConfig });
  }
  return nextFiles;
}

/**
 * Merge the temporary provider-host 307 and provider-only noindex into static
 * Vercel config. Existing JSON fields and customer redirects/headers are
 * preserved. Invalid or competing config fails closed.
 */
export function applyCanonicalHostRedirect(
  files: DeployTextFile[],
  candidate: CanonicalHostRedirectCandidate | null,
  deployIdentity: CanonicalAddressDeployIdentity,
  options?: { noindexHost?: string | null; previewNoindex?: boolean; primaryHost?: string | null },
): { files: DeployTextFile[]; warnings: string[]; applied: boolean; noindexApplied: boolean } {
  const previewNoindex = options?.previewNoindex === true && deployIdentity.target === "preview";
  const primaryHost = normalizeBareHostname(options?.primaryHost ?? null);
  const requestedNoindexHost = previewNoindex
    ? null
    : normalizeBareHostname(options?.noindexHost ?? null);
  const noindexHost =
    requestedNoindexHost && requestedNoindexHost !== primaryHost ? requestedNoindexHost : null;
  const wantsNoindex = previewNoindex || Boolean(noindexHost);

  let validated: CanonicalHostRedirectCandidate | null = null;
  if (candidate !== null) {
    const result = validateCanonicalHostRedirectCandidate(candidate, deployIdentity);
    if (!result.candidate) {
      return { files, warnings: [result.warning], applied: false, noindexApplied: false };
    }
    validated = result.candidate;
  }

  if (!validated && !wantsNoindex) {
    return { files, warnings: [], applied: false, noindexApplied: false };
  }

  const parsed = parseVercelConfig(files);
  if (parsed.warning) {
    return { files, warnings: [parsed.warning], applied: false, noindexApplied: false };
  }

  const config = { ...parsed.config };
  let applied = false;
  let noindexApplied = false;

  if (validated) {
    const existingRedirects = Array.isArray(config.redirects) ? config.redirects : [];
    const redirects = existingRedirects.filter(
      (redirect) => !isManagedProviderRedirect(redirect, validated.providerHost),
    );
    redirects.unshift({
      source: "/:path*",
      has: [{ type: "host", value: { eq: validated.providerHost } }],
      destination: `${validated.canonicalUrl}/:path*`,
      permanent: false,
    });
    config.redirects = redirects;
    applied = true;
  }

  const noindexTarget = validated ? validated.providerHost : noindexHost;
  const skipNoindexOnPrimary =
    Boolean(validated && noindexTarget === new URL(validated.canonicalUrl).hostname);
  if ((previewNoindex || noindexTarget) && !skipNoindexOnPrimary) {
    const existingHeaders = Array.isArray(config.headers) ? config.headers : [];
    const headers = existingHeaders
      .map((header) => stripManagedNoindexRule(header, previewNoindex ? null : noindexTarget))
      .filter((header): header is NonNullable<typeof header> => header != null);
    const rule: Record<string, unknown> = {
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
    };
    if (!previewNoindex && noindexTarget) {
      rule.has = [{ type: "host", value: { eq: noindexTarget } }];
    }
    headers.unshift(rule);
    config.headers = headers;
    noindexApplied = true;
  }

  return {
    files: writeVercelConfig(files, parsed.configIndex, config),
    warnings: [],
    applied,
    noindexApplied,
  };
}

function isMetadataPath(name: string): boolean {
  const normalized = name.replace(/^\/+/, "").replace(/\\/g, "/");
  return METADATA_FILE_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`/${suffix}`),
  );
}

/**
 * Rewrite leftover example.com placeholders in existing metadata files so
 * changing only the scaffold default is not the only path to a real address.
 */
export function applyCanonicalMetadataToFiles(
  files: DeployTextFile[],
  canonicalUrl: string | null,
): { files: DeployTextFile[]; rewritten: string[] } {
  const origin = normalizeHttpsOrigin(canonicalUrl);
  const rewritten: string[] = [];
  const next = files.map((file) => {
    if (!isMetadataPath(file.name) || !file.content.includes(PLACEHOLDER_SITE_URL)) {
      return file;
    }
    rewritten.push(file.name);
    if (origin) {
      return { ...file, content: file.content.split(PLACEHOLDER_SITE_URL).join(origin) };
    }
    return {
      ...file,
      content: file.content
        .replaceAll(` || "${PLACEHOLDER_SITE_URL}"`, "")
        .replaceAll(` || '${PLACEHOLDER_SITE_URL}'`, "")
        .split(PLACEHOLDER_SITE_URL)
        .join(""),
    };
  });
  return { files: next, rewritten };
}

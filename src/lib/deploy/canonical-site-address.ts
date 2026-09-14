import { normalizeDomainHostname } from "@/lib/live-site-url";

export const CANONICAL_ADDRESS_FEATURE_ENV = "SAJTMASKIN_CANONICAL_ADDRESS_CONTRACT";

type DeployTextFile = { name: string; content: string };

export type CanonicalAddressContract = {
  requested: boolean;
  enabled: false;
  activationReason: "feature_disabled" | "activation_not_ready";
  canonicalUrl: string | null;
  canonicalHost: string | null;
  providerHost: string | null;
  projectId: string;
  vercelProjectId: string;
  target: "production" | "preview";
  redirectReady: false;
};

/**
 * Standalone transform input; A3 never emits a candidate. A4 may create one
 * only after server-trusted HTTPS and exact same-project production-alias proof.
 */
export type CanonicalHostRedirectCandidate = {
  canonicalUrl: string;
  providerHost: string;
  projectId: string;
  vercelProjectId: string;
  target: "production";
};

export type CanonicalAddressPreparation = {
  contract: CanonicalAddressContract;
  hostRedirectCandidate: null;
  envVars: Record<string, string>;
  warnings: string[];
};

function isAffirmative(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function isCanonicalAddressContractEnabled(
  value = process.env[CANONICAL_ADDRESS_FEATURE_ENV],
): boolean {
  return isAffirmative(value);
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
    return host ? `https://${host}` : null;
  } catch {
    return null;
  }
}

/**
 * Record the canonical project identity while keeping A3 activation closed.
 * The caller obtains URLs from the canonical project/Vercel owners; this
 * preparation preserves configured customer env and never emits a redirect.
 */
export function prepareCanonicalAddressContract(params: {
  featureRequested: boolean;
  projectId: string;
  vercelProjectId: string;
  target: "production" | "preview";
  verifiedLiveUrl: string | null;
  verifiedProviderDomain: string | null;
  configuredEnv: Record<string, string>;
}): CanonicalAddressPreparation {
  // A3 prepares the shared contract only. A4 must replace this closed
  // activation with server-trusted HTTPS proof and an exact production alias
  // attested for the same Vercel project. An env flag alone can never activate
  // generated redirects or mutate a customer's build env.
  const envVars = { ...params.configuredEnv };
  const canonicalUrl = normalizeHttpsOrigin(params.verifiedLiveUrl);
  const canonicalHost = canonicalUrl ? new URL(canonicalUrl).hostname : null;
  const providerHost = normalizeDomainHostname(params.verifiedProviderDomain);
  const contract: CanonicalAddressContract = {
    requested: params.featureRequested,
    enabled: false,
    activationReason: params.featureRequested ? "activation_not_ready" : "feature_disabled",
    canonicalUrl,
    canonicalHost,
    providerHost,
    projectId: params.projectId,
    vercelProjectId: params.vercelProjectId,
    target: params.target,
    redirectReady: false,
  };
  return { contract, hostRedirectCandidate: null, envVars, warnings: [] };
}

function isManagedProviderRedirect(value: unknown, candidate: CanonicalHostRedirectCandidate): boolean {
  if (!value || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  if (
    Object.keys(rule).length !== 4 ||
    rule.source !== "/:path*" ||
    rule.destination !== `${candidate.canonicalUrl}/:path*` ||
    rule.permanent !== false
  ) {
    return false;
  }
  const conditions = Array.isArray(rule.has) ? rule.has : [];
  if (conditions.length !== 1) return false;
  const condition = conditions[0];
  if (!condition || typeof condition !== "object") return false;
  const item = condition as Record<string, unknown>;
  if (
    Object.keys(item).length !== 2 ||
    item.type !== "host" ||
    !item.value ||
    typeof item.value !== "object"
  ) {
    return false;
  }
  const match = item.value as Record<string, unknown>;
  return Object.keys(match).length === 1 && match.eq === candidate.providerHost;
}

/**
 * Merge the temporary provider-host redirect into static Vercel config.
 * Existing JSON fields and customer redirects are preserved. Invalid or
 * competing config formats fail closed and surface a warning instead of
 * replacing a customer's hosting configuration.
 */
export function applyCanonicalHostRedirect(
  files: DeployTextFile[],
  candidate: CanonicalHostRedirectCandidate | null,
): { files: DeployTextFile[]; warnings: string[]; applied: boolean } {
  if (candidate === null) {
    return { files, warnings: [], applied: false };
  }

  const configIndex = files.findIndex((file) => file.name.replace(/^\/+/, "") === "vercel.json");
  if (files.some((file) => ["vercel.ts", "vercel.toml"].includes(file.name.replace(/^\/+/, "")))) {
    return {
      files,
      warnings: [
        "Host-omdirigeringen aktiverades inte eftersom projektet redan använder vercel.ts eller vercel.toml.",
      ],
      applied: false,
    };
  }

  let config: Record<string, unknown> = {};
  if (configIndex >= 0) {
    try {
      const parsed = JSON.parse(files[configIndex].content) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
      config = parsed as Record<string, unknown>;
      if ("redirects" in config && !Array.isArray(config.redirects)) throw new Error("redirects");
    } catch {
      return {
        files,
        warnings: [
          "Host-omdirigeringen aktiverades inte eftersom befintlig vercel.json inte kunde slås ihop säkert.",
        ],
        applied: false,
      };
    }
  }

  const existingRedirects = Array.isArray(config.redirects) ? config.redirects : [];
  const redirects = existingRedirects.filter(
    (redirect) => !isManagedProviderRedirect(redirect, candidate),
  );
  redirects.unshift({
    source: "/:path*",
    has: [{ type: "host", value: { eq: candidate.providerHost } }],
    destination: `${candidate.canonicalUrl}/:path*`,
    permanent: false,
  });
  const nextConfig = `${JSON.stringify({ ...config, redirects }, null, 2)}\n`;
  const nextFiles = [...files];
  if (configIndex >= 0) {
    nextFiles[configIndex] = { ...nextFiles[configIndex], content: nextConfig };
  } else {
    nextFiles.push({ name: "vercel.json", content: nextConfig });
  }
  return { files: nextFiles, warnings: [], applied: true };
}

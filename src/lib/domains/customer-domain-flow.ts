/**
 * C2 customer-domain flow: link, inspect, verify, activate, unlink.
 *
 * `app_projects.custom_domain` is canonical. `deployments.domain` is only
 * updated after a successful activate so it cannot become authority.
 * Provider IDs never leave this module in customer-facing payloads.
 */

import {
  fetchWithPinnedDns,
  PINNED_ADDRESS_BLOCKED_MESSAGE,
} from "@/lib/capture/pinned-fetch";
import {
  automaticDnsConnector,
  customerHostPair,
  humanDomainStatus,
  HUMAN_DOMAIN_STATUS_SV,
  normalizeObservedDomain,
  type CustomerDomainSnapshot,
  type DnsRecord,
  type DomainHttpsStatus,
  type DomainObservation,
  type HostCheck,
} from "@/lib/domains/domain-observation";
import {
  addDomainToProject,
  removeDomainFromProject,
  updateProjectDomainRedirect,
} from "@/lib/vercel/vercel-client";
import { observeVercelDomain } from "@/lib/vercel/domain-observation";
import {
  clearProjectCustomDomain,
  clearProjectCustomDomainVerification,
  getProjectById,
  setProjectCustomDomainCandidate,
  setProjectVerifiedCustomDomain,
} from "@/lib/db/services/projects";
import { setLatestDeploymentLiveUrlForChat } from "@/lib/deployment";
import { getVercelToken } from "@/lib/vercel";

const HTTPS_TIMEOUT_MS = 8_000;
const HTTPS_MAX_BODY_BYTES = 2_048;

export type { CustomerDomainSnapshot, HostCheck };

export type FlowFailure = {
  ok: false;
  status: number;
  error: string;
  snapshot?: CustomerDomainSnapshot;
};

export type FlowSuccess = {
  ok: true;
  snapshot: CustomerDomainSnapshot;
};

export type FlowResult = FlowSuccess | FlowFailure;

export type ResolvedHosting = {
  vercelProjectId: string;
  appProjectId: string;
  chatId: string | null;
};

function teamId(): string | undefined {
  const value = process.env.VERCEL_TEAM_ID?.trim();
  return value || undefined;
}

export async function checkCustomerHttps(hostname: string): Promise<DomainHttpsStatus> {
  try {
    const result = await fetchWithPinnedDns(`https://${hostname}/`, {
      method: "GET",
      timeoutMs: HTTPS_TIMEOUT_MS,
      maxBodyBytes: HTTPS_MAX_BODY_BYTES,
    });
    if (result.status >= 200 && result.status < 300) return "valid";
    if (result.status >= 400) return "invalid";
    return "invalid";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes(PINNED_ADDRESS_BLOCKED_MESSAGE)) return "invalid";
    if (/ENOTFOUND|CERT_|certificate|ERR_TLS|SSL|unable to verify/i.test(message)) {
      return "invalid";
    }
    return "unknown";
  }
}

function isFullyReady(host: HostCheck): boolean {
  return (
    host.connection === "connected" &&
    host.ownership === "verified" &&
    host.dns === "valid" &&
    host.https === "valid"
  );
}

function toHostCheck(
  observation: DomainObservation,
  https: DomainHttpsStatus,
  role: HostCheck["role"],
  isLivePrimary: boolean,
  paused: boolean,
): HostCheck {
  const withHttps = { ...observation, https };
  const status = humanDomainStatus({
    observation: withHttps,
    isLivePrimary,
    paused,
  });
  return {
    domain: observation.domain,
    role,
    connection: observation.connection,
    ownership: observation.ownership,
    dns: observation.dns,
    https,
    status,
    statusLabel: HUMAN_DOMAIN_STATUS_SV[status],
    records: observation.records,
  };
}

async function observeHost(vercelProjectId: string, domain: string): Promise<DomainObservation> {
  try {
    return await observeVercelDomain({
      projectId: vercelProjectId,
      domain,
      teamId: teamId(),
    });
  } catch {
    return {
      domain,
      connection: "unknown",
      ownership: "unknown",
      dns: "unknown",
      https: "unknown",
      activation: "not_started",
      records: [],
    };
  }
}

export async function inspectCustomerDomain(params: {
  hosting: ResolvedHosting;
  domain: string | null;
  checkHttps: boolean;
}): Promise<CustomerDomainSnapshot> {
  const project = await getProjectById(params.hosting.appProjectId);
  const stored = project?.custom_domain?.trim() || null;
  const storedVerified = Boolean(project?.custom_domain_verified_at);
  const publishedSlug = project?.published_slug?.trim() || null;
  const paused = !params.hosting.vercelProjectId;
  const target = params.domain || stored;

  if (!target) {
    return {
      primary: null,
      companion: null,
      liveDomain: storedVerified ? stored : null,
      candidateDomain: stored && !storedVerified ? stored : null,
      canActivate: false,
      canUnlink: Boolean(stored),
      redirectArmed: false,
      publishedSlug,
      slugLocked: Boolean(publishedSlug),
      automaticDns: automaticDnsConnector(),
      message: null,
    };
  }

  const pair = customerHostPair(target);
  const primaryName = stored && storedVerified && !params.domain ? stored : pair.entered;
  const companionName =
    !pair.www ? null : primaryName === pair.www ? pair.apex : pair.www;

  const [primaryObs, companionObs] = await Promise.all([
    observeHost(params.hosting.vercelProjectId, primaryName),
    companionName ? observeHost(params.hosting.vercelProjectId, companionName) : Promise.resolve(null),
  ]);

  const [primaryHttps, companionHttps] = params.checkHttps
    ? await Promise.all([
        checkCustomerHttps(primaryName),
        companionName ? checkCustomerHttps(companionName) : Promise.resolve("not_checked" as const),
      ])
    : (["not_checked", "not_checked"] as const);

  const primary = toHostCheck(
    primaryObs,
    primaryHttps,
    "primary",
    storedVerified && stored === primaryName,
    paused,
  );
  const companion = companionObs
    ? toHostCheck(
        companionObs,
        companionHttps,
        "redirect",
        false,
        paused,
      )
    : null;

  const bothReady = Boolean(companion && isFullyReady(primary) && isFullyReady(companion));
  const canActivate =
    isFullyReady(primary) && (!storedVerified || stored !== primaryName);

  return {
    primary,
    companion,
    liveDomain: storedVerified ? stored : null,
    candidateDomain: stored && !storedVerified ? stored : target !== stored ? target : null,
    canActivate,
    canUnlink: Boolean(stored),
    redirectArmed: bothReady,
    publishedSlug,
    slugLocked: Boolean(publishedSlug),
    automaticDns: automaticDnsConnector(),
    message: null,
  };
}

async function attachHost(
  vercelProjectId: string,
  domain: string,
): Promise<{ ok: true } | { ok: false; unknown: boolean; error: string }> {
  try {
    await addDomainToProject(vercelProjectId, domain, teamId());
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte koppla domänen.";
    const unknown = /502|503|500|timeout|network|fetch/i.test(message);
    return {
      ok: false,
      unknown,
      error: unknown
        ? "Hostingleverantören svarade inte. Försök igen — den tidigare adressen är oförändrad."
        : "Domänen kunde inte kopplas. Kontrollera att den inte redan används av en annan sajt.",
    };
  }
}

export async function linkCustomerDomain(params: {
  hosting: ResolvedHosting;
  domain: string;
}): Promise<FlowResult> {
  const normalized = normalizeObservedDomain(params.domain);
  if (!normalized.ok) {
    return { ok: false, status: 400, error: normalized.error };
  }

  const pair = customerHostPair(normalized.domain);
  const hosts = [pair.entered, pair.www && pair.www !== pair.entered ? pair.www : null].filter(
    (value): value is string => Boolean(value),
  );
  if (pair.apex !== pair.entered && !hosts.includes(pair.apex)) {
    hosts.push(pair.apex);
  }

  const attached: string[] = [];
  for (const host of hosts) {
    const result = await attachHost(params.hosting.vercelProjectId, host);
    if (!result.ok) {
      const snapshot = await inspectCustomerDomain({
        hosting: params.hosting,
        domain: normalized.domain,
        checkHttps: false,
      });
      snapshot.message = result.error;
      return {
        ok: false,
        status: result.unknown ? 503 : 502,
        error: result.error,
        snapshot,
      };
    }
    attached.push(host);
  }

  const project = await getProjectById(params.hosting.appProjectId);
  if (project && !project.custom_domain_verified_at) {
    try {
      await setProjectCustomDomainCandidate(params.hosting.appProjectId, pair.entered);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return { ok: false, status: 409, error: "Domänen är redan kopplad till ett annat projekt." };
      }
      throw error;
    }
  }

  const snapshot = await inspectCustomerDomain({
    hosting: params.hosting,
    domain: pair.entered,
    checkHttps: false,
  });
  snapshot.message =
    attached.length > 1
      ? "Domänen är kopplad. Lägg in DNS-posterna nedan. www och apex kopplas som par."
      : "Domänen är kopplad. Lägg in DNS-posterna nedan hos din registrar.";
  return { ok: true, snapshot };
}

export async function verifyCustomerDomain(params: {
  hosting: ResolvedHosting;
  domain: string;
}): Promise<FlowResult> {
  const normalized = normalizeObservedDomain(params.domain);
  if (!normalized.ok) {
    return { ok: false, status: 400, error: normalized.error };
  }

  let token: string;
  try {
    token = getVercelToken();
  } catch {
    return { ok: false, status: 503, error: "Hostingleverantören är inte konfigurerad." };
  }

  const query = teamId() ? `?teamId=${encodeURIComponent(teamId()!)}` : "";
  try {
    const verifyRes = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(params.hosting.vercelProjectId)}/domains/${encodeURIComponent(normalized.domain)}/verify${query}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!verifyRes.ok && verifyRes.status >= 500) {
      const snapshot = await inspectCustomerDomain({
        hosting: params.hosting,
        domain: normalized.domain,
        checkHttps: false,
      });
      snapshot.message = "Kunde inte kontrollera domänen just nu. Tidigare status gäller.";
      return { ok: true, snapshot };
    }
  } catch {
    const snapshot = await inspectCustomerDomain({
      hosting: params.hosting,
      domain: normalized.domain,
      checkHttps: false,
    });
    snapshot.message = "Kunde inte kontrollera domänen just nu. Tidigare status gäller.";
    return { ok: true, snapshot };
  }

  const snapshot = await inspectCustomerDomain({
    hosting: params.hosting,
    domain: normalized.domain,
    checkHttps: true,
  });

  const project = await getProjectById(params.hosting.appProjectId);
  const alreadyLive =
    Boolean(project?.custom_domain_verified_at) &&
    project?.custom_domain?.trim() === normalized.domain;

  if (snapshot.primary && isFullyReady(snapshot.primary) && !alreadyLive && !project?.custom_domain_verified_at) {
    const activated = await activateFromSnapshot(params.hosting, snapshot, normalized.domain);
    if (activated.ok) return activated;
  }

  snapshot.message = snapshot.primary
    ? snapshot.primary.status === "unknown"
      ? "Statusen är tillfälligt okänd. Den tidigare adressen är oförändrad."
      : null
    : null;
  return { ok: true, snapshot };
}

async function armRedirectIfReady(
  hosting: ResolvedHosting,
  snapshot: CustomerDomainSnapshot,
): Promise<void> {
  if (!snapshot.redirectArmed || !snapshot.primary || !snapshot.companion) return;
  try {
    await updateProjectDomainRedirect(
      hosting.vercelProjectId,
      snapshot.companion.domain,
      snapshot.primary.domain,
      teamId(),
    );
  } catch {
    // Redirect is an enhancement; the primary host already serves. Retry later.
  }
}

async function activateFromSnapshot(
  hosting: ResolvedHosting,
  snapshot: CustomerDomainSnapshot,
  domain: string,
): Promise<FlowResult> {
  if (!snapshot.primary || !isFullyReady(snapshot.primary) || snapshot.primary.domain !== domain) {
    return {
      ok: false,
      status: 409,
      error: "Domänen är inte redo att bli primäradress. Kontrollera DNS och HTTPS först.",
      snapshot,
    };
  }

  const project = await getProjectById(hosting.appProjectId);
  const previous = project?.custom_domain?.trim() || null;
  const previousVerified = Boolean(project?.custom_domain_verified_at);

  try {
    const saved = await setProjectVerifiedCustomDomain(hosting.appProjectId, domain);
    if (!saved) {
      return {
        ok: false,
        status: 500,
        error: "Adressbytet kunde inte sparas. Senaste fungerande adress är kvar.",
        snapshot,
      };
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return { ok: false, status: 409, error: "Domänen är redan kopplad till ett annat projekt." };
    }
    throw error;
  }

  if (hosting.chatId) {
    await setLatestDeploymentLiveUrlForChat(hosting.chatId, domain);
  }

  await armRedirectIfReady(hosting, snapshot);

  if (previous && previousVerified && previous !== domain && previous !== snapshot.companion?.domain) {
    const oldPair = customerHostPair(previous);
    const keep = new Set([domain, snapshot.companion?.domain].filter(Boolean));
    for (const host of [oldPair.entered, oldPair.apex, oldPair.www]) {
      if (!host || keep.has(host)) continue;
      const removed = await removeDomainFromProject(hosting.vercelProjectId, host, teamId()).catch(
        () => ({ removed: false, unknown: true }),
      );
      if (!removed.removed) {
        const next = await inspectCustomerDomain({ hosting, domain, checkHttps: true });
        next.message =
          "Nya adressen är primär, men den gamla kunde inte kopplas loss. Försök igen.";
        return { ok: true, snapshot: next };
      }
    }
  }

  const next = await inspectCustomerDomain({ hosting, domain, checkHttps: true });
  next.message = "Adressbytet är klart.";
  return { ok: true, snapshot: next };
}

export async function activateCustomerDomain(params: {
  hosting: ResolvedHosting;
  domain: string;
}): Promise<FlowResult> {
  const normalized = normalizeObservedDomain(params.domain);
  if (!normalized.ok) {
    return { ok: false, status: 400, error: normalized.error };
  }

  const snapshot = await inspectCustomerDomain({
    hosting: params.hosting,
    domain: normalized.domain,
    checkHttps: true,
  });

  if (snapshot.primary?.https !== "valid") {
    snapshot.message =
      snapshot.primary?.https === "unknown"
        ? "Statusen är tillfälligt okänd. Senaste fungerande adress är kvar."
        : "HTTPS är inte bevisat. Senaste fungerande adress är kvar.";
    return { ok: false, status: 409, error: snapshot.message, snapshot };
  }

  return activateFromSnapshot(params.hosting, snapshot, normalized.domain);
}

export async function unlinkCustomerDomain(params: {
  hosting: ResolvedHosting;
  domain?: string;
}): Promise<FlowResult> {
  const project = await getProjectById(params.hosting.appProjectId);
  const stored = project?.custom_domain?.trim() || null;
  const candidate = params.domain ? normalizeObservedDomain(params.domain) : null;
  const extra = candidate && candidate.ok ? candidate.domain : null;
  // A named host that is not the stored live domain is an unfinished swap —
  // detach only that pair. Do not take the current live address offline.
  const removingCandidateOnly = Boolean(extra && extra !== stored);

  const hosts = new Set<string>();
  for (const name of removingCandidateOnly ? [extra] : [stored, extra]) {
    if (!name) continue;
    const pair = customerHostPair(name);
    for (const host of [pair.entered, pair.apex, pair.www]) {
      if (host) hosts.add(host);
    }
  }

  if (hosts.size === 0) {
    const snapshot = await inspectCustomerDomain({
      hosting: params.hosting,
      domain: null,
      checkHttps: false,
    });
    return { ok: true, snapshot };
  }

  for (const host of hosts) {
    const result = await removeDomainFromProject(
      params.hosting.vercelProjectId,
      host,
      teamId(),
    ).catch(() => ({ removed: false, unknown: true }));
    if (!result.removed) {
      const snapshot = await inspectCustomerDomain({
        hosting: params.hosting,
        domain: stored ?? extra,
        checkHttps: false,
      });
      snapshot.message =
        "Kunde inte koppla loss hos hostingleverantören. Senaste fungerande adress är kvar. Försök igen.";
      return { ok: false, status: 503, error: snapshot.message, snapshot };
    }
  }

  if (stored && !removingCandidateOnly) {
    await clearProjectCustomDomainVerification(params.hosting.appProjectId, stored);
    await clearProjectCustomDomain(params.hosting.appProjectId);
  }
  const snapshot = await inspectCustomerDomain({
    hosting: params.hosting,
    domain: removingCandidateOnly ? stored : null,
    checkHttps: false,
  });
  snapshot.message = removingCandidateOnly
    ? "Den påbörjade domänen är bortkopplad. Den nuvarande adressen är oförändrad."
    : "Domänen är bortkopplad. Sajten använder Sajtmaskin-adressen eller den tekniska adressen.";
  return { ok: true, snapshot };
}

export function dnsInstructionRecords(snapshot: CustomerDomainSnapshot): DnsRecord[] {
  const seen = new Set<string>();
  const records: DnsRecord[] = [];
  for (const host of [snapshot.primary, snapshot.companion]) {
    if (!host) continue;
    for (const record of host.records) {
      const key = `${record.purpose}:${record.type}:${record.host}:${record.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push(record);
    }
  }
  return records;
}

/**
 * Read-only overview of one published site, for the customer portal.
 *
 * The portal needs two things the project row alone cannot answer: which
 * address is actually serving the site, and whether that address is the
 * customer's own, Sajtmaskin's branded host, or the raw provider fallback.
 *
 * Address PRIORITY is not re-implemented here. `resolveLiveUrl` owns it, and
 * this module only classifies the host it returned. Two copies of that
 * precedence would drift, and the one in the portal would be the one nobody
 * notices is wrong — the builder and the deploy route already read the shared
 * helper.
 *
 * `kind` exists because the portal must not present a `*.vercel.app` fallback
 * as a finished branded address. A customer who reads "din adress" and gets a
 * provider hostname has been told something untrue about their own site.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { resolveLegacyProviderUrl } from "@/app/api/v0/deployments/_route/legacy-provider-url";
import { db } from "@/lib/db/client";
import { appProjects, deployments, engineChats } from "@/lib/db/schema";
import { normalizeDomainHostname, resolveLiveUrl } from "@/lib/live-site-url";

/** Which kind of host is serving the site right now. */
export type SiteAddressKind = "custom" | "branded" | "provider" | "none";

/**
 * Publish state for the portal. `never_published` is distinct from `pending`:
 * the first means no deployment has ever existed, the second means one exists
 * but Vercel has not reported a terminal state yet.
 */
export type SitePublishState =
  | "never_published"
  | "pending"
  | "building"
  | "ready"
  | "error"
  | "cancelled";

export type SiteAddress = {
  liveUrl: string | null;
  kind: SiteAddressKind;
};

export type SiteOverview = {
  projectId: string;
  /** Engine chat that owns the publish history, or `null` before the first chat. */
  chatId: string | null;
  address: SiteAddress;
  state: SitePublishState;
  /** When the currently live deployment became ready. */
  liveAt: Date | null;
  /** Version behind the live deployment — the one a re-publish should target. */
  liveVersionId: string | null;
  /**
   * Newest deployment when it is still pending/building. The portal watches
   * this id over the existing SSE stream so a second charged republish cannot
   * start, and so "Bygger"/"Väntar" is not left on screen after the build ends.
   */
  latestDeploymentId: string | null;
  /** Slug reserved for the branded host. Stable once allocated. */
  publishedSlug: string | null;
  /** Branded host, and whether it is verified. Unverified never serves traffic. */
  brandedDomain: string | null;
  brandedDomainVerified: boolean;
  customDomain: string | null;
  customDomainVerified: boolean;
  /** Present once the project has published at least once. */
  vercelProjectId: string | null;
};

type AddressInput = {
  providerUrl?: string | null;
  brandedDomain?: string | null;
  brandedDomainVerifiedAt?: Date | string | null;
  customDomain?: string | null;
  customDomainVerifiedAt?: Date | string | null;
};

type OverviewProjectFields = Pick<
  AddressInput,
  "brandedDomain" | "brandedDomainVerifiedAt" | "customDomain" | "customDomainVerifiedAt"
>;

type OverviewReadyRow = {
  providerUrl?: string | null;
  url?: string | null;
};

/**
 * Classify the address `resolveLiveUrl` picked.
 *
 * Deliberately derived from the resolved host rather than from the same
 * conditions again, so the gate, the verification timestamps and the precedence
 * stay owned by one function.
 */
export function resolveSiteAddress(input: AddressInput): SiteAddress {
  const liveUrl = resolveLiveUrl(input);
  if (!liveUrl) return { liveUrl: null, kind: "none" };

  let host: string;
  try {
    host = new URL(liveUrl).hostname.toLowerCase();
  } catch {
    return { liveUrl: null, kind: "none" };
  }

  if (normalizeDomainHostname(input.customDomain) === host) {
    return { liveUrl, kind: "custom" };
  }
  if (normalizeDomainHostname(input.brandedDomain) === host) {
    return { liveUrl, kind: "branded" };
  }
  return { liveUrl, kind: "provider" };
}

/**
 * Address for the portal overview.
 *
 * `resolveLiveUrl` stays the only priority. This helper only fills
 * `providerUrl` from the legacy `deployments.url` column when the ready row
 * never got `providerUrl` written — older sites stored the vercel.app host
 * there. A verified custom/branded host is classified even without a ready
 * row, because `resolveLiveUrl` can already produce that URL from project
 * fields alone.
 */
export function resolveOverviewAddress(
  project: OverviewProjectFields,
  latestReady: OverviewReadyRow | null | undefined,
): SiteAddress {
  const storedProvider = latestReady?.providerUrl?.trim() || null;
  return resolveSiteAddress({
    providerUrl: storedProvider || resolveLegacyProviderUrl(latestReady?.url),
    brandedDomain: project.brandedDomain,
    brandedDomainVerifiedAt: project.brandedDomainVerifiedAt,
    customDomain: project.customDomain,
    customDomainVerifiedAt: project.customDomainVerifiedAt,
  });
}

/** Vercel-style ready states are already normalised into `deployments.status`. */
export function toPublishState(status: string | null | undefined): SitePublishState {
  switch ((status ?? "").toLowerCase()) {
    case "ready":
      return "ready";
    case "error":
      return "error";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "building":
      return "building";
    default:
      return "pending";
  }
}

/** Id to subscribe to when the newest deployment is still in flight. */
export function inFlightDeploymentId(
  latest: { id: string; status: string | null | undefined } | null | undefined,
): string | null {
  if (!latest?.id) return null;
  const state = toPublishState(latest.status);
  return state === "pending" || state === "building" ? latest.id : null;
}

/**
 * Overview for one project. Caller MUST have already verified ownership —
 * this function takes a bare id and performs no tenant check of its own.
 */
export async function getProjectSiteOverview(projectId: string): Promise<SiteOverview | null> {
  const normalizedId = projectId.trim();
  if (!normalizedId) return null;

  const [project] = await db
    .select({
      id: appProjects.id,
      publishedSlug: appProjects.published_slug,
      brandedDomain: appProjects.branded_domain,
      brandedDomainVerifiedAt: appProjects.branded_domain_verified_at,
      customDomain: appProjects.custom_domain,
      customDomainVerifiedAt: appProjects.custom_domain_verified_at,
      vercelProjectId: appProjects.vercel_project_id,
    })
    .from(appProjects)
    .where(eq(appProjects.id, normalizedId))
    .limit(1);

  if (!project) return null;

  const chats = await db
    .select({ id: engineChats.id })
    .from(engineChats)
    .where(eq(engineChats.projectId, normalizedId));
  const chatIds = chats.map((chat) => chat.id);

  const emptyOverview: SiteOverview = {
    projectId: project.id,
    chatId: chatIds[0] ?? null,
    address: resolveOverviewAddress(project, null),
    state: "never_published",
    liveAt: null,
    liveVersionId: null,
    latestDeploymentId: null,
    publishedSlug: project.publishedSlug ?? null,
    brandedDomain: project.brandedDomain ?? null,
    brandedDomainVerified: Boolean(project.brandedDomainVerifiedAt),
    customDomain: project.customDomain ?? null,
    customDomainVerified: Boolean(project.customDomainVerifiedAt),
    vercelProjectId: project.vercelProjectId ?? null,
  };

  if (chatIds.length === 0) return emptyOverview;

  // Two separate reads on purpose. The newest deployment carries the CURRENT
  // state (a running build, or a failure), while the newest READY one carries
  // the address and version that are actually serving traffic. Collapsing them
  // would either hide an in-flight build or drop the live address the moment a
  // re-publish starts.
  const [latest] = await db
    .select({
      id: deployments.id,
      chatId: deployments.chatId,
      status: deployments.status,
      createdAt: deployments.createdAt,
    })
    .from(deployments)
    .where(inArray(deployments.chatId, chatIds))
    .orderBy(desc(deployments.createdAt))
    .limit(1);

  const [latestReady] = await db
    .select({
      chatId: deployments.chatId,
      versionId: deployments.versionId,
      providerUrl: deployments.providerUrl,
      url: deployments.url,
      updatedAt: deployments.updatedAt,
    })
    .from(deployments)
    .where(and(inArray(deployments.chatId, chatIds), eq(deployments.status, "ready")))
    .orderBy(desc(deployments.createdAt))
    .limit(1);

  if (!latest) return emptyOverview;

  return {
    ...emptyOverview,
    chatId: latestReady?.chatId ?? latest.chatId ?? chatIds[0] ?? null,
    address: resolveOverviewAddress(project, latestReady),
    state: toPublishState(latest.status),
    liveAt: latestReady?.updatedAt ?? null,
    liveVersionId: latestReady?.versionId ?? null,
    latestDeploymentId: inFlightDeploymentId(latest),
  };
}

import { db } from "@/lib/db/client";
import { appProjects, deployments, engineChats } from "@/lib/db/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getChatByIdForRequest, getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  normalizeDomainHostname,
  resolveLiveUrl,
} from "@/lib/live-site-url";

export type DeploymentStatus = "pending" | "building" | "ready" | "error" | "cancelled";

export type UpdateDeploymentStatusResult = {
  /**
   * `true` only when THIS call atomically flipped the row from a non-`error`
   * status to `error`. Lets callers (Vercel-webhook + SSE-poll) log a deploy
   * failure EXACTLY once — previously both paths logged on `status === "error"`
   * without cross-path dedup, so one build failure produced duplicate
   * `engine_version_error_logs` rows + RAG/bus signals (BB#deploy2).
   */
  transitionedToError: boolean;
};

export async function createDeploymentRecord(params: {
  chatId: string;
  versionId: string;
  vercelProjectId?: string;
  vercelDeploymentId?: string;
  providerUrl?: string;
  url?: string;
  inspectorUrl?: string;
}): Promise<string> {
  const id = nanoid();

  await db.insert(deployments).values({
    id,
    chatId: params.chatId,
    versionId: params.versionId,
    vercelProjectId: params.vercelProjectId || null,
    vercelDeploymentId: params.vercelDeploymentId || null,
    providerUrl: params.providerUrl || null,
    status: "pending",
    url: params.url || null,
    inspectorUrl: params.inspectorUrl || null,
  });

  return id;
}

export async function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  updates?: {
    url?: string | null;
    providerUrl?: string | null;
    inspectorUrl?: string | null;
    vercelDeploymentId?: string | null;
    vercelProjectId?: string | null;
  },
): Promise<UpdateDeploymentStatusResult> {
  // Metadata (url/inspectorUrl/…) must ALWAYS be written — even a repeated
  // `error` event may carry a late-arriving inspectorUrl. Only the transition
  // DETECTION is conditional; the metadata merge is not (BB#deploy2 design).
  const metadataValues: Record<string, string | Date | null> = {
    updatedAt: new Date(),
  };
  if (updates && Object.prototype.hasOwnProperty.call(updates, "url")) {
    metadataValues.url = updates.url ?? null;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "providerUrl")) {
    metadataValues.providerUrl = updates.providerUrl ?? null;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "inspectorUrl")) {
    metadataValues.inspectorUrl = updates.inspectorUrl ?? null;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "vercelDeploymentId")) {
    metadataValues.vercelDeploymentId = updates.vercelDeploymentId ?? null;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "vercelProjectId")) {
    metadataValues.vercelProjectId = updates.vercelProjectId ?? null;
  }
  // `metadataValues` always carries `updatedAt`; anything beyond that is a real
  // metadata field worth persisting on the already-error path.
  const hasExtraMetadata = Object.keys(metadataValues).length > 1;

  if (status === "error") {
    // Atomic transition claim: `IS DISTINCT FROM` (not `<>`) so a NULL-status
    // row also flips correctly. Exactly one concurrent writer (webhook vs poll)
    // gets a row back — that caller owns the single deploy-error log.
    const claimed = await db
      .update(deployments)
      .set({ ...metadataValues, status })
      .where(
        and(
          eq(deployments.id, deploymentId),
          sql`${deployments.status} is distinct from 'error'`,
        ),
      )
      .returning({ id: deployments.id });
    if (claimed.length > 0) {
      return { transitionedToError: true };
    }
    // Row already in `error` (or gone): merge late metadata but never re-signal
    // the transition, so the duplicate never produces a second error log.
    if (hasExtraMetadata) {
      await db
        .update(deployments)
        .set(metadataValues)
        .where(eq(deployments.id, deploymentId));
    }
    return { transitionedToError: false };
  }

  await db
    .update(deployments)
    .set({ ...metadataValues, status })
    .where(eq(deployments.id, deploymentId));
  return { transitionedToError: false };
}

/**
 * The canonical Vercel project id from the most relevant deployment of a chat.
 * Used before the best-effort `app_projects` cache by deploy/domain resolution,
 * including sites published before the cache column existed. Prefers a `ready`
 * deployment; otherwise takes the most recent one that carries a project id.
 */
export async function getLatestVercelProjectIdForChat(
  chatId: string,
): Promise<string | null> {
  const rows = await db
    .select({
      vercelProjectId: deployments.vercelProjectId,
      status: deployments.status,
    })
    .from(deployments)
    .where(and(eq(deployments.chatId, chatId), isNotNull(deployments.vercelProjectId)))
    .orderBy(desc(deployments.createdAt));
  if (rows.length === 0) return null;
  const ready = rows.find((r) => r.status === "ready");
  return (ready ?? rows[0]).vercelProjectId ?? null;
}

/**
 * Den senaste icke-null `deployments.domain` för en chat, eller `null` om
 * ingen custom-domän är kopplad. Används av deploy-route:n (A2) för att låsa
 * Vercel-projektnamnet så länge en domän sitter kopplad — vi läser DB i
 * stället för att slå mot Vercel-API:t i deploy-hot-path:en.
 *
 * Tenant-säkerhet: anroparen har redan bekräftat ägarskap av `chatId` (via
 * `getEngineVersionForChatByIdForRequest` i deploy-route:n) innan denna
 * läsning körs — precis som `getLatestVercelProjectIdForChat` ovan, som också
 * är chat-scopad utan egen req-guard.
 */
export async function getLinkedDomainForChat(
  chatId: string,
): Promise<string | null> {
  const rows = await db
    .select({ domain: deployments.domain })
    .from(deployments)
    .where(and(eq(deployments.chatId, chatId), isNotNull(deployments.domain)))
    .orderBy(desc(deployments.createdAt))
    .limit(1);
  if (rows.length === 0) return null;
  const domain = rows[0].domain?.trim();
  return domain ? domain : null;
}

/**
 * #519 P1 (Codex review round 2): the SAME row `getLinkedDomainForChat`
 * reads (latest deployment row that carries a domain, saved once via
 * `/api/domains/save`) but exposing its `vercel_project_id` instead of the
 * domain string. A domain can be saved onto an OLDER deployment row while a
 * newer, unrelated row (with no domain of its own) carries a DIFFERENT
 * project id — `getLatestVercelProjectIdForChat` alone would then resolve to
 * that newer/unrelated project, silently retargeting hosting away from the
 * project the domain is actually attached to. The deploy route's
 * project-name lock and deploy target must prefer THIS id whenever a domain
 * is linked, so a republish always goes to the project the domain sits on.
 */
export async function getLinkedDomainProjectIdForChat(
  chatId: string,
): Promise<string | null> {
  const rows = await db
    .select({ vercelProjectId: deployments.vercelProjectId })
    .from(deployments)
    .where(and(eq(deployments.chatId, chatId), isNotNull(deployments.domain)))
    .orderBy(desc(deployments.createdAt))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0].vercelProjectId?.trim() || null;
}

export async function setDeploymentDomain(
  deploymentId: string,
  domain: string,
): Promise<void> {
  await db
    .update(deployments)
    .set({ domain, updatedAt: new Date() })
    .where(eq(deployments.id, deploymentId));
}

export async function setDeploymentDomainForRequest(
  req: Request,
  deploymentId: string,
  domain: string,
): Promise<boolean> {
  const [deployment] = await db
    .select({ chatId: deployments.chatId })
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);
  if (!deployment) return false;

  // `deployments.chat_id` holds an `engine_chats.id` for own-engine publishes
  // and a legacy `chats.id` for older v0-era deployments. Authorize against both
  // (engine first), mirroring the deployments GET/link resolution order — the
  // legacy-only lookup returned 404 for every own-engine domain save, so the
  // domain was never persisted even though the Vercel link succeeded.
  const engineChat = await getEngineChatByIdForRequest(req, deployment.chatId);
  if (!engineChat) {
    const legacyChat = await getChatByIdForRequest(req, deployment.chatId);
    if (!legacyChat) return false;
  }

  const result = await db
    .update(deployments)
    .set({ domain, updatedAt: new Date() })
    .where(eq(deployments.id, deploymentId));
  return (result.rowCount ?? 0) > 0;
}

/** Promote the verified project domain onto the current ready live row. */
export async function setLatestDeploymentLiveUrlForChat(
  chatId: string,
  domain: string,
): Promise<string | null> {
  const normalizedDomain = normalizeDomainHostname(domain);
  if (!normalizedDomain) return null;
  const [latest] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(and(eq(deployments.chatId, chatId), eq(deployments.status, "ready")))
    .orderBy(desc(deployments.createdAt))
    .limit(1);
  if (!latest) return null;
  await db
    .update(deployments)
    .set({
      url: `https://${normalizedDomain}`,
      domain: normalizedDomain,
      updatedAt: new Date(),
    })
    .where(eq(deployments.id, latest.id));
  return latest.id;
}

/** Resolve the public URL for status/webhook paths that do not have an app request context. */
export async function resolveDeploymentLiveUrlForChat(params: {
  chatId: string;
  providerUrl?: string | null;
  fallbackUrl?: string | null;
}): Promise<string | null> {
  const [project] = await db
    .select({
      brandedDomain: appProjects.branded_domain,
      brandedDomainVerifiedAt: appProjects.branded_domain_verified_at,
      customDomain: appProjects.custom_domain,
      customDomainVerifiedAt: appProjects.custom_domain_verified_at,
    })
    .from(engineChats)
    .innerJoin(appProjects, eq(engineChats.projectId, appProjects.id))
    .where(eq(engineChats.id, params.chatId))
    .limit(1);
  const resolved = resolveLiveUrl({
    providerUrl: params.providerUrl,
    brandedDomain: project?.brandedDomain ?? null,
    brandedDomainVerifiedAt: project?.brandedDomainVerifiedAt ?? null,
    customDomain: project?.customDomain ?? null,
    customDomainVerifiedAt: project?.customDomainVerifiedAt ?? null,
  });
  if (resolved) return resolved;
  // A persisted liveUrl may contain a formerly verified branded/custom host.
  // Only a legacy Vercel hostname is safe as fallback when the feature gate or
  // verification state has been revoked.
  const fallbackHost = normalizeDomainHostname(params.fallbackUrl);
  return fallbackHost?.endsWith(".vercel.app")
    ? `https://${fallbackHost}`
    : null;
}

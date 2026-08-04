import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { withRateLimit } from "@/lib/rateLimit";
import {
  resolveLatestOrCachedVercelProjectId,
  setLatestDeploymentLiveUrlForChat,
  updateDeploymentStatus,
} from "@/lib/deployment";
import {
  checkVercelProjectDomain,
  getVercelDeployment,
  mapVercelReadyStateToStatus,
} from "@/lib/vercelDeploy";
import {
  getChatByIdForRequest,
  getChatByV0ChatIdForRequest,
  getEngineChatByIdForRequest,
} from "@/lib/tenant";
import { logDeployError } from "@/lib/deploy/deploy-error-log";
import {
  clearProjectBrandedDomainVerification,
  clearProjectCustomDomainVerification,
  getProjectById,
  markProjectBrandedDomainVerified,
  touchProjectBrandedDomainCheckedAt,
} from "@/lib/db/services/projects";
import {
  getBrandedLiveSiteDomain,
  resolveLiveUrl,
} from "@/lib/live-site-url";
import { resolveLegacyProviderUrl } from "./legacy-provider-url";

export async function GET(req: Request) {
  return withRateLimit(req, "v0:deployments-list", async () => {
    try {
      const { searchParams } = new URL(req.url);
      const chatId = searchParams.get("chatId");

      if (!chatId) {
        return NextResponse.json({ error: "chatId query parameter is required" }, { status: 400 });
      }

      // Own-engine chats are the primary path: publish writes deployment rows
      // keyed by the engine chat id (the id the builder passes). Resolve the
      // engine chat first (tenant-guarded), and fall back to the legacy chat
      // lookup for older v0-era chats so both keep working after a reload.
      let internalChatId: string | null = null;
      let appProjectId: string | null = null;
      const engineChat = await getEngineChatByIdForRequest(req, chatId);
      if (engineChat) {
        internalChatId = engineChat.id;
        appProjectId =
          typeof engineChat.project_id === "string" && engineChat.project_id.trim()
            ? engineChat.project_id.trim()
            : null;
      } else {
        let chat = await getChatByV0ChatIdForRequest(req, chatId);
        if (!chat) chat = await getChatByIdForRequest(req, chatId);
        if (chat) internalChatId = chat.id;
      }

      // Contract with the builder UI: top-level `project` carries the persisted
      // Vercel project link (null-safe; legacy chats have no app_projects row).
      const appProject = appProjectId
        ? await getProjectById(appProjectId).catch(() => null)
        : null;
      // #519 bugbot (round 3): the SAME shared generic-order helper the
      // POST-side lock/deploy-target uses for its custom/branded branches
      // (`resolveCanonicalVercelProjectForDomain` → `resolveLatestOrCachedVercelProjectId`
      // in `deployment.ts`) — never the legacy `deployments.domain` row's id.
      // Both the custom AND branded domains rechecked below are RE-ATTACHED
      // to whatever project a deploy currently targets, so a stale legacy
      // row must never win here either, or a definitive-`false` recheck
      // could revoke a still-valid verification against the WRONG project.
      const effectiveVercelProjectId = internalChatId
        ? await resolveLatestOrCachedVercelProjectId(
            internalChatId,
            appProject?.vercel_project_id,
          )
        : null;
      let brandedDomainVerifiedAt =
        appProject?.branded_domain_verified_at ?? null;
      let customDomainVerifiedAt =
        appProject?.custom_domain_verified_at ?? null;
      const brandedDomainCheckedAt =
        appProject?.branded_domain_checked_at ?? null;
      const brandedDomainCheckedAtMs = brandedDomainCheckedAt
        ? new Date(brandedDomainCheckedAt).getTime()
        : Number.NaN;
      const shouldRecheckBrandedDomain =
        !Number.isFinite(brandedDomainCheckedAtMs) ||
        Date.now() - brandedDomainCheckedAtMs >= 5 * 60 * 1000;
      if (
        appProjectId &&
        appProject?.custom_domain &&
        customDomainVerifiedAt &&
        effectiveVercelProjectId
      ) {
        const configured = await checkVercelProjectDomain(
          effectiveVercelProjectId,
          appProject.custom_domain,
        );
        if (configured === false) {
          await clearProjectCustomDomainVerification(
            appProjectId,
            appProject.custom_domain,
          );
          customDomainVerifiedAt = null;
        }
      }
      // #486 Fix C: recheck a branded domain REGARDLESS of its current
      // verified state (mirrors the custom-domain block above) — an already
      // -verified alias must still be periodically rechecked, or a domain
      // removed/misconfigured on the provider side after verification would
      // stay "verified" in Sajtmaskin forever. Only a DEFINITIVE `false` from
      // the provider revokes verification; a transient error/`null` just
      // advances the check clock so the throttle isn't defeated by repeated
      // reloads.
      if (
        getBrandedLiveSiteDomain() &&
        appProjectId &&
        appProject?.branded_domain &&
        shouldRecheckBrandedDomain &&
        effectiveVercelProjectId
      ) {
        const configured = await checkVercelProjectDomain(
          effectiveVercelProjectId,
          appProject.branded_domain,
        );
        if (configured === true) {
          // VADE #519: only a genuine unverified→verified TRANSITION may
          // promote the branded domain onto the live URL. `markProjectBrandedDomainVerified`
          // itself already advances `branded_domain_checked_at` on every call
          // (including a no-op re-verify of an already-verified domain), so
          // it alone covers the throttle clock — repeated throttled rechecks
          // of an already-verified domain must NOT re-stamp the live URL
          // every 5 minutes, or a verified custom domain's live URL would get
          // clobbered back to the branded subdomain on every reload.
          const wasVerifiedBefore = Boolean(brandedDomainVerifiedAt);
          const hasVerifiedCustomDomain = Boolean(
            appProject.custom_domain && customDomainVerifiedAt,
          );
          const marked = await markProjectBrandedDomainVerified(
            appProjectId,
            appProject.branded_domain,
          );
          if (marked) {
            brandedDomainVerifiedAt =
              marked.branded_domain_verified_at ?? new Date();
            // Custom domain always wins as liveUrl — never stamp the branded
            // subdomain over it, even on a genuine transition.
            if (
              !wasVerifiedBefore &&
              !hasVerifiedCustomDomain &&
              internalChatId
            ) {
              await setLatestDeploymentLiveUrlForChat(
                internalChatId,
                appProject.branded_domain,
              );
            }
          }
        } else if (configured === false) {
          // Definitive: the provider no longer reports the domain as
          // verified/configured. Revoke.
          await clearProjectBrandedDomainVerification(
            appProjectId,
            appProject.branded_domain,
          );
          brandedDomainVerifiedAt = null;
        } else if (brandedDomainVerifiedAt) {
          // Transient provider error on an ALREADY-verified domain: never
          // revoke on a blip — only advance the check clock.
          await touchProjectBrandedDomainCheckedAt(
            appProjectId,
            appProject.branded_domain,
          );
        } else {
          // Pending DNS and transient provider failures on a not-yet-verified
          // domain must also advance the check clock; otherwise every builder
          // history reload repeats the same external request and defeats the
          // five-minute throttle.
          await clearProjectBrandedDomainVerification(
            appProjectId,
            appProject.branded_domain,
          );
        }
      }
      const project = {
        vercelProjectId: effectiveVercelProjectId,
        vercelProjectName: appProject?.vercel_project_name ?? null,
        publishedSlug: appProject?.published_slug ?? null,
        brandedDomain: appProject?.branded_domain ?? null,
        brandedDomainVerifiedAt,
        customDomain: appProject?.custom_domain ?? null,
        customDomainVerifiedAt,
      };

      if (!internalChatId) {
        return NextResponse.json({ deployments: [], project });
      }

      const result = await db
        .select()
        .from(deployments)
        .where(eq(deployments.chatId, internalChatId))
        .orderBy(desc(deployments.createdAt));
      const refreshedById = new Map<
        string,
        {
          status: ReturnType<typeof mapVercelReadyStateToStatus>["status"];
          url: string | null;
          providerUrl: string | null;
          inspectorUrl: string | null;
          vercelProjectId: string | null;
        }
      >();

      const latestRefreshCandidate = result.find((d) => {
        const status = String(d.status || "pending");
        const isTerminal = status === "ready" || status === "error" || status === "cancelled";
        return Boolean(d.vercelDeploymentId) && !isTerminal;
      });

      if (latestRefreshCandidate?.vercelDeploymentId) {
        try {
          const vercel = await getVercelDeployment(latestRefreshCandidate.vercelDeploymentId);
          const mapped = mapVercelReadyStateToStatus(vercel.readyState);
          const refreshedLiveUrl = resolveLiveUrl({
            providerUrl:
              vercel.url ?? latestRefreshCandidate.providerUrl ?? null,
            brandedDomain: appProject?.branded_domain ?? null,
            brandedDomainVerifiedAt,
            customDomain: appProject?.custom_domain ?? null,
            customDomainVerifiedAt,
          });

          const refreshWrite = await updateDeploymentStatus(latestRefreshCandidate.id, mapped.status, {
            providerUrl: vercel.url ?? undefined,
            url: refreshedLiveUrl ?? undefined,
            inspectorUrl: vercel.inspectorUrl ?? undefined,
            vercelProjectId: vercel.vercelProjectId ?? undefined,
          });
          // BB#deploy2: vinner list-refreshen (t.ex. sidladdning) den atomiska
          // övergången till `error` före webhook/poll äger den loggen — annars
          // skulle build-felet aldrig loggas (webhook/poll ser sedan
          // transitionedToError=false).
          if (refreshWrite.transitionedToError) {
            await logDeployError({
              chatId: latestRefreshCandidate.chatId,
              versionId: latestRefreshCandidate.versionId,
              deploymentId: latestRefreshCandidate.id,
              vercelDeploymentId: latestRefreshCandidate.vercelDeploymentId,
              inspectorUrl: vercel.inspectorUrl ?? null,
              message: "Hosting-bygget misslyckades (fångat vid statusuppdatering).",
              source: "refresh",
            }).catch(() => {});
          }

          refreshedById.set(latestRefreshCandidate.id, {
            status: mapped.status,
            providerUrl: vercel.url ?? latestRefreshCandidate.providerUrl ?? null,
            url:
              refreshedLiveUrl ??
              resolveLegacyProviderUrl(latestRefreshCandidate.url),
            inspectorUrl: vercel.inspectorUrl ?? latestRefreshCandidate.inspectorUrl ?? null,
            vercelProjectId: vercel.vercelProjectId ?? latestRefreshCandidate.vercelProjectId ?? null,
          });
        } catch (err) {
          console.error("Failed to refresh latest deployment in list:", err);
        }
      }

      return NextResponse.json({
        deployments: result.map((d) => {
          const refreshed = refreshedById.get(d.id);
          return {
            id: d.id,
            chatId: d.chatId,
            versionId: d.versionId,
            status: refreshed?.status ?? d.status,
            url:
              refreshed?.url ??
              resolveLiveUrl({
                providerUrl: d.providerUrl,
                brandedDomain: appProject?.branded_domain ?? null,
                brandedDomainVerifiedAt,
                customDomain: appProject?.custom_domain ?? null,
                customDomainVerifiedAt,
              }) ??
              resolveLegacyProviderUrl(d.url),
            providerUrl: refreshed?.providerUrl ?? d.providerUrl,
            inspectorUrl: refreshed?.inspectorUrl ?? d.inspectorUrl,
            vercelDeploymentId: d.vercelDeploymentId,
            vercelProjectId: refreshed?.vercelProjectId ?? d.vercelProjectId,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        }),
        project,
      });
    } catch (err) {
      console.error("Get deployments error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}

/**
 * Tunn Vercel-paus/återställningsadapter. Skriver AV som default.
 * Plattformens eget projekt får aldrig väljas som pausmål.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { getProjectById } from "@/lib/db/services/projects";
import { normalizeDomainHostname } from "@/lib/live-site-url";
import {
  isSiteSubscriptionHostingWritesEnabled,
} from "./site-subscription-flags";
import { isPlatformVercelProject } from "./site-subscription-policy";

export type HostingTarget = {
  projectId: string;
  vercelProjectId: string | null;
  publishedRef: string | null;
  billingMode: "test" | "live";
};

export type HostingProviderResult = {
  ok: boolean;
  written: boolean;
  confirmed: boolean;
  code: string;
  providerRef?: string | null;
  error?: string;
};

export interface SiteHostingProvider {
  pause(target: HostingTarget): Promise<HostingProviderResult>;
  restore(target: HostingTarget): Promise<HostingProviderResult>;
}

function platformVercelProjectId(): string | null {
  return getServerEnv().VERCEL_PROJECT_ID?.trim() || null;
}

export function assertSafeHostingTarget(target: HostingTarget): HostingProviderResult | null {
  if (isPlatformVercelProject(target.vercelProjectId, platformVercelProjectId())) {
    return {
      ok: false,
      written: false,
      confirmed: false,
      code: "platform_project_forbidden",
      error: "Plattformens eget Vercel-projekt får inte pausas.",
    };
  }
  if (!target.vercelProjectId) {
    return {
      ok: false,
      written: false,
      confirmed: false,
      code: "missing_vercel_project",
      error: "Sajten saknar Vercel-projekt.",
    };
  }
  return null;
}

export type ProductionHostProof = {
  attestedProductionHost?: string | null;
  verifiedCustomerHosts?: ReadonlyArray<string | null | undefined> | null;
};

/**
 * Samma positiva identitet som #1386 `isVerifiedProductionSiteHost` /
 * `isCurrentProductionSiteHost` i `src/lib/live-site-url.ts` (finns inte på
 * den här branchen). Slå ihop ägarna när båda PR:arna landat — importera
 * därifrån och ta bort den här kopian.
 *
 * Regel: `*.vercel.app` är produktion bara vid exakt likhet med attesterat
 * produktionsalias. Annan host bara när den är en just nu verifierad
 * kund-/branded-domän. Ingen label-räkning och ingen `-git-`-gissning —
 * per-deployment-URL:en har samma form som aliaset.
 */
export function isVerifiedProductionSiteHost(
  host: string | null | undefined,
  proof: ProductionHostProof,
): boolean {
  const normalized = normalizeDomainHostname(host);
  if (!normalized) return false;
  const attested = normalizeDomainHostname(proof.attestedProductionHost);
  if (attested && normalized === attested) return true;
  if (normalized.endsWith(".vercel.app")) return false;
  const verified = new Set<string>();
  for (const entry of proof.verifiedCustomerHosts ?? []) {
    const candidate = normalizeDomainHostname(entry);
    if (candidate && !candidate.endsWith(".vercel.app")) verified.add(candidate);
  }
  return verified.has(normalized);
}

function deploymentIsReady(status: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase();
  return normalized === "ready" || normalized === "success" || normalized === "ok";
}

export function pickLastPublishedDeploymentRef(
  rows: Array<{
    vercelDeploymentId: string | null;
    status: string | null;
    url?: string | null;
    providerUrl?: string | null;
  }>,
  proof: ProductionHostProof,
): string | null {
  const published = rows.find((row) => {
    if (!row.vercelDeploymentId || !deploymentIsReady(row.status)) return false;
    return (
      isVerifiedProductionSiteHost(row.url, proof) ||
      isVerifiedProductionSiteHost(row.providerUrl, proof)
    );
  });
  return published?.vercelDeploymentId ? `dpl:${published.vercelDeploymentId}` : null;
}

export function isPublishedDeploymentRef(ref: string | null | undefined): boolean {
  return Boolean(ref?.startsWith("dpl:"));
}

export async function resolveLastPublishedRef(projectId: string): Promise<string | null> {
  const project = await getProjectById(projectId);
  if (!project?.vercel_project_id) return null;

  const rows = await db
    .select({
      vercelDeploymentId: deployments.vercelDeploymentId,
      status: deployments.status,
      url: deployments.url,
      providerUrl: deployments.providerUrl,
    })
    .from(deployments)
    .where(eq(deployments.vercelProjectId, project.vercel_project_id))
    .orderBy(desc(deployments.createdAt))
    .limit(20);

  return pickLastPublishedDeploymentRef(rows, {
    // A3 (#1386) attesterar produktionsaliaset. Utan det fältet: null, gissa inte.
    attestedProductionHost: null,
    verifiedCustomerHosts: [
      project.custom_domain_verified_at ? project.custom_domain : null,
      project.branded_domain_verified_at ? project.branded_domain : null,
    ],
  });
}

export function createDisabledHostingProvider(): SiteHostingProvider {
  return {
    async pause(target) {
      const blocked = assertSafeHostingTarget(target);
      if (blocked) return blocked;
      return {
        ok: false,
        written: false,
        confirmed: false,
        code: "writes_disabled",
        error: "Vercel-paus är av som default. Inga writes utfördes.",
      };
    },
    async restore(target) {
      const blocked = assertSafeHostingTarget(target);
      if (blocked) return blocked;
      if (!target.publishedRef) {
        return {
          ok: false,
          written: false,
          confirmed: false,
          code: "missing_published_ref",
          error: "Ingen senast publicerad version att återställa.",
        };
      }
      if (target.publishedRef.startsWith("draft:") || target.publishedRef.startsWith("prj:")) {
        return {
          ok: false,
          written: false,
          confirmed: false,
          code: "draft_ref_forbidden",
          error: "Utkast eller projekt-id får inte återställas.",
        };
      }
      return {
        ok: false,
        written: false,
        confirmed: false,
        code: "writes_disabled",
        error: "Vercel-återställning är av som default. Inga writes utfördes.",
      };
    },
  };
}

/**
 * Reserv för senare drift: samma interface, men anropar Vercel.
 * Används bara när env-grinden är på. Inte aktiverad i denna PR.
 */
export function createVercelHostingProvider(): SiteHostingProvider {
  const disabled = createDisabledHostingProvider();
  return {
    async pause(target) {
      if (!isSiteSubscriptionHostingWritesEnabled()) {
        return disabled.pause(target);
      }
      return disabled.pause(target);
    },
    async restore(target) {
      if (!isSiteSubscriptionHostingWritesEnabled()) {
        return disabled.restore(target);
      }
      return disabled.restore(target);
    },
  };
}

export function getSiteHostingProvider(): SiteHostingProvider {
  return createVercelHostingProvider();
}

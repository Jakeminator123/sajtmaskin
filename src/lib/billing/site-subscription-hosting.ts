/**
 * Tunn Vercel-paus/återställningsadapter. Skriver AV som default.
 * Plattformens eget projekt får aldrig väljas som pausmål.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { getProjectById } from "@/lib/db/services/projects";
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

export function pickLastPublishedDeploymentRef(
  rows: Array<{
    vercelDeploymentId: string | null;
    status: string | null;
    url?: string | null;
  }>,
): string | null {
  const published = rows.find((row) => {
    const status = (row.status ?? "").toLowerCase();
    const ready = status === "ready" || status === "success" || status === "ok";
    const liveUrl = Boolean(row.url?.trim());
    return Boolean(row.vercelDeploymentId) && ready && liveUrl;
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
    })
    .from(deployments)
    .where(eq(deployments.vercelProjectId, project.vercel_project_id))
    .orderBy(desc(deployments.createdAt))
    .limit(20);

  return pickLastPublishedDeploymentRef(rows);
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

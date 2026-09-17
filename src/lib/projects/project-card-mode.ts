import type { ProjectSite } from "./project-client";

/**
 * Situation on a /projects card. Kept out of the components so the same
 * project cannot look like a live website on the thumbnail and like a draft
 * in the footer.
 *
 * `legacy` is the honest answer when `getProjectSite()` returned `null`
 * (older rows, a transient 404, or a failed overview fetch). The card must
 * still render, but it must not invent a live address or a portal that the
 * overview could not confirm.
 */
export type ProjectCardMode = "loading" | "legacy" | "draft" | "live" | "progress" | "problem";

export type ProjectListSegment = "all" | "published" | "drafts";

export function projectCardMode(site: ProjectSite | null | undefined): ProjectCardMode {
  if (site === undefined) return "loading";
  if (site === null) return "legacy";
  switch (site.state) {
    case "ready":
      return "live";
    case "building":
    case "pending":
      return "progress";
    case "error":
    case "cancelled":
      return "problem";
    case "never_published":
      return "draft";
  }
}

/** Thumbnail / implied next step: manage a known site, otherwise keep building. */
export function projectCardPrimaryHref(projectId: string, mode: ProjectCardMode): string {
  if (mode === "live" || mode === "progress" || mode === "problem") {
    return `/projects/${projectId}`;
  }
  return `/builder?project=${projectId}`;
}

export function projectCardBuilderHref(projectId: string): string {
  return `/builder?project=${projectId}`;
}

export function projectCardManageHref(projectId: string): string {
  return `/projects/${projectId}`;
}

/**
 * A card belongs in "Publicerade" when the customer already has a reachable
 * site — live, or still showing a live URL while a republish runs or fails.
 */
export function isPublishedSegment(site: ProjectSite | null | undefined): boolean {
  if (!site) return false;
  return site.state === "ready" || Boolean(site.address.liveUrl);
}

/**
 * A card belongs in "Utkast" when there is no published site to manage yet.
 * In-flight / problem publishes without a URL stay visible under "Alla".
 */
export function isDraftSegment(site: ProjectSite | null | undefined): boolean {
  if (site === undefined) return false;
  if (site === null) return true;
  return site.state === "never_published" && !site.address.liveUrl;
}

export function matchesProjectListSegment(
  site: ProjectSite | null | undefined,
  segment: ProjectListSegment,
): boolean {
  if (segment === "all") return true;
  // Keep cards visible in every segment until the overview arrives, so the
  // grid does not flicker empty while `/site` requests are in flight.
  if (site === undefined) return true;
  if (segment === "published") return isPublishedSegment(site);
  return isDraftSegment(site);
}

export function countProjectListSegments(
  sites: Array<ProjectSite | null | undefined>,
): { all: number; published: number; drafts: number } {
  let published = 0;
  let drafts = 0;
  for (const site of sites) {
    if (isPublishedSegment(site)) published += 1;
    else if (isDraftSegment(site)) drafts += 1;
  }
  return { all: sites.length, published, drafts };
}

import type { ProjectSite } from "./project-client";

/**
 * Situation on a /projects card. Kept out of the components so the same
 * project cannot look like a live website on the thumbnail and like a draft
 * in the footer.
 *
 * `legacy` is the honest answer when `getProjectSite()` returned `null`
 * (older rows without a site record, or a confirmed 404). The card must
 * still render, but it must not invent a live address or a manage CTA —
 * `/projects/[id]` treats a null overview as "Projektet hittades inte".
 * Transient fetch failures use `PROJECT_SITE_LOAD_ERROR`, never `undefined`
 * (loading) or `null` (confirmed missing site).
 */
export const PROJECT_SITE_LOAD_ERROR = "project-site-load-error" as const;

export type ProjectCardSiteValue =
  | ProjectSite
  | null
  | undefined
  | typeof PROJECT_SITE_LOAD_ERROR;

export type ProjectCardMode =
  | "loading"
  | "unavailable"
  | "legacy"
  | "draft"
  | "live"
  | "progress"
  | "problem";

export type ProjectListSegment = "all" | "published" | "drafts";

export function projectCardMode(site: ProjectCardSiteValue): ProjectCardMode {
  if (site === undefined) return "loading";
  if (site === PROJECT_SITE_LOAD_ERROR) return "unavailable";
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
export function isPublishedSegment(site: ProjectCardSiteValue): boolean {
  if (!site || site === PROJECT_SITE_LOAD_ERROR) return false;
  return site.state === "ready" || Boolean(site.address.liveUrl);
}

/**
 * A card belongs in "Utkast" when there is no reachable published site yet.
 * That includes never-published rows, confirmed missing overviews, and a first
 * publish that is still building or failed without a live URL. Loading and
 * fetch-error states stay unclassified until an overview is known.
 */
export function isDraftSegment(site: ProjectCardSiteValue): boolean {
  if (site === undefined || site === PROJECT_SITE_LOAD_ERROR) return false;
  return !isPublishedSegment(site);
}

export function matchesProjectListSegment(
  site: ProjectCardSiteValue,
  segment: ProjectListSegment,
): boolean {
  if (segment === "all") return true;
  // Only classified overviews belong in the two status segments. Loading and
  // fetch errors remain visible under All, whose badge includes every project.
  if (site === undefined || site === PROJECT_SITE_LOAD_ERROR) return false;
  if (segment === "published") return isPublishedSegment(site);
  return isDraftSegment(site);
}

export function countProjectListSegments(
  sites: ProjectCardSiteValue[],
): { all: number; published: number; drafts: number } {
  let published = 0;
  let drafts = 0;
  for (const site of sites) {
    if (isPublishedSegment(site)) published += 1;
    else if (isDraftSegment(site)) drafts += 1;
  }
  return { all: sites.length, published, drafts };
}

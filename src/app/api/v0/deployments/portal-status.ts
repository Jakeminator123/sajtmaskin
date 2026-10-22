/**
 * Pure helpers for the portal status the deploy route persists after Vercel
 * has accepted a deploy: the SEO audit summary and whether the published files
 * carry the business-facts module. Kept route-free so they can be unit-tested
 * and so the route's post-delivery block stays a thin try/catch.
 */
import {
  BUSINESS_FACTS_MODULE_MARKER,
  isBusinessFactsModulePath,
} from "@/lib/projects/business-facts-module";
import {
  BUSINESS_FACTS_SUPPORT_META_KEY,
  type BusinessFactsSupportRecord,
} from "@/lib/projects/business-facts-schema";
import { buildSeoStatus } from "@/lib/projects/seo-status";
import type { SeoPublishReport } from "@/lib/seo/types";

export type PublishedTextFile = { path: string; content: string };

/** True when the files that went live contain a marked `lib/business-facts.ts`. */
export function computeBusinessFactsSupported(files: ReadonlyArray<PublishedTextFile>): boolean {
  return files.some(
    (file) =>
      isBusinessFactsModulePath(file.path) &&
      file.content.startsWith(BUSINESS_FACTS_MODULE_MARKER),
  );
}

export interface PortalStatusInput {
  seoReport: SeoPublishReport | null;
  /** Canonical URL the SEO pass ran against; `null` when the pass did not run. */
  seoSiteUrl: string | null;
  versionId: string;
  deployTarget: string;
  publishedFiles: ReadonlyArray<PublishedTextFile>;
  /** Verbatim imported repo: the prompt never renders the facts block there. */
  importedRepo: boolean;
  now: string;
}

/**
 * The `project_data.meta` patch for the portal. Empty object = nothing to write.
 * The support record is production-only: the portal's "live site" is the
 * production deployment, and a preview must not overwrite its answer.
 */
export function buildPortalStatusMetaPatch(input: PortalStatusInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.seoReport && input.seoSiteUrl) {
    patch.seoStatus = buildSeoStatus(input.seoReport, {
      siteUrl: input.seoSiteUrl,
      versionId: input.versionId,
      checkedAt: input.now,
    });
  }
  if (input.deployTarget === "production") {
    const record: BusinessFactsSupportRecord = {
      supported: computeBusinessFactsSupported(input.publishedFiles),
      versionId: input.versionId,
      checkedAt: input.now,
      importedRepo: input.importedRepo,
    };
    patch[BUSINESS_FACTS_SUPPORT_META_KEY] = record;
  }
  return patch;
}

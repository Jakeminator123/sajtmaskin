/**
 * Portal status per published version: the SEO audit summary and whether the
 * published files carry a used `lib/business-facts.ts`.
 *
 * Stored under `project_data.meta.portalStatusByVersion`, keyed by version id
 * and capped to the newest few entries. Per-version, not "latest", because the
 * deploy route writes when Vercel ACCEPTS a deploy: a build that then fails must
 * not overwrite the answer for the version that stays live. The portal reads
 * the entry for the version Vercel attests as live (`site-overview.ts`).
 *
 * Written only for production deploys — the portal describes the live site,
 * so a preview deploy never adds an entry.
 */
import {
  BUSINESS_FACTS_MODULE_MARKER,
  isBusinessFactsModulePath,
} from "./business-facts-module";
import {
  resolveBusinessFactsSupport,
  type BusinessFactsSupportRecord,
  type BusinessFactsSupportState,
} from "./business-facts-schema";
import { buildSeoStatus, parseSeoStatus, type SeoStatusPersisted } from "./seo-status";
import type { SeoPublishReport } from "@/lib/seo/types";

export const PORTAL_STATUS_META_KEY = "portalStatusByVersion";
/** Live is almost always among the newest publishes; rollbacks a few back still resolve. */
export const MAX_PORTAL_STATUS_VERSIONS = 5;

export type PublishedTextFile = { path: string; content: string };

type PortalStatusEntry = {
  checkedAt: string;
  seoStatus: SeoStatusPersisted | null;
  businessFactsSupport: { supported: boolean; importedRepo: boolean };
};

/** `from "@/lib/business-facts"`, `from "../lib/business-facts"`, `import("…/lib/business-facts")`. */
const BUSINESS_FACTS_IMPORT_RE = /(?:from\s*|import\s*\(\s*)["'][^"']*lib\/business-facts(?:\.ts)?["']/;

/**
 * True when the files that went live contain a marked `lib/business-facts.ts`
 * AND some other file imports it. A module nobody renders would make the portal
 * promise that "Publicera om" updates the site when nothing on the page changes.
 */
export function computeBusinessFactsSupported(files: ReadonlyArray<PublishedTextFile>): boolean {
  const hasMarkedModule = files.some(
    (file) =>
      isBusinessFactsModulePath(file.path) &&
      file.content.startsWith(BUSINESS_FACTS_MODULE_MARKER),
  );
  if (!hasMarkedModule) return false;
  return files.some(
    (file) => !isBusinessFactsModulePath(file.path) && BUSINESS_FACTS_IMPORT_RE.test(file.content),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseEntry(raw: unknown): PortalStatusEntry | null {
  const entry = asRecord(raw);
  const support = asRecord(entry?.businessFactsSupport);
  if (!entry || typeof entry.checkedAt !== "string" || !support) return null;
  if (typeof support.supported !== "boolean") return null;
  return {
    checkedAt: entry.checkedAt,
    seoStatus: parseSeoStatus(entry.seoStatus),
    businessFactsSupport: {
      supported: support.supported,
      importedRepo: support.importedRepo === true,
    },
  };
}

function readEntries(meta: Record<string, unknown> | null | undefined): Map<string, PortalStatusEntry> {
  const map = asRecord(asRecord(meta)?.[PORTAL_STATUS_META_KEY]);
  const entries = new Map<string, PortalStatusEntry>();
  if (!map) return entries;
  for (const [versionId, raw] of Object.entries(map)) {
    const entry = parseEntry(raw);
    if (entry) entries.set(versionId, entry);
  }
  return entries;
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
  /**
   * `project_data.meta` as read at the start of the deploy. The patch replaces
   * the whole namespace (top-level JSONB merge), so it must carry the existing
   * entries forward.
   */
  existingMeta: Record<string, unknown> | null;
}

/** The `project_data.meta` patch for the portal. Empty object = nothing to write. */
export function buildPortalStatusMetaPatch(input: PortalStatusInput): Record<string, unknown> {
  if (input.deployTarget !== "production") return {};
  const entries = readEntries(input.existingMeta);
  entries.set(input.versionId, {
    checkedAt: input.now,
    seoStatus:
      input.seoReport && input.seoSiteUrl
        ? buildSeoStatus(input.seoReport, {
            siteUrl: input.seoSiteUrl,
            versionId: input.versionId,
            checkedAt: input.now,
          })
        : null,
    businessFactsSupport: {
      supported: computeBusinessFactsSupported(input.publishedFiles),
      importedRepo: input.importedRepo,
    },
  });
  const newest = [...entries.entries()]
    .sort(([, a], [, b]) => b.checkedAt.localeCompare(a.checkedAt))
    .slice(0, MAX_PORTAL_STATUS_VERSIONS);
  return { [PORTAL_STATUS_META_KEY]: Object.fromEntries(newest) };
}

/**
 * Status for the version that is live now. No live version, or no entry for it
 * (published before this feature, or a write that failed), reads as "nothing
 * known": no SEO status and `unknown` support — never another version's answer.
 */
export function readPortalStatusForVersion(
  meta: Record<string, unknown> | null | undefined,
  liveVersionId: string | null | undefined,
): { seoStatus: SeoStatusPersisted | null; businessFactsSupport: BusinessFactsSupportState } {
  if (!liveVersionId) return { seoStatus: null, businessFactsSupport: "unknown" };
  const entry = readEntries(meta).get(liveVersionId);
  if (!entry) return { seoStatus: null, businessFactsSupport: "unknown" };
  const record: BusinessFactsSupportRecord = {
    supported: entry.businessFactsSupport.supported,
    importedRepo: entry.businessFactsSupport.importedRepo,
    versionId: liveVersionId,
    checkedAt: entry.checkedAt,
  };
  return {
    seoStatus: entry.seoStatus,
    businessFactsSupport: resolveBusinessFactsSupport(record, liveVersionId),
  };
}

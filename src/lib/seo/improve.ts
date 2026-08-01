/**
 * Deterministic SEO improvements, each traceable to the finding it answers.
 *
 * This is the link the feature is actually about: the audit is not a report
 * that gets filed, it is the input that decides what changes. Every entry in
 * the returned `improvements` names the `findingId` that motivated it, and the
 * caller drops any entry whose file did not really change — so the report
 * cannot claim work that never landed.
 *
 * File generation is NOT duplicated here. `applySeoToProjectFiles` in
 * `seo-defaults.ts` already owns the canonical robots/sitemap/OG templates and
 * the layout metadata enrichment; this module decides WHEN to invoke it and
 * handles the two cases it cannot: a placeholder file that must be replaced
 * rather than skipped, and the missing `lang` attribute.
 */

import { applySeoToProjectFiles, type ProjectTextFile } from "@/lib/gen/scaffolds/seo-defaults";
import type { SeoBrand } from "@/lib/projects/preferences-schema";
import { PLACEHOLDER_SITE_URL } from "./audit";
import type { SeoAuditResult, SeoImprovement } from "./types";

export interface SeoImproveOptions {
  siteUrl: string;
  brand?: SeoBrand;
  /** BCP-47 tag written into `<html lang>` when it is missing. */
  language?: string;
}

export interface SeoImproveResult {
  files: ProjectTextFile[];
  improvements: SeoImprovement[];
}

/**
 * Add `lang` to the root `<html>` tag when it has none.
 *
 * Only touches a tag that genuinely lacks the attribute — rewriting an
 * existing `lang="en"` would be us overriding a deliberate choice on a site we
 * cannot read the language of.
 */
export function addHtmlLang(content: string, language: string): string {
  return content.replace(/<html\b(?![^>]*\slang\s*=)([^>]*)>/, (_match, attrs: string) => {
    return `<html lang="${language}"${attrs}>`;
  });
}

export function applyDeterministicSeoImprovements(
  files: ReadonlyArray<ProjectTextFile>,
  audit: SeoAuditResult,
  options: SeoImproveOptions,
): SeoImproveResult {
  const improvements: SeoImprovement[] = [];
  const language = options.language ?? "sv";

  const findingsById = new Map<string, typeof audit.findings>();
  for (const f of audit.findings) {
    const list = findingsById.get(f.id) ?? [];
    list.push(f);
    findingsById.set(f.id, list);
  }

  // 1. Placeholder robots/sitemap. Dropping the file lets the canonical
  //    injector below write a correct one, instead of teaching this module a
  //    second copy of those templates that could drift from the first.
  let working = [...files];
  const placeholderFindings = findingsById.get("placeholder-site-url") ?? [];
  const placeholderPaths = new Set(
    placeholderFindings
      .map((f) => f.file)
      .filter((path) => {
        const file = working.find((wf) => wf.name === path);
        return Boolean(file?.content.includes(PLACEHOLDER_SITE_URL));
      }),
  );
  if (placeholderPaths.size > 0) {
    working = working.filter((f) => !placeholderPaths.has(f.name));
    for (const path of placeholderPaths) {
      improvements.push({
        findingId: "placeholder-site-url",
        file: path,
        change: `Skrev om ${path} till sajtens riktiga adress i stället för ${PLACEHOLDER_SITE_URL}.`,
        by: "deterministic",
      });
    }
  }

  // 2. Canonical injection + layout enrichment (robots, sitemap, OG-bild,
  //    metadataBase, alternates, openGraph, twitter).
  const injected = applySeoToProjectFiles(working, {
    siteUrl: options.siteUrl,
    brand: options.brand,
  });
  working = injected.applied ? injected.files : working;

  for (const path of injected.injected) {
    // A re-injected placeholder file is already reported above as a rewrite;
    // reporting it again as "added" would double-count one change.
    if (placeholderPaths.has(path)) continue;
    const findingId =
      path.includes("robots") ? "missing-robots" : path.includes("sitemap") ? "missing-sitemap" : "missing-open-graph";
    improvements.push({
      findingId,
      file: path,
      change: `Lade till ${path}.`,
      by: "deterministic",
    });
  }
  for (const path of injected.enriched) {
    const enrichedFindings = ["missing-metadata-base", "missing-canonical", "missing-open-graph"]
      .filter((id) => findingsById.has(id));
    improvements.push({
      findingId: (enrichedFindings[0] ?? "missing-open-graph") as SeoImprovement["findingId"],
      file: path,
      change:
        "Kompletterade metadata med metadataBase, kanonisk länk och Open Graph/Twitter-fält.",
      by: "deterministic",
    });
  }

  // 3. `<html lang>`.
  const langFindings = findingsById.get("missing-html-lang") ?? [];
  if (langFindings.length > 0) {
    working = working.map((file) => {
      if (!langFindings.some((f) => f.file === file.name)) return file;
      const next = addHtmlLang(file.content, language);
      if (next === file.content) return file;
      improvements.push({
        findingId: "missing-html-lang",
        file: file.name,
        change: `Satte lang="${language}" på html-taggen.`,
        by: "deterministic",
      });
      return { name: file.name, content: next };
    });
  }

  return { files: working, improvements };
}

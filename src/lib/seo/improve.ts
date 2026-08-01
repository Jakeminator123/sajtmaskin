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

import {
  applySeoToProjectFiles,
  buildCanonicalSeoFileContent,
  type ProjectTextFile,
} from "@/lib/gen/scaffolds/seo-defaults";
import type { SeoBrand } from "@/lib/projects/preferences-schema";
import { PLACEHOLDER_SITE_URL } from "./audit";
import type { SeoAuditResult, SeoImprovement } from "./types";

export interface SeoImproveOptions {
  siteUrl: string;
  brand?: SeoBrand;
  /**
   * BCP-47 tag written into `<html lang>` when it is missing. Defaults to the
   * brand locale, then Swedish.
   */
  language?: string;
}

/**
 * Turn a persisted brand locale into a value `<html lang>` accepts.
 *
 * `SeoBrand.locale` allows the Open Graph underscore form (`sv_SE`) as well as
 * the hyphenated one, but `lang` is BCP-47 and only takes hyphens. Without the
 * conversion an English site with `locale: "en_US"` would either ship an
 * invalid `lang` or — as before this fix — silently get `lang="sv"` while its
 * Open Graph locale said `en_US`, which is a worse signal than either alone.
 */
export function resolveHtmlLang(
  explicit: string | undefined,
  brandLocale: string | undefined,
): string {
  const candidate = explicit ?? brandLocale;
  if (!candidate?.trim()) return "sv";
  return candidate.trim().replace("_", "-");
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

/**
 * Which app directory the project routes through.
 *
 * Next.js accepts `app/` or `src/app/` but not both, so a project that already
 * has `src/app/layout.tsx` must not receive a root-level `app/robots.ts`.
 */
export function resolveAppRoot(
  files: ReadonlyArray<ProjectTextFile>,
): "app" | "src/app" {
  const hasSrcApp = files.some((f) => f.name.startsWith("src/app/"));
  const hasRootApp = files.some((f) => f.name.startsWith("app/"));
  // Root wins on the (invalid) both-present case: that is what Next.js does.
  if (hasRootApp) return "app";
  return hasSrcApp ? "src/app" : "app";
}

export function applyDeterministicSeoImprovements(
  files: ReadonlyArray<ProjectTextFile>,
  audit: SeoAuditResult,
  options: SeoImproveOptions,
): SeoImproveResult {
  const improvements: SeoImprovement[] = [];
  const language = resolveHtmlLang(options.language, options.brand?.locale);

  const findingsById = new Map<string, typeof audit.findings>();
  for (const f of audit.findings) {
    const list = findingsById.get(f.id) ?? [];
    list.push(f);
    findingsById.set(f.id, list);
  }

  // 1. Placeholder robots/sitemap — rewritten IN PLACE.
  //
  //    Deleting the file and letting the injector below re-create it looks
  //    equivalent and is not: the injector only ever writes the `app/…`
  //    variants, so a project routed through `src/app/` would lose its only
  //    metadata route and gain an `app/robots.ts` Next.js never reads. Keeping
  //    the path means the content template has to come from the canonical
  //    owner instead, which is what `buildCanonicalSeoFileContent` is for.
  let working = [...files];
  const placeholderFindings = findingsById.get("placeholder-site-url") ?? [];
  const placeholderPaths = new Set<string>();
  working = working.map((file) => {
    const flagged = placeholderFindings.some((f) => f.file === file.name);
    if (!flagged || !file.content.includes(PLACEHOLDER_SITE_URL)) return file;
    const canonical = buildCanonicalSeoFileContent(file.name, options.siteUrl);
    if (!canonical || canonical === file.content) return file;
    placeholderPaths.add(file.name);
    improvements.push({
      findingId: "placeholder-site-url",
      file: file.name,
      change: `Skrev om ${file.name} till sajtens riktiga adress i stället för ${PLACEHOLDER_SITE_URL}.`,
      by: "deterministic",
    });
    return { name: file.name, content: canonical };
  });

  // 2. Canonical injection + layout enrichment (robots, sitemap, OG-bild,
  //    metadataBase, alternates, openGraph, twitter).
  //
  //    The injector always writes `app/…`. A project routed through `src/app/`
  //    would then get a second app directory, which Next.js refuses to accept
  //    — so the injected files are relocated to the root the project actually
  //    uses. Relocating beats teaching the injector about roots: it keeps one
  //    owner for the templates.
  const appRoot = resolveAppRoot(working);
  const existingPaths = new Set(working.map((f) => f.name));
  const injected = applySeoToProjectFiles(working, {
    siteUrl: options.siteUrl,
    brand: options.brand,
  });
  const relocate = (path: string) =>
    appRoot === "src/app" && path.startsWith("app/") ? `src/${path}` : path;
  // The injector decides "already present?" on the `app/…` key alone, so a
  // project holding `src/app/robots.ts` looks empty to it and it injects
  // `app/robots.ts`. Relocating that to `src/app/robots.ts` would then put TWO
  // entries with the same name in the deploy payload — including the one step
  // 1 just rewrote — and nothing downstream dedupes them, so which content
  // ships is undefined. Drop the injected copy: the project's own file stays
  // the single owner of the path.
  const collided = new Set(
    injected.injected.filter((path) => relocate(path) !== path && existingPaths.has(relocate(path))),
  );
  working = injected.applied
    ? injected.files
        .filter((file) => !collided.has(file.name))
        .map((file) =>
          injected.injected.includes(file.name)
            ? { name: relocate(file.name), content: file.content }
            : file,
        )
    : working;

  for (const path of injected.injected) {
    // A rewritten placeholder is already reported above; reporting it again as
    // "added" would double-count one change. A dropped collision was never
    // added at all.
    if (placeholderPaths.has(path) || collided.has(path)) continue;
    const findingId =
      path.includes("robots") ? "missing-robots" : path.includes("sitemap") ? "missing-sitemap" : "missing-open-graph";
    improvements.push({
      findingId,
      file: relocate(path),
      change: `Lade till ${relocate(path)}.`,
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

/**
 * Deterministic SEO audit of a generated project.
 *
 * Runs on the file contents the deploy is about to ship, not on the rendered
 * page: the pass has to happen before the Vercel call, and a headless render
 * of an unpublished site is a much bigger machine than the value it adds here.
 * Everything checked below is decidable from the source.
 *
 * Reuses nothing from `seo-preflight.ts` on purpose — that one answers "is
 * this generation broken enough to warn about?" during codegen and returns
 * preflight-shaped issues. This one answers "what should we improve before
 * publishing?" and its findings have to be actionable by the improver.
 */

import type { SeoAuditResult, SeoFinding, SeoFindingId, SeoSeverity } from "./types";

export interface SeoAuditFile {
  path: string;
  content: string;
}

/** Google truncates around here; these are guidance, not hard rules. */
const TITLE_MIN = 15;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;

const LAYOUT_PATHS = ["app/layout.tsx", "src/app/layout.tsx"];
const ROBOTS_PATHS = ["app/robots.ts", "src/app/robots.ts"];
const SITEMAP_PATHS = ["app/sitemap.ts", "src/app/sitemap.ts"];

const METADATA_EXPORT_RE =
  /\bexport\s+(?:const\s+metadata\b|(?:async\s+)?function\s+generateMetadata\b)/;

/**
 * The placeholder host the export baseline writes into robots/sitemap when no
 * real site URL is known. A published site still carrying it tells Google to
 * crawl someone else's domain, which is why it is `critical` rather than a nit.
 */
export const PLACEHOLDER_SITE_URL = "https://example.com";

const SEVERITY_WEIGHT: Record<SeoSeverity, number> = {
  critical: 12,
  important: 6,
  advisory: 2,
};

/** Findings the improver knows how to act on. Keep in sync with `improve.ts`. */
const FIXABLE: ReadonlySet<SeoFindingId> = new Set<SeoFindingId>([
  "missing-metadata-base",
  "missing-canonical",
  "missing-open-graph",
  "missing-robots",
  "missing-sitemap",
  "placeholder-site-url",
  "missing-html-lang",
  "missing-title",
  "title-too-short",
  "title-too-long",
  "missing-description",
  "description-too-short",
  "description-too-long",
]);

function findByPath(files: SeoAuditFile[], candidates: string[]): SeoAuditFile | undefined {
  for (const candidate of candidates) {
    const found = files.find((f) => f.path === candidate || f.path.endsWith(`/${candidate}`));
    if (found) return found;
  }
  return undefined;
}

function isPageFile(path: string): boolean {
  return /(^|\/)app\/.*page\.tsx$/.test(path) || /(^|\/)app\/page\.tsx$/.test(path);
}

function finding(
  id: SeoFindingId,
  severity: SeoSeverity,
  file: string,
  message: string,
): SeoFinding {
  return { id, severity, file, message, fixable: FIXABLE.has(id) };
}

/** Pull a single-quoted/double-quoted string value for `key:` out of source. */
export function extractMetadataString(source: string, key: string): string | null {
  const re = new RegExp(`\\b${key}\\s*:\\s*(["'\`])([^"'\`]*)\\1`);
  const match = source.match(re);
  return match ? match[2] : null;
}

/**
 * `<img>`/`<Image>` occurrences with no `alt` attribute at all.
 *
 * An empty `alt=""` is deliberately NOT flagged: that is the correct markup
 * for a decorative image, and treating it as a defect would push the improver
 * to invent alt text for images that should stay silent to a screen reader.
 */
export function findImagesWithoutAlt(content: string): number {
  const tagRe = /<(img|Image)\b([^>]*)>/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(content)) !== null) {
    const attrs = match[2] ?? "";
    if (!/\balt\s*=/.test(attrs)) count += 1;
  }
  return count;
}

export function auditProjectSeo(files: SeoAuditFile[]): SeoAuditResult {
  const findings: SeoFinding[] = [];

  const layout = findByPath(files, LAYOUT_PATHS);
  const layoutPath = layout?.path ?? "app/layout.tsx";
  const layoutContent = layout?.content ?? "";

  const hasMetadata = METADATA_EXPORT_RE.test(layoutContent);
  if (!hasMetadata) {
    findings.push(
      finding(
        "missing-metadata",
        "critical",
        layoutPath,
        "Sajten exporterar ingen metadata, så Google har varken rubrik eller beskrivning att visa.",
      ),
    );
  }

  const title = hasMetadata ? extractMetadataString(layoutContent, "title") : null;
  if (hasMetadata && title === null) {
    findings.push(
      finding("missing-title", "critical", layoutPath, "Metadata saknar en sidtitel."),
    );
  } else if (title !== null) {
    if (title.trim().length < TITLE_MIN) {
      findings.push(
        finding(
          "title-too-short",
          "important",
          layoutPath,
          `Sidtiteln är ${title.trim().length} tecken — kort titel ger Google lite att gå på (sikta på ${TITLE_MIN}-${TITLE_MAX}).`,
        ),
      );
    } else if (title.trim().length > TITLE_MAX) {
      findings.push(
        finding(
          "title-too-long",
          "advisory",
          layoutPath,
          `Sidtiteln är ${title.trim().length} tecken och klipps troligen i sökresultatet (max ca ${TITLE_MAX}).`,
        ),
      );
    }
  }

  const description = hasMetadata ? extractMetadataString(layoutContent, "description") : null;
  if (hasMetadata && description === null) {
    findings.push(
      finding(
        "missing-description",
        "critical",
        layoutPath,
        "Metadata saknar beskrivning, så Google hittar på en egen text ur sidinnehållet.",
      ),
    );
  } else if (description !== null) {
    const length = description.trim().length;
    if (length < DESCRIPTION_MIN) {
      findings.push(
        finding(
          "description-too-short",
          "important",
          layoutPath,
          `Beskrivningen är ${length} tecken — för kort för att sälja klicket (sikta på ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}).`,
        ),
      );
    } else if (length > DESCRIPTION_MAX) {
      findings.push(
        finding(
          "description-too-long",
          "advisory",
          layoutPath,
          `Beskrivningen är ${length} tecken och klipps i sökresultatet (max ca ${DESCRIPTION_MAX}).`,
        ),
      );
    }
  }

  if (hasMetadata && !/\bmetadataBase\s*:/.test(layoutContent)) {
    findings.push(
      finding(
        "missing-metadata-base",
        "important",
        layoutPath,
        "metadataBase saknas, så delningsbilder och kanoniska länkar blir relativa och pekar fel.",
      ),
    );
  }
  if (hasMetadata && !/\balternates\s*:/.test(layoutContent)) {
    findings.push(
      finding(
        "missing-canonical",
        "important",
        layoutPath,
        "Kanonisk länk saknas, vilket kan göra att samma sida indexeras på flera adresser.",
      ),
    );
  }
  if (hasMetadata && !/\bopenGraph\s*:/.test(layoutContent)) {
    findings.push(
      finding(
        "missing-open-graph",
        "important",
        layoutPath,
        "Open Graph saknas, så länken ser tom ut när någon delar sajten i sociala medier.",
      ),
    );
  }

  if (layout && !/<html[^>]*\slang\s*=/.test(layoutContent)) {
    findings.push(
      finding(
        "missing-html-lang",
        "important",
        layoutPath,
        "html-taggen saknar lang-attribut, så sökmotorer och skärmläsare gissar språket.",
      ),
    );
  }

  const robots = findByPath(files, ROBOTS_PATHS);
  if (!robots) {
    findings.push(
      finding(
        "missing-robots",
        "important",
        "app/robots.ts",
        "Sajten saknar robots.ts, så sökmotorer får ingen anvisning om vad de får läsa.",
      ),
    );
  }
  const sitemap = findByPath(files, SITEMAP_PATHS);
  if (!sitemap) {
    findings.push(
      finding(
        "missing-sitemap",
        "important",
        "app/sitemap.ts",
        "Sajten saknar sitemap.ts, så Google måste hitta undersidorna på egen hand.",
      ),
    );
  }

  // The baseline bug: robots/sitemap exist but still point at example.com.
  // Worse than missing them — the site actively advertises the wrong host.
  for (const file of [robots, sitemap]) {
    if (file && file.content.includes(PLACEHOLDER_SITE_URL)) {
      findings.push(
        finding(
          "placeholder-site-url",
          "critical",
          file.path,
          `${file.path} pekar fortfarande på ${PLACEHOLDER_SITE_URL} i stället för sajtens riktiga adress.`,
        ),
      );
    }
  }

  const pages = files.filter((f) => isPageFile(f.path));
  for (const page of pages) {
    const h1Count = (page.content.match(/<h1\b/gi) ?? []).length;
    if (h1Count === 0) {
      findings.push(
        finding(
          "missing-h1",
          "important",
          page.path,
          `${page.path} saknar h1-rubrik, vilket är den starkaste signalen om vad sidan handlar om.`,
        ),
      );
    } else if (h1Count > 1) {
      findings.push(
        finding(
          "multiple-h1",
          "advisory",
          page.path,
          `${page.path} har ${h1Count} h1-rubriker — använd en och låt resten vara h2.`,
        ),
      );
    }
  }

  for (const file of files) {
    if (!/\.(t|j)sx$/.test(file.path)) continue;
    const missingAlt = findImagesWithoutAlt(file.content);
    if (missingAlt > 0) {
      findings.push(
        finding(
          "image-missing-alt",
          "advisory",
          file.path,
          `${file.path} har ${missingAlt} bild${missingAlt === 1 ? "" : "er"} utan alt-text.`,
        ),
      );
    }
  }

  const hasStructuredData = files.some(
    (f) => f.content.includes("application/ld+json") || f.content.includes("schema.org"),
  );
  if (!hasStructuredData) {
    findings.push(
      finding(
        "missing-structured-data",
        "advisory",
        "project",
        "Sajten saknar strukturerad data (JSON-LD), som ger Google chansen att visa rikare sökresultat.",
      ),
    );
  }

  return {
    findings,
    score: scoreFromFindings(findings),
    pagesInspected: pages.map((p) => p.path),
  };
}

/**
 * A weighted deduction from 100. Not comparable to Lighthouse and not meant to
 * be — it exists so the report can say "72 → 91" and mean something consistent
 * between the two audits in the same pass.
 */
export function scoreFromFindings(findings: SeoFinding[]): number {
  const deduction = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  return Math.max(0, Math.min(100, 100 - deduction));
}

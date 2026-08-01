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

import { readMetadataString } from "./metadata-literal";
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

/** How many import hops out of a page we follow when looking for its heading. */
const COMPONENT_FOLLOW_DEPTH = 2;

const LOCAL_IMPORT_RE = /\bfrom\s*["'](\.[^"']*|@\/[^"']*)["']/g;

/** Resolve one import specifier against the files we were handed. */
function resolveLocalImport(
  files: SeoAuditFile[],
  fromPath: string,
  specifier: string,
): SeoAuditFile | undefined {
  const segments = fromPath.split("/").slice(0, -1);
  let base: string;
  if (specifier.startsWith("@/")) {
    base = `src/${specifier.slice(2)}`;
  } else {
    const parts = [...segments];
    for (const part of specifier.split("/")) {
      if (part === "." || part === "") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    base = parts.join("/");
  }
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
  ];
  for (const candidate of candidates) {
    // `@/…` is `src/…` in a src-rooted project and bare in a flat one, so try
    // the suffix form too rather than guessing the project's shape.
    const found =
      files.find((f) => f.path === candidate) ??
      files.find((f) => f.path.endsWith(`/${candidate}`)) ??
      (candidate.startsWith("src/")
        ? files.find((f) => f.path === candidate.slice(4))
        : undefined);
    if (found) return found;
  }
  return undefined;
}

/**
 * Does this page render an `<h1>`, directly or through a component it imports?
 *
 * Scanning only `page.tsx` is the obvious implementation and the wrong one:
 * `export default function Page() { return <HomePage />; }` is an ordinary
 * shape for generated sites, and flagging it as heading-less produces a defect
 * the improver cannot fix (fixing it means rewriting JSX) on a page that is
 * actually fine. We follow local imports a couple of hops instead, which is
 * cheap because the whole project is already in memory.
 */
function pageRendersH1(files: SeoAuditFile[], page: SeoAuditFile): boolean {
  const seen = new Set<string>([page.path]);
  let frontier: SeoAuditFile[] = [page];
  for (let depth = 0; depth <= COMPONENT_FOLLOW_DEPTH; depth += 1) {
    const next: SeoAuditFile[] = [];
    for (const file of frontier) {
      if (/<h1\b/i.test(file.content)) return true;
      if (depth === COMPONENT_FOLLOW_DEPTH) continue;
      LOCAL_IMPORT_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = LOCAL_IMPORT_RE.exec(file.content)) !== null) {
        const target = resolveLocalImport(files, file.path, match[1]);
        if (!target || seen.has(target.path)) continue;
        seen.add(target.path);
        next.push(target);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return false;
}

function finding(
  id: SeoFindingId,
  severity: SeoSeverity,
  file: string,
  message: string,
): SeoFinding {
  return { id, severity, file, message, fixable: FIXABLE.has(id) };
}

/**
 * Pull a top-level metadata string value for `key:` out of source.
 *
 * `null` means "no literal to judge", which covers two different situations
 * the caller must keep apart — see {@link readMetadataString}. Length rules
 * can only apply to a literal; a computed title is none of our business.
 */
export function extractMetadataString(source: string, key: string): string | null {
  const read = readMetadataString(source, key);
  return read.kind === "literal" ? read.value : null;
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

  // A computed title (`title: getTitle()`, a template with a hole) is present
  // and correct — we simply cannot measure it. Reporting it as missing would
  // hand the owner a defect they cannot fix and the improver a job it must not
  // take, so `dynamic` is silence rather than a finding.
  const titleRead = hasMetadata
    ? readMetadataString(layoutContent, "title")
    : ({ kind: "missing" } as const);
  const title = titleRead.kind === "literal" ? titleRead.value : null;
  if (hasMetadata && titleRead.kind === "missing") {
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

  const descriptionRead = hasMetadata
    ? readMetadataString(layoutContent, "description")
    : ({ kind: "missing" } as const);
  const description = descriptionRead.kind === "literal" ? descriptionRead.value : null;
  if (hasMetadata && descriptionRead.kind === "missing") {
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
    if (h1Count === 0 && !pageRendersH1(files, page)) {
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

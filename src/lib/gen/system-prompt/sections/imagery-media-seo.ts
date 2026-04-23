/**
 * Imagery + Media Catalog + Component References + SEO blocks.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { Brief, MediaCatalogItem } from "../types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}

export function renderImageryBlock(params: {
  brief: Brief | null | undefined;
  styleKeywords: string[];
}): string[] {
  const { brief, styleKeywords } = params;
  // ── Imagery (brief-specific only) ──────────────────────────────────────
  // Exclude imagery.styleKeywords that already appear in visualDirection.styleKeywords
  // (those already feed Scaffold Variant selection). Keep only concrete image subjects/notes.
  if (!brief?.imagery) return [];
  const visualKwSet = new Set(styleKeywords.map((k) => k.toLowerCase()));
  const imgStyleKw = strList(brief.imagery.styleKeywords).filter(
    (k) => !visualKwSet.has(k.toLowerCase()),
  );
  const imgNotes = [
    ...imgStyleKw,
    ...strList(brief.imagery.suggestedSubjects),
    ...strList(brief.imagery.styleNotes),
  ].filter(Boolean);
  if (imgNotes.length === 0) return [];
  return ["## Imagery (from brief)", "", ...imgNotes.map((n) => `- ${n}`), ""];
}

export function renderMediaCatalogBlock(
  mediaCatalog: MediaCatalogItem[] | undefined,
): string[] {
  if (!mediaCatalog || mediaCatalog.length === 0) return [];
  const parts: string[] = [
    "## Media Catalog",
    "",
    "Use the following media assets by their alias. The aliases will be expanded to full URLs during post-processing.",
    "",
  ];
  for (const item of mediaCatalog.slice(0, 30)) {
    const altText = item.alt ? ` (${item.alt})` : "";
    parts.push(`- \`{{${item.alias}}}\`${altText}`);
  }
  parts.push("");
  return parts;
}

export function renderComponentReferencesBlock(
  componentReferences: { name: string; code: string }[] | undefined,
): string[] {
  if (!componentReferences || componentReferences.length === 0) return [];
  const parts: string[] = [
    "## Component References",
    "",
    "Verified usage examples for components relevant to this request. Adapt these patterns to the site — do not copy verbatim.",
    "",
  ];
  for (const ref of componentReferences.slice(0, 5)) {
    parts.push(`### ${ref.name}`, "", "```tsx", ref.code, "```", "");
  }
  return parts;
}

export function renderSeoBlock(brief: Brief | null | undefined): string[] {
  if (!brief?.seo) return [];
  const seoTitle = str(brief.seo.titleTemplate);
  const seoDesc = str(brief.seo.metaDescription);
  const seoKw = strList(brief.seo.keywords);
  if (!seoTitle && !seoDesc && seoKw.length === 0) return [];
  const parts: string[] = ["## SEO", ""];
  if (seoTitle) parts.push(`- **Title template:** ${seoTitle}`);
  if (seoDesc) parts.push(`- **Meta description:** ${seoDesc}`);
  if (seoKw.length > 0) parts.push(`- **Keywords:** ${seoKw.join(", ")}`);
  parts.push("");
  return parts;
}

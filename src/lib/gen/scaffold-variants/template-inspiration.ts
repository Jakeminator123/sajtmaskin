import { posix } from "node:path";

import {
  VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
  type RequestAttachment,
} from "../request-metadata";
import blobManifestData from "../../templates/template-blob-manifest.json";
import type { ScaffoldVariant } from "./types";
import {
  resolveVariantTemplateAddendum,
  type VariantTemplateAddendumResolution,
  type VariantTemplateStructuralReference,
  warnVariantTemplateAddendumFallback,
} from "./variant-template-addendum";

export const VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES = [
  "landing-pages",
  "website-templates",
  "apps-and-games",
  "dashboards",
  "login-and-sign-up",
  "e-commerce",
  "blog-and-portfolio",
] as const;

export type VariantTemplateFullProjectCategory =
  (typeof VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES)[number];

/**
 * Explicitly reviewed complete projects whose gallery category is topical or
 * otherwise too broad to allow as a category. Id, category **and** archive
 * SHA-256 must all match: the id and category stop a regenerated catalog from
 * silently broadening the exception, and the SHA stops the reverse — the same
 * id keeping its reviewed status after the archive behind it was replaced with
 * different content.
 */
export const VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS = {
  h4nibkqysVJ: {
    category: "ai",
    archiveSha256: "4bc0cb3cf73ba2e4f98ded19a1240e040d179faecbcf1c41f7037059a040e337",
  },
} as const;

type VariantTemplateReviewedFullProjectCategory =
  (typeof VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS)[keyof typeof VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS]["category"];

export type VariantTemplateReferenceCategory =
  VariantTemplateFullProjectCategory | VariantTemplateReviewedFullProjectCategory;

/**
 * `previewFits` is deliberately not read here. It describes whether the
 * project archive fits the preview host, which only matters for verbatim
 * import (`POST /api/template`). Inspiration sends a still image plus
 * SHA-bound excerpts and never loads the archive, so filtering candidates on
 * it only let curator-disabled templates outrank usable ones.
 */
type ManifestTemplate = {
  id: string;
  title: string;
  category: string;
  archiveUrl: string;
  archiveSha256: string | null;
  stillImageUrl: string;
};

export type VariantTemplateInspiration = {
  templateId: string;
  title: string;
  category: VariantTemplateReferenceCategory;
  archiveUrl: string;
  stillImageUrl: string;
  structuralReferences: VariantTemplateStructuralReference[];
  /** Deterministic, non-sensitive summary of why this candidate won. */
  selectionReason?: string;
};

type TemplateAddendumLoader = (templateId: string) => VariantTemplateAddendumResolution;

type ResolveVariantTemplateInspirationOptions = {
  includeStructure?: boolean;
  loadAddendum?: TemplateAddendumLoader;
  selectionContext?: VariantTemplateSelectionContext;
};

export type VariantTemplateSelectionContext = {
  /** Raw request text. Used only for deterministic lexical ranking. */
  prompt?: string | null;
  /** Deep Brief. Values are flattened for matching; it never becomes authority here. */
  brief?: unknown;
};

const FULL_PROJECT_CATEGORY_SET = new Set<string>(VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES);
const REVIEWED_FULL_PROJECT_BY_ID: Readonly<
  Record<string, { category: string; archiveSha256: string }>
> = VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS;
const SELECTION_STOP_WORDS = new Set([
  "and",
  "app",
  "att",
  "build",
  "bygga",
  "create",
  "en",
  "ett",
  "for",
  "för",
  "hemsida",
  "i",
  "med",
  "och",
  "page",
  "sajt",
  "site",
  "som",
  "the",
  "till",
  "web",
  "website",
]);

function readManifestTemplates(): ManifestTemplate[] {
  const templates = (blobManifestData as { templates?: unknown }).templates;
  if (!Array.isArray(templates)) return [];
  return templates.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const category = typeof row.category === "string" ? row.category.trim() : "";
    const archiveUrl = typeof row.archiveUrl === "string" ? row.archiveUrl.trim() : "";
    const stillImageUrl = typeof row.stillImageUrl === "string" ? row.stillImageUrl.trim() : "";
    if (!id || !title || !category || !archiveUrl || !stillImageUrl) return [];
    return [
      {
        id,
        title,
        category,
        archiveUrl,
        archiveSha256: typeof row.archiveSha256 === "string" ? row.archiveSha256.trim() : null,
        stillImageUrl,
      },
    ];
  });
}

const TEMPLATE_BY_ID = new Map(
  readManifestTemplates().map((template) => [template.id, template] as const),
);

function isReviewedFullProjectTemplate(template: ManifestTemplate): boolean {
  const reviewed = REVIEWED_FULL_PROJECT_BY_ID[template.id];
  if (!reviewed || reviewed.category !== template.category) return false;
  return template.archiveSha256?.trim().toLowerCase() === reviewed.archiveSha256;
}

function isFullProjectTemplate(
  template: ManifestTemplate,
): template is ManifestTemplate & { category: VariantTemplateReferenceCategory } {
  return (
    FULL_PROJECT_CATEGORY_SET.has(template.category) || isReviewedFullProjectTemplate(template)
  );
}

/**
 * How a configured `sourceTemplateIds` entry relates to runtime selection.
 * Shared with the save-time validator so Backoffice and the integrity gate
 * cannot disagree about which ids are dead config.
 */
export type VariantTemplateCandidateEligibility =
  "unknown-template" | "never-selectable" | "eligible";

export function classifyVariantTemplateCandidate(
  templateId: string,
): VariantTemplateCandidateEligibility {
  const template = TEMPLATE_BY_ID.get(templateId);
  if (!template) return "unknown-template";
  return isFullProjectTemplate(template) ? "eligible" : "never-selectable";
}

/**
 * Pick at most one complete-project Blob template for a variant. Configured
 * source order breaks ties after Deep Brief ranking.
 *
 * A `disabled` addendum is a curator verdict that the whole template is
 * unsuitable as inspiration — not merely that its excerpts are switched off.
 * Such a candidate is therefore never selected, not even for its still image:
 * a usable candidate always wins over it, and when only disabled candidates
 * remain the variant gets no template inspiration at all. `missing`, `stale`
 * and `invalid` stay selectable (still image, no excerpts) because they are
 * data problems, not curation decisions.
 */
export function selectVariantTemplateReference(
  variant: Pick<ScaffoldVariant, "sourceTemplateIds"> | null | undefined,
  options: {
    selectionContext?: VariantTemplateSelectionContext;
    loadAddendum?: TemplateAddendumLoader;
  } = {},
): Omit<VariantTemplateInspiration, "structuralReferences"> | null {
  const eligible = (variant?.sourceTemplateIds ?? []).flatMap((templateId) => {
    const template = TEMPLATE_BY_ID.get(templateId);
    return template && isFullProjectTemplate(template) ? [template] : [];
  });
  const queryTokens = selectionTokens(options.selectionContext);
  const loadAddendum = options.loadAddendum ?? resolveVariantTemplateAddendum;
  const ranked = eligible.flatMap((template, index) => {
    const addendum = loadAddendum(template.id);
    if (addendum.state === "disabled") return [];
    const titleTokens = tokenizeSelectionText(template.title);
    const referenceText =
      addendum.structuralReferences
        ?.map((reference) => `${reference.path} ${reference.excerpt}`)
        .join(" ") ?? "";
    const referenceTokens = tokenizeSelectionText(referenceText);
    let matches = 0;
    let score = addendum.state === "hit" && referenceTokens.size > 0 ? 4 : 0;
    for (const token of queryTokens) {
      if (titleTokens.has(token)) {
        score += 8;
        matches += 1;
      } else if (referenceTokens.has(token)) {
        score += 2;
        matches += 1;
      }
    }
    return [{ template, addendumState: addendum.state, index, matches, score }];
  });
  ranked.sort((a, b) => b.score - a.score || b.matches - a.matches || a.index - b.index);
  const winner = ranked[0];
  if (!winner || !isFullProjectTemplate(winner.template)) return null;
  const selected = winner.template;

  return {
    templateId: selected.id,
    title: selected.title,
    category: selected.category,
    archiveUrl: selected.archiveUrl,
    stillImageUrl: selected.stillImageUrl,
    selectionReason: `brief-ranked:candidates=${ranked.length};matches=${winner.matches};addendum=${winner.addendumState}`,
  };
}

function tokenizeSelectionText(value: string): Set<string> {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return new Set(
    (normalized.match(/[a-z0-9]+/g) ?? []).filter(
      (token) => token.length >= 3 && !SELECTION_STOP_WORDS.has(token),
    ),
  );
}

/**
 * Brief fields whose values are NEGATIVE signals ("do not do this"). Flattening
 * them into the positive token pool would boost exactly the templates the user
 * asked to avoid — `avoid: ["minimal"]` must not rank a minimal template up.
 */
const NEGATIVE_SELECTION_KEYS = new Set(["avoid", "avoidpatterns", "antipatterns"]);

function selectionTokens(context: VariantTemplateSelectionContext | undefined): Set<string> {
  const values: string[] = [];
  if (typeof context?.prompt === "string") values.push(context.prompt.slice(0, 8_000));

  const visit = (value: unknown, depth: number) => {
    if (values.join(" ").length >= 16_000 || depth > 4 || value == null) return;
    if (typeof value === "string") {
      values.push(value.slice(0, 1_000));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 24)) visit(item, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
        if (NEGATIVE_SELECTION_KEYS.has(key.toLowerCase())) continue;
        visit(item, depth + 1);
      }
    }
  };
  visit(context?.brief, 0);
  return tokenizeSelectionText(values.join(" "));
}

/**
 * Resolve one selected template. A SHA-bound addendum is the only
 * inspiration source in the user-site hot path. `missing` / `stale` /
 * `invalid` stay silent (empty excerpts + still image) instead of
 * fetching the archive. Offline `templates:addenda` still reads ZIPs.
 */
export async function resolveVariantTemplateInspiration(
  variant: Pick<ScaffoldVariant, "sourceTemplateIds"> | null | undefined,
  options: ResolveVariantTemplateInspirationOptions = {},
): Promise<VariantTemplateInspiration | null> {
  const selected = selectVariantTemplateReference(variant, {
    selectionContext: options.selectionContext,
    loadAddendum: options.loadAddendum,
  });
  if (!selected) return null;

  const includeStructure = options.includeStructure ?? process.env.NODE_ENV !== "test";
  if (!includeStructure) return { ...selected, structuralReferences: [] };

  const addendum = (options.loadAddendum ?? resolveVariantTemplateAddendum)(selected.templateId);
  if (addendum.structuralReferences !== null) {
    return { ...selected, structuralReferences: addendum.structuralReferences };
  }

  if (addendum.state === "missing" || addendum.state === "stale" || addendum.state === "invalid") {
    warnVariantTemplateAddendumFallback(selected.templateId, addendum);
  }

  return { ...selected, structuralReferences: [] };
}

/** Build review-safe metadata for the exact id already selected by runtime. */
export function getVariantTemplateReviewReference(templateId: string): {
  templateId: string;
  title: string;
  category: VariantTemplateReferenceCategory;
  addendumState: VariantTemplateAddendumResolution["state"];
  hasStructuralReferences: boolean;
} | null {
  const template = TEMPLATE_BY_ID.get(templateId);
  if (!template || !isFullProjectTemplate(template)) return null;
  const addendum = resolveVariantTemplateAddendum(templateId);
  return {
    templateId,
    title: template.title,
    category: template.category,
    addendumState: addendum.state,
    hasStructuralReferences: (addendum.structuralReferences?.length ?? 0) > 0,
  };
}

function stillImageExtension(url: string): string {
  try {
    const extension = posix.extname(new URL(url).pathname).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension) ? extension : ".jpg";
  } catch {
    return ".jpg";
  }
}

export function buildVariantTemplateReferenceAttachments(
  inspiration: VariantTemplateInspiration | null | undefined,
): RequestAttachment[] {
  if (!inspiration?.stillImageUrl) return [];
  return [
    {
      type: "system_reference",
      url: inspiration.stillImageUrl,
      filename: `${inspiration.templateId}-style-reference${stillImageExtension(
        inspiration.stillImageUrl,
      )}`,
      purpose: VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
    },
  ];
}

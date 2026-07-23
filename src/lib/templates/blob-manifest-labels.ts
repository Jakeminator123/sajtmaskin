/**
 * Human-readable labels for v0-mall Blob ids.
 *
 * Variant `sourceTemplateIds` are opaque Blob ids (e.g. `8Y9E0cStKrW`) after the
 * 2026-07-22 remap. When these ids are rendered into the system prompt verbatim
 * the model only sees noise. This resolves an id to its manifest title (and
 * category) so the "Derived from curated references" prompt line stays
 * meaningful. Falls back to the raw id for legacy labels that are not in the
 * Blob manifest (harmless — they are just reference text, nothing is injected).
 *
 * Source of truth: `src/lib/templates/template-blob-manifest.json`.
 */
import blobManifestData from "./template-blob-manifest.json";

type BlobTemplateLabel = { id: string; title: string; category: string };

let lookupCache: Map<string, BlobTemplateLabel> | null = null;

function buildLookup(): Map<string, BlobTemplateLabel> {
  const map = new Map<string, BlobTemplateLabel>();
  const templates = (blobManifestData as { templates?: unknown }).templates;
  if (!Array.isArray(templates)) return map;
  for (const item of templates) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    map.set(id, {
      id,
      title: typeof row.title === "string" ? row.title.trim() : "",
      category: typeof row.category === "string" ? row.category.trim() : "",
    });
  }
  return map;
}

function getLookup(): Map<string, BlobTemplateLabel> {
  if (!lookupCache) lookupCache = buildLookup();
  return lookupCache;
}

/**
 * Resolve a single Blob id to `"Title (category)"`. Returns the raw id when the
 * id is not present in the Blob manifest (legacy label) or has no title.
 */
export function resolveBlobTemplateReferenceLabel(id: string): string {
  const trimmed = id.trim();
  const entry = getLookup().get(trimmed);
  if (!entry || !entry.title) return trimmed;
  return entry.category ? `${entry.title} (${entry.category})` : entry.title;
}

/** Resolve a list of Blob ids to human-readable reference labels. */
export function resolveBlobTemplateReferenceLabels(ids: readonly string[]): string[] {
  return ids.map(resolveBlobTemplateReferenceLabel);
}

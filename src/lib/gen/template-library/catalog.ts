import rawCatalog from "./template-library.generated.json";
import type { TemplateLibraryCatalogFile, TemplateLibraryEntry } from "./types";

const catalog = rawCatalog as TemplateLibraryCatalogFile;
const entryById = new Map((catalog.entries ?? []).map((entry) => [entry.id, entry]));

export function getTemplateLibraryCatalog(): TemplateLibraryCatalogFile {
  return catalog;
}

export function getTemplateLibraryEntries(): TemplateLibraryEntry[] {
  return catalog.entries ?? [];
}

export function getTemplateLibraryEntryById(id: string): TemplateLibraryEntry | null {
  return entryById.get(id) ?? null;
}

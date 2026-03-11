import rawCatalog from "./template-library.generated.json";
import type { TemplateLibraryCatalogFile, TemplateLibraryEntry } from "./types";

const catalog = rawCatalog as TemplateLibraryCatalogFile;

export function getTemplateLibraryCatalog(): TemplateLibraryCatalogFile {
  return catalog;
}

export function getTemplateLibraryEntries(): TemplateLibraryEntry[] {
  return catalog.entries ?? [];
}

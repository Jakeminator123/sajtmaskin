export { getTemplateLibraryCatalog, getTemplateLibraryEntries } from "./catalog";
export {
  TEMPLATE_LIBRARY_EMBEDDING_DIMENSIONS,
  TEMPLATE_LIBRARY_EMBEDDING_MODEL,
  generateTemplateLibraryEmbeddings,
} from "./embeddings-core";
export { searchTemplateLibrary } from "./search";
export type {
  TemplateLibraryCatalogFile,
  TemplateLibraryEntry,
  TemplateLibraryRepoInfo,
  TemplateLibrarySearchResult,
  TemplateLibrarySelectedFile,
  TemplateLibrarySignals,
  TemplateLibraryVerdict,
} from "./types";

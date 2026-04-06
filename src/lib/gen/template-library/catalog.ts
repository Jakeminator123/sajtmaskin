import { FEATURES } from "@/lib/config";
import type { TemplateLibraryCatalogFile, TemplateLibraryEntry } from "./types";

const EXTERNAL_TEMPLATES_ROOT_MARKERS = [
  "/data/external-template-pipeline/",
  "/research/external-templates/",
];
const DEFAULT_SOURCE_ROOT = "data/external-template-pipeline/raw-discovery/current";

const EMPTY_CATALOG: TemplateLibraryCatalogFile = {
  generatedAt: "",
  sourceRoot: DEFAULT_SOURCE_ROOT,
  totalTemplates: 0,
  curatedTemplates: 0,
  entries: [],
};

function loadRawCatalog(): TemplateLibraryCatalogFile {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./template-library.generated.json") as TemplateLibraryCatalogFile;
  } catch (error) {
    if (FEATURES.strictGeneratedArtifacts) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[template-library] Missing or unreadable generated catalog. ` +
        `Expected src/lib/gen/template-library/template-library.generated.json. ${reason}`,
      );
    }
    return EMPTY_CATALOG;
  }
}

function sanitizeCatalogPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized) return null;

  for (const marker of EXTERNAL_TEMPLATES_ROOT_MARKERS) {
    const markerIndex = normalized.toLowerCase().indexOf(marker);
    if (markerIndex >= 0) {
      return normalized.slice(markerIndex + 1);
    }
  }

  const isAbsolute = /^[a-z]:\//i.test(normalized) || normalized.startsWith("/");
  if (isAbsolute) return null;
  return normalized.replace(/^\.\//, "");
}

function sanitizeEntry(entry: TemplateLibraryEntry): TemplateLibraryEntry {
  return {
    ...entry,
    repo: {
      ...entry.repo,
      clonePath: sanitizeCatalogPath(entry.repo.clonePath),
    },
  };
}

function sanitizeCatalog(catalog: TemplateLibraryCatalogFile): TemplateLibraryCatalogFile {
  return {
    ...catalog,
    sourceRoot: sanitizeCatalogPath(catalog.sourceRoot) ?? DEFAULT_SOURCE_ROOT,
    entries: (catalog.entries ?? []).map(sanitizeEntry),
  };
}

const catalog = sanitizeCatalog(loadRawCatalog());
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

import type { InferredCapabilities } from "../capability-inference";
import {
  getTemplateLibraryEntries,
  getTemplateLibraryEntryById,
} from "../template-library/catalog";
import { trimExcerpt } from "../template-library/search";
import type {
  TemplateLibraryEntry,
  TemplateLibrarySelectedFile,
  TemplateLibrarySignals,
} from "../template-library/types";
import type { ScaffoldId } from "../scaffolds/types";
import type { ScaffoldVariant } from "./types";

const MAX_STRUCTURAL_REFERENCE_FILES = 3;
const MAX_STRUCTURAL_REFERENCE_TOTAL_CHARS = 16_000;
const MAX_STRUCTURAL_REFERENCE_EXCERPT_CHARS = 5_500;
type StructuralFileKind = "layout" | "middleware" | "page";

export interface VariantStructuralFileReference {
  sourceId: string;
  sourceTitle: string;
  path: string;
  reason: string;
  excerpt: string;
  truncated: boolean;
}

export interface VariantStructuralFilesSelection {
  files: VariantStructuralFileReference[];
  sourceIds: string[];
  totalChars: number;
}

function structuralFilePriority(file: TemplateLibrarySelectedFile): number {
  const normalized = file.path.replace(/\\/g, "/").toLowerCase();
  if (/(^|\/)(?:src\/)?app\/layout\.(?:[jt]sx?)$/.test(normalized)) return 50;
  if (/(^|\/)middleware\.(?:[jt]sx?)$/.test(normalized)) return 45;
  if (/(^|\/)(?:src\/)?app\/page\.(?:[jt]sx?)$/.test(normalized)) return 40;
  if (/(^|\/)layout\.(?:[jt]sx?)$/.test(normalized)) return 30;
  if (/(^|\/)page\.(?:[jt]sx?)$/.test(normalized)) return 25;
  return -1;
}

function structuralFileKind(file: TemplateLibrarySelectedFile): StructuralFileKind | null {
  const normalized = file.path.replace(/\\/g, "/").toLowerCase();
  if (/(^|\/)middleware\.(?:[jt]sx?)$/.test(normalized)) return "middleware";
  if (/(^|\/)layout\.(?:[jt]sx?)$/.test(normalized)) return "layout";
  if (/(^|\/)page\.(?:[jt]sx?)$/.test(normalized)) return "page";
  return null;
}

function selectStructuralFilesForEntry(entry: TemplateLibraryEntry): TemplateLibrarySelectedFile[] {
  return entry.selectedFiles
    .map((file, index) => ({
      file,
      index,
      priority: structuralFilePriority(file),
    }))
    .filter((candidate) => candidate.priority >= 0)
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .map((candidate) => candidate.file);
}

function buildReferenceFile(
  file: TemplateLibrarySelectedFile,
  sourceId: string,
  sourceTitle: string,
  remainingChars: number,
): VariantStructuralFileReference | null {
  if (remainingChars < 200) return null;
  const excerpt = trimExcerpt(
    file.excerpt,
    Math.min(MAX_STRUCTURAL_REFERENCE_EXCERPT_CHARS, remainingChars),
  );
  if (!excerpt.trim()) return null;
  return {
    sourceId,
    sourceTitle,
    path: file.path,
    reason: file.reason,
    excerpt,
    truncated: excerpt.includes("// ... truncated"),
  };
}

export function selectVariantStructuralFiles(
  variant: ScaffoldVariant | null | undefined,
  enabled: boolean,
): VariantStructuralFilesSelection | null {
  if (!enabled || !variant?.sourceTemplateIds?.length) return null;

  const scaffoldId = variant.scaffoldId;
  const sources = variant.sourceTemplateIds
    .map((sourceId) => {
      const entry = getTemplateLibraryEntryById(sourceId);
      if (!entry) return null;
      const files = selectStructuralFilesForEntry(entry);
      if (files.length === 0) return null;
      const scaffoldRelevance = entry.recommendedScaffoldIds.includes(scaffoldId)
        ? 1
        : 0;
      return {
        id: entry.id,
        title: entry.title,
        files,
        scaffoldRelevance,
      };
    })
    .filter(
      (
        source,
      ): source is {
        id: string;
        title: string;
        files: TemplateLibrarySelectedFile[];
        scaffoldRelevance: number;
      } => Boolean(source),
    )
    .sort((a, b) => b.scaffoldRelevance - a.scaffoldRelevance);

  if (sources.length === 0) return null;

  const files: VariantStructuralFileReference[] = [];
  const seen = new Set<string>();
  let totalChars = 0;

  const tryAddFile = (
    sourceId: string,
    sourceTitle: string,
    file: TemplateLibrarySelectedFile,
  ): boolean => {
    if (files.length >= MAX_STRUCTURAL_REFERENCE_FILES) return false;
    const dedupeKey = `${sourceId}::${file.path}`;
    if (seen.has(dedupeKey)) return false;
    const remainingChars = MAX_STRUCTURAL_REFERENCE_TOTAL_CHARS - totalChars;
    const reference = buildReferenceFile(file, sourceId, sourceTitle, remainingChars);
    if (!reference) return false;
    files.push(reference);
    seen.add(dedupeKey);
    totalChars += reference.excerpt.length;
    return true;
  };

  // First pass: prefer one structural file from each source for diversity.
  for (const preferredKind of ["layout", "middleware", "page"] as const) {
    if (files.length >= MAX_STRUCTURAL_REFERENCE_FILES) break;
    for (const source of sources) {
      const file = source.files.find(
        (candidate) => structuralFileKind(candidate) === preferredKind,
      );
      if (!file) continue;
      if (tryAddFile(source.id, source.title, file)) break;
    }
  }

  // Second pass: fill the remaining slots using the next-best file per source.
  for (let fileIndex = 1; fileIndex < 6; fileIndex += 1) {
    if (files.length >= MAX_STRUCTURAL_REFERENCE_FILES) break;
    for (const source of sources) {
      if (files.length >= MAX_STRUCTURAL_REFERENCE_FILES) break;
      const file = source.files[fileIndex];
      if (!file) continue;
      tryAddFile(source.id, source.title, file);
    }
  }

  if (files.length === 0) return null;

  return {
    files,
    sourceIds: [...new Set(files.map((file) => file.sourceId))],
    totalChars,
  };
}

const MAX_CAPABILITY_REFERENCE_FILES = 2;
const MAX_CAPABILITY_REFERENCE_TOTAL_CHARS = 8_000;

type CapabilitySignalMapping = {
  capabilityKey: keyof InferredCapabilities;
  signalKey: keyof TemplateLibrarySignals;
};

const CAPABILITY_SIGNAL_MAP: CapabilitySignalMapping[] = [
  { capabilityKey: "needsAuth", signalKey: "auth" },
  { capabilityKey: "needsEcommerce", signalKey: "ecommerce" },
  { capabilityKey: "needsAppShell", signalKey: "dashboard" },
  { capabilityKey: "needsCharts", signalKey: "dashboard" },
  { capabilityKey: "needsDataUI", signalKey: "dashboard" },
];

export function selectCapabilityStructuralFiles(
  capabilities: InferredCapabilities,
  scaffoldId: ScaffoldId | string | null | undefined,
  usedSourceIds: string[] | undefined,
  enabled: boolean,
): VariantStructuralFilesSelection | null {
  if (!enabled || !scaffoldId) return null;

  const usedSet = new Set(usedSourceIds ?? []);
  const neededSignals = new Set<keyof TemplateLibrarySignals>();
  for (const mapping of CAPABILITY_SIGNAL_MAP) {
    if (capabilities[mapping.capabilityKey]) {
      neededSignals.add(mapping.signalKey);
    }
  }
  if (neededSignals.size === 0) return null;

  const allEntries = getTemplateLibraryEntries();

  const files: VariantStructuralFileReference[] = [];
  const seen = new Set<string>();
  let totalChars = 0;
  const sourceIds: string[] = [];

  for (const signalKey of neededSignals) {
    if (files.length >= MAX_CAPABILITY_REFERENCE_FILES) break;

    const candidates = allEntries
      .filter((entry) => entry.signals[signalKey] && !usedSet.has(entry.id))
      .map((entry) => {
        const structuralFiles = selectStructuralFilesForEntry(entry);
        if (structuralFiles.length === 0) return null;
        const relevance =
          (entry.recommendedScaffoldIds.includes(scaffoldId as ScaffoldId) ? 10 : 0) +
          entry.qualityScore / 10;
        return { entry, structuralFiles, relevance };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          entry: TemplateLibraryEntry;
          structuralFiles: TemplateLibrarySelectedFile[];
          relevance: number;
        } => Boolean(candidate),
      )
      .sort((a, b) => b.relevance - a.relevance);

    for (const candidate of candidates) {
      if (files.length >= MAX_CAPABILITY_REFERENCE_FILES) break;

      for (const file of candidate.structuralFiles) {
        if (files.length >= MAX_CAPABILITY_REFERENCE_FILES) break;
        const dedupeKey = `${candidate.entry.id}::${file.path}`;
        if (seen.has(dedupeKey)) continue;
        const remainingChars = MAX_CAPABILITY_REFERENCE_TOTAL_CHARS - totalChars;
        const reference = buildReferenceFile(
          file,
          candidate.entry.id,
          candidate.entry.title,
          remainingChars,
        );
        if (!reference) continue;
        files.push(reference);
        seen.add(dedupeKey);
        totalChars += reference.excerpt.length;
        if (!sourceIds.includes(candidate.entry.id)) {
          sourceIds.push(candidate.entry.id);
        }
        usedSet.add(candidate.entry.id);
        break;
      }
    }
  }

  if (files.length === 0) return null;

  return {
    files,
    sourceIds,
    totalChars,
  };
}

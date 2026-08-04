import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import { collectImportDependencies } from "./import-graph";

export type TargetedRepairBundle = {
  contentForFixer: string;
  requiredFiles: string[];
  mergeBack: (fixerContent: string) => string;
};

export function buildTargetedRepairBundle(params: {
  fullContent: string;
  brokenFiles: string[];
  maxFiles: number;
}): TargetedRepairBundle | null {
  const parsed = parseCodeProject(params.fullContent).files;
  if (parsed.length === 0) return null;

  const byPath = new Map(parsed.map((file) => [file.path, file]));
  const knownFiles = new Set(byPath.keys());
  const seed = params.brokenFiles.filter((file) => byPath.has(file));
  if (seed.length === 0) return null;

  const withDependencies = collectImportDependencies(
    seed,
    new Map(parsed.map((file) => [file.path, file.content])),
    knownFiles,
  );
  const selectedPaths = withDependencies.slice(0, Math.max(1, params.maxFiles));
  if (selectedPaths.length === 0 || selectedPaths.length >= parsed.length) return null;

  const selectedFiles = selectedPaths
    .map((pathName) => byPath.get(pathName))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
  if (selectedFiles.length === 0) return null;

  const fullFileOrder = parsed.map((file) => file.path);
  const fullFileMap = new Map(parsed.map((file) => [file.path, file]));

  return {
    contentForFixer: serializeCodeProject(selectedFiles),
    requiredFiles: selectedFiles.map((file) => file.path),
    mergeBack: (fixerContent: string) => {
      const fixedFiles = parseCodeProject(fixerContent).files;
      if (fixedFiles.length === 0) return params.fullContent;

      const mergedMap = new Map(fullFileMap);
      for (const fixed of fixedFiles) mergedMap.set(fixed.path, fixed);

      const merged = [
        ...fullFileOrder
          .map((pathName) => mergedMap.get(pathName))
          .filter((file): file is NonNullable<typeof file> => Boolean(file)),
        ...[...mergedMap.values()].filter((file) => !fullFileOrder.includes(file.path)),
      ];
      return serializeCodeProject(merged);
    },
  };
}

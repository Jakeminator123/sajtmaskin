import { buildCompleteProject } from "@/lib/gen/export/project-scaffold";
import { collectRequiredUiComponents } from "@/lib/gen/export/project-scaffold-ui-reader";
import type { CodeFile } from "@/lib/gen/parser";
import { landingPageManifest } from "@/lib/gen/scaffolds/landing-page/manifest";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import {
  isBuiltinPackage,
  parseManifestDependencySpec,
  resolveExportableVersion,
} from "@/lib/gen/autofix/dep-completer";
import { mapDossierPathToOutput } from "./output-path";
import { getDossierById, getDossierFileContent } from "./registry";
import type { DossierEntry } from "./types";

export interface DossierAcceptanceProject {
  dossier: DossierEntry;
  files: CodeFile[];
}

function asCodeFile(path: string, content: string): CodeFile {
  return { path, content, language: inferFileLanguage(path) };
}

/**
 * Materialize the same keyless generated-project shape that scheduled dossier
 * acceptance builds use. The dossier wins path collisions over the common
 * landing-page scaffold; export baseline completion then supplies package,
 * tsconfig and framework files exactly as a generated user project receives
 * them.
 *
 * Covers every dossier that SHIPS FILES — hard and soft alike. The former
 * hard-only guard left soft verbatim components without any typecheck against
 * their pinned dependencies, which is exactly how `maplibre-map`'s
 * `.default`-import rotted unnoticed when maplibre-gl v6 dropped its default
 * export (prod chat 3a6c5472, 2026-08-05). A dossier with zero files has
 * nothing to build and is still rejected.
 */
export function buildDossierAcceptanceProject(dossierId: string): DossierAcceptanceProject {
  const dossier = getDossierById(dossierId);
  if (!dossier) throw new Error(`Unknown dossier: ${dossierId}`);
  if ((dossier.files ?? []).length === 0) {
    throw new Error(`Acceptance build requires a dossier with declared files: ${dossierId}`);
  }

  const byPath = new Map<string, CodeFile>();
  for (const file of landingPageManifest.files) {
    byPath.set(file.path, asCodeFile(file.path, file.content));
  }
  for (const file of dossier.files ?? []) {
    const content = getDossierFileContent(dossier.class, dossier.id, file.path);
    if (content === null) {
      throw new Error(`${dossier.id}: declared file could not be read: ${file.path}`);
    }
    const outputPath = mapDossierPathToOutput(file.path);
    byPath.set(outputPath, asCodeFile(outputPath, content));
  }

  const generatedFiles = Array.from(byPath.values());
  const files = buildCompleteProject(generatedFiles, collectRequiredUiComponents(generatedFiles));
  const packageFile = files.find((file) => file.path === "package.json");
  if (!packageFile) throw new Error(`${dossier.id}: materialized project lacks package.json`);
  const packageJson = JSON.parse(packageFile.content) as {
    name?: string;
    private?: boolean;
    dependencies?: Record<string, string>;
  };
  const dependencies = { ...(packageJson.dependencies ?? {}) };
  for (const raw of dossier.dependencies ?? []) {
    const { pkg } = parseManifestDependencySpec(raw);
    if (!pkg || isBuiltinPackage(pkg)) continue;
    const range = resolveExportableVersion(pkg);
    if (!range || range === "latest" || range === "*") {
      throw new Error(`${dossier.id}: no deterministic export range for ${pkg}`);
    }
    dependencies[pkg] ??= range;
  }
  packageFile.content = JSON.stringify(
    {
      ...packageJson,
      name: `sajtmaskin-dossier-${dossier.id}`,
      private: true,
      dependencies,
    },
    null,
    2,
  );

  return { dossier, files };
}

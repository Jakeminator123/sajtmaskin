import { FEATURES } from "@/lib/config";
import type { ScaffoldManifest } from "./types";

export type ScaffoldResearchFile = {
  generatedAt: string;
  source: string;
  scaffolds: Record<
    string,
    Pick<ScaffoldManifest, "qualityChecklist" | "research">
  >;
};

type TemplateResolver = (id: string) => unknown;

const EMPTY_SCAFFOLD_RESEARCH: ScaffoldResearchFile = {
  generatedAt: "",
  source: "",
  scaffolds: {},
};

let cachedScaffoldResearch: ScaffoldResearchFile | null = null;

function isPipelineRebuildContext(): boolean {
  const argv1 = (process.argv[1] ?? "").replace(/\\/g, "/");
  return (
    argv1.endsWith("/scripts/template-library/build-template-library.ts") ||
    argv1.endsWith("/scripts/embeddings/generate-scaffold-embeddings.ts") ||
    argv1.endsWith("/scripts/scaffolds/promote-to-scaffold.ts")
  );
}

function loadScaffoldResearch(): ScaffoldResearchFile {
  if (cachedScaffoldResearch) return cachedScaffoldResearch;
  const allowEmptyDuringRebuild = isPipelineRebuildContext();

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rawResearch = require("./scaffold-research.generated.json") as
      | ScaffoldResearchFile
      | undefined;
    if (!rawResearch && FEATURES.strictGeneratedArtifacts && !allowEmptyDuringRebuild) {
      throw new Error("scaffold-research.generated.json loaded empty content");
    }
    const research = rawResearch ?? EMPTY_SCAFFOLD_RESEARCH;
    if (FEATURES.strictGeneratedArtifacts && !allowEmptyDuringRebuild) {
      validateReferenceTemplateIds(research, resolveTemplateLibraryEntryById);
    }
    cachedScaffoldResearch = research;
  } catch (error) {
    if (FEATURES.strictGeneratedArtifacts && !allowEmptyDuringRebuild) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[scaffolds] Missing or unreadable generated scaffold research. ` +
        `Expected src/lib/gen/scaffolds/scaffold-research.generated.json. ${reason}`,
      );
    }
    cachedScaffoldResearch = EMPTY_SCAFFOLD_RESEARCH;
  }

  return cachedScaffoldResearch;
}

function resolveTemplateLibraryEntryById(id: string): unknown {
  // Avoid importing template-library catalog during pipeline rebuild contexts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getTemplateLibraryEntryById } = require("../template-library/catalog") as
    typeof import("../template-library/catalog");
  return getTemplateLibraryEntryById(id);
}

export function validateReferenceTemplateIds(
  research: ScaffoldResearchFile,
  resolveTemplateById: TemplateResolver,
): void {
  const missingRefs: string[] = [];

  for (const [scaffoldId, override] of Object.entries(research.scaffolds ?? {})) {
    for (const reference of override.research?.referenceTemplates ?? []) {
      if (!resolveTemplateById(reference.id)) {
        missingRefs.push(`${scaffoldId}:${reference.id}`);
      }
    }
  }

  if (missingRefs.length === 0) return;
  const examples = missingRefs.slice(0, 6).join(", ");
  const more = missingRefs.length > 6 ? ` (+${missingRefs.length - 6} more)` : "";
  throw new Error(
    `[scaffolds] scaffold-research.generated.json references template ids not present in template-library.generated.json: ${examples}${more}. Rebuild template-library artifacts.`,
  );
}

export function getScaffoldResearchOverrides(
  scaffoldId: string,
): Pick<ScaffoldManifest, "qualityChecklist" | "research"> {
  return loadScaffoldResearch().scaffolds[scaffoldId] ?? {};
}


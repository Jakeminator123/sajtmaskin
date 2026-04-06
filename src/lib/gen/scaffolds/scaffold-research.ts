import { FEATURES } from "@/lib/config";
import type { ScaffoldManifest } from "./types";

type ScaffoldResearchFile = {
  generatedAt: string;
  source: string;
  scaffolds: Record<
    string,
    Pick<ScaffoldManifest, "qualityChecklist" | "research">
  >;
};

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
    cachedScaffoldResearch = rawResearch ?? EMPTY_SCAFFOLD_RESEARCH;
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

export function getScaffoldResearchOverrides(
  scaffoldId: string,
): Pick<ScaffoldManifest, "qualityChecklist" | "research"> {
  return loadScaffoldResearch().scaffolds[scaffoldId] ?? {};
}


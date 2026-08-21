import { FEATURES } from "@/lib/config";
import type { ScaffoldManifest } from "./types";

export type ScaffoldResearchFile = {
  generatedAt: string;
  source: string;
  scaffolds: Record<string, Pick<ScaffoldManifest, "qualityChecklist" | "research">>;
};

const EMPTY_SCAFFOLD_RESEARCH: ScaffoldResearchFile = {
  generatedAt: "",
  source: "",
  scaffolds: {},
};

let cachedScaffoldResearch: ScaffoldResearchFile | null = null;

function loadScaffoldResearch(): ScaffoldResearchFile {
  if (cachedScaffoldResearch) return cachedScaffoldResearch;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rawResearch = require("./scaffold-research.generated.json") as
      ScaffoldResearchFile | undefined;
    if (!rawResearch && FEATURES.strictGeneratedArtifacts) {
      throw new Error("scaffold-research.generated.json loaded empty content");
    }
    cachedScaffoldResearch = rawResearch ?? EMPTY_SCAFFOLD_RESEARCH;
  } catch (error) {
    if (FEATURES.strictGeneratedArtifacts) {
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

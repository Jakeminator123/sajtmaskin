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

function loadScaffoldResearch(): ScaffoldResearchFile {
  if (cachedScaffoldResearch) return cachedScaffoldResearch;

  try {
    // Build/bootstrap flows may delete this artifact before regenerating it.
    // Fall back to empty overrides so the pipeline can reconstruct the file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rawResearch = require("./scaffold-research.generated.json") as
      | ScaffoldResearchFile
      | undefined;
    cachedScaffoldResearch = rawResearch ?? EMPTY_SCAFFOLD_RESEARCH;
  } catch {
    cachedScaffoldResearch = EMPTY_SCAFFOLD_RESEARCH;
  }

  return cachedScaffoldResearch;
}

export function getScaffoldResearchOverrides(
  scaffoldId: string,
): Pick<ScaffoldManifest, "qualityChecklist" | "research"> {
  return loadScaffoldResearch().scaffolds[scaffoldId] ?? {};
}


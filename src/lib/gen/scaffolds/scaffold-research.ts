import rawResearch from "./scaffold-research.generated.json";
import type { ScaffoldManifest } from "./types";

type ScaffoldResearchFile = {
  generatedAt: string;
  source: string;
  scaffolds: Record<
    string,
    Pick<ScaffoldManifest, "qualityChecklist" | "research">
  >;
};

const scaffoldResearch = rawResearch as ScaffoldResearchFile;

export function getScaffoldResearchOverrides(
  scaffoldId: string,
): Pick<ScaffoldManifest, "qualityChecklist" | "research"> {
  return scaffoldResearch.scaffolds[scaffoldId] ?? {};
}

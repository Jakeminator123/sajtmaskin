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

function loadScaffoldResearch(): ScaffoldResearchFile {
  if (cachedScaffoldResearch) return cachedScaffoldResearch;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rawResearch = require("./scaffold-research.generated.json") as
      | ScaffoldResearchFile
      | undefined;
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

/**
 * Generic reference-template-id validator. Kept exported so the test suite can
 * still exercise the shape, but no longer wired into runtime — the legacy
 * template-library catalog it used to cross-check against was removed in the
 * 2026-04-17 cleanup.
 */
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


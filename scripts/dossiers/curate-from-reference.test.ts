import { describe, expect, it } from "vitest";

import {
  allowedCurationModels,
  CURATION_WORKLOAD_ID,
  parseArgs,
  resolveCurationModel,
} from "./curate-from-reference";
import {
  getWorkloadDefaultModelFromManifest,
  getWorkloadFallbackModelsFromManifest,
} from "../../src/lib/ai-models/load-manifest";

/**
 * Fas D: the curation model comes from `config/ai_models/manifest.json`
 * (workload `backoffice_dossier_curation`), not from a literal in this script.
 * An unknown `--model=` must fail BEFORE the OpenAI call — a typo should cost
 * nothing instead of a ~30s request that 404s or runs the wrong model.
 */
const BASE_ARGV = [
  "node",
  "curate-from-reference.ts",
  "--reference=ai-fal-image-generator",
  "--class=hard",
  "--id=fal-image-generator",
];

describe("curation model resolution", () => {
  it("offers exactly the manifest's defaultModel + fallbackModels, in order", () => {
    const expected = [
      getWorkloadDefaultModelFromManifest(CURATION_WORKLOAD_ID),
      ...getWorkloadFallbackModelsFromManifest(CURATION_WORKLOAD_ID),
    ];
    expect(allowedCurationModels()).toEqual([...new Set(expected)]);
  });

  it("defaults to the manifest's defaultModel when --model is omitted", () => {
    expect(resolveCurationModel(undefined)).toBe(
      getWorkloadDefaultModelFromManifest(CURATION_WORKLOAD_ID),
    );
    expect(resolveCurationModel("")).toBe(
      getWorkloadDefaultModelFromManifest(CURATION_WORKLOAD_ID),
    );
    expect(parseArgs(BASE_ARGV).model).toBe(
      getWorkloadDefaultModelFromManifest(CURATION_WORKLOAD_ID),
    );
  });

  it("accepts every id the manifest entry lists", () => {
    for (const id of allowedCurationModels()) {
      expect(resolveCurationModel(id)).toBe(id);
      expect(parseArgs([...BASE_ARGV, `--model=${id}`]).model).toBe(id);
    }
  });

  it("rejects an id the manifest entry does not list, naming the allowed set", () => {
    expect(() => resolveCurationModel("gpt-4o-mini")).toThrow(
      /not listed for workload "backoffice_dossier_curation"/,
    );
    expect(() => resolveCurationModel("gpt-4o-mini")).toThrow(
      new RegExp(allowedCurationModels().join(", ")),
    );
    expect(() => parseArgs([...BASE_ARGV, "--model=totally-made-up"])).toThrow(
      /Allowed:/,
    );
  });

  it("no longer hardcodes the legacy gpt-4o-mini id", () => {
    expect(allowedCurationModels()).not.toContain("gpt-4o-mini");
  });

  it("still enforces the pre-existing argument rules", () => {
    expect(() => parseArgs(["node", "s.ts", "--class=hard", "--id=x"])).toThrow(
      /--reference=<id> is required/,
    );
    expect(() => parseArgs(["node", "s.ts", "--reference=r", "--id=x"])).toThrow(
      /--class=hard\|soft is required/,
    );
    expect(() =>
      parseArgs(["node", "s.ts", "--reference=r", "--class=soft", "--id=Not_Kebab"]),
    ).toThrow(/--id must be kebab-case/);
  });
});

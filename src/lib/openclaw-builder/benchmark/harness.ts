import { hashCanonicalJson } from "../canonical-json";
import { resolveOpenClawBuilderLane } from "../lane-policy";
import type { BuildIntent } from "@/lib/builder/build-intent";

export const BUILDER_BENCHMARK_SCENARIOS = [
  "init",
  "follow-up",
  "f2",
  "f3",
  "import",
] as const;

export type BuilderBenchmarkScenario = (typeof BUILDER_BENCHMARK_SCENARIOS)[number];

export interface BuilderBenchmarkFixture {
  id: string;
  scenario: BuilderBenchmarkScenario;
  frozenPackage: {
    userPrompt: string;
    buildIntent: BuildIntent;
    lifecycleStage: "design" | "integrations";
    scaffoldId: string | null;
    variantId: string | null;
    importedRepoMode: boolean;
    sourceIds: string[];
  };
}

export interface BuilderBenchmarkObservation {
  fixtureId: string;
  scenario: BuilderBenchmarkScenario;
  frozenPackageHash: string;
  selectedLane: "classic";
  executionEngine: "own-engine";
}

/**
 * P0 package benchmark. It is intentionally side-effect-free and proves only
 * fixture coverage, deterministic receipt material and default lane selection.
 * Existing init/follow-up route suites own classic execution/SSE parity.
 */
export function observeBuilderBenchmark(
  fixture: BuilderBenchmarkFixture,
): BuilderBenchmarkObservation {
  const resolution = resolveOpenClawBuilderLane({});
  if (resolution.lane !== "classic") {
    throw new Error("P0 benchmark invariant violated: non-classic lane selected");
  }
  return {
    fixtureId: fixture.id,
    scenario: fixture.scenario,
    frozenPackageHash: hashCanonicalJson(fixture.frozenPackage),
    selectedLane: resolution.lane,
    executionEngine: "own-engine",
  };
}

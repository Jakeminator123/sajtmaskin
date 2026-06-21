import { describe, expect, it } from "vitest";

import type { FollowUpCapabilityDetection } from "@/lib/builder/follow-up-capability-detection";
import {
  buildFollowUpBriefFromSnapshot,
  buildFollowUpContract,
} from "@/lib/gen/orchestration-snapshot";

import {
  buildFollowUpOrchestrationInput,
  type BuildFollowUpOrchestrationInputParams,
} from "./follow-up-orchestration-input";

/** A persisted snapshot for a previously generated + saved version. */
function baseSnapshot(): Record<string, unknown> {
  return {
    lastVersionId: "ver_base_1",
    scaffoldId: "landing-page",
    variantId: "minimalist-mag",
    previewSessionId: "preview_sess_1",
    buildSpec: {
      qualityTarget: "premium",
      previewPolicy: "fidelity2",
    },
    briefSummary: {
      projectTitle: "Hotel Solskenet",
      requestedCapabilities: ["payments", "booking"],
      styleKeywords: ["minimal", "warm"],
    },
  };
}

describe("buildFollowUpContract — consolidation (5-1)", () => {
  it("(a) vanlig follow-up: consolidates snapshot + persisted ids + routes + prior quality", () => {
    const snapshot = baseSnapshot();
    const contract = buildFollowUpContract({
      snapshot,
      persistedScaffoldId: "landing-page",
      persistedVariantId: "minimalist-mag",
      existingRoutePaths: ["/", "/om-oss"],
      existingShellRoutePaths: ["/kontakt"],
      priorQualityTarget: "premium",
    });

    expect(contract.baseVersionId).toBe("ver_base_1");
    expect(contract.scaffoldId).toBe("landing-page");
    expect(contract.variantId).toBe("minimalist-mag");
    expect(contract.routePlan).toEqual({
      existingRoutePaths: ["/", "/om-oss"],
      existingShellRoutePaths: ["/kontakt"],
    });
    expect(contract.capabilities).toEqual(["payments", "booking"]);
    expect(contract.qualityTarget).toBe("premium");
    expect(contract.previewSessionId).toBe("preview_sess_1");
    // snapshotBrief mirrors the deterministic snapshot brief exactly.
    expect(contract.snapshotBrief).not.toBeNull();
    expect(contract.snapshotBrief).toEqual(buildFollowUpBriefFromSnapshot(snapshot));
  });

  // BUG-SWARM rank 4: the capability floor must come from the snapshot's merged
  // top-level `requestedCapabilities` (what the base version actually used:
  // brief + inferred-bridge), NOT the briefSummary subset. Otherwise an init-
  // inferred capability (here `analytics`) is dropped on a follow-up that does
  // not re-infer it — the silent drop the floor (5-5) exists to prevent.
  it("floors on the merged top-level requestedCapabilities, not the briefSummary subset", () => {
    const snapshot = {
      ...baseSnapshot(),
      requestedCapabilities: ["payments", "booking", "analytics"],
    };
    const contract = buildFollowUpContract({ snapshot });
    expect(contract.capabilities).toEqual(["payments", "booking", "analytics"]);
  });

  it("falls back to the briefSummary subset when no top-level requestedCapabilities (older snapshots)", () => {
    // baseSnapshot() carries no top-level requestedCapabilities -> briefSummary wins.
    const contract = buildFollowUpContract({ snapshot: baseSnapshot() });
    expect(contract.capabilities).toEqual(["payments", "booking"]);
  });

  it("persisted ids win over snapshot ids, and fall back to snapshot when released", () => {
    const snapshot = { ...baseSnapshot(), scaffoldId: "blog", variantId: "editorial" };

    const withPersisted = buildFollowUpContract({
      snapshot,
      persistedScaffoldId: "landing-page",
      persistedVariantId: "minimalist-mag",
    });
    expect(withPersisted.scaffoldId).toBe("landing-page");
    expect(withPersisted.variantId).toBe("minimalist-mag");

    const released = buildFollowUpContract({
      snapshot,
      persistedScaffoldId: null,
      persistedVariantId: null,
    });
    expect(released.scaffoldId).toBe("blog");
    expect(released.variantId).toBe("editorial");
  });

  it("derives qualityTarget from snapshot.buildSpec when no prior target is supplied", () => {
    const contract = buildFollowUpContract({ snapshot: baseSnapshot() });
    expect(contract.qualityTarget).toBe("premium");
  });

  it("ignores an out-of-range snapshot qualityTarget", () => {
    const snapshot = { ...baseSnapshot(), buildSpec: { qualityTarget: "ultra" } };
    const contract = buildFollowUpContract({ snapshot });
    expect(contract.qualityTarget).toBeNull();
  });

  it("(c) missing/empty snapshot is graceful (no throw, all-null/empty defaults)", () => {
    const emptyCases: Array<Record<string, unknown> | null | undefined> = [null, undefined, {}];
    for (const snapshot of emptyCases) {
      const contract = buildFollowUpContract({ snapshot });
      expect(contract).toEqual({
        baseVersionId: null,
        snapshotBrief: null,
        scaffoldId: null,
        variantId: null,
        routePlan: { existingRoutePaths: [], existingShellRoutePaths: [] },
        capabilities: [],
        qualityTarget: null,
        previewSessionId: null,
      });
    }
  });
});

function emptyCapabilityDetection(): FollowUpCapabilityDetection {
  return {
    capabilities: [],
    capabilityIds: [],
    tierByCapability: {},
    wordCount: 0,
    referencesExistingCapability: false,
    modifyReferenceMatches: [],
  };
}

function followUpMeta(
  brief: Record<string, unknown> | null,
): BuildFollowUpOrchestrationInputParams["parsedMeta"] {
  return {
    brief,
    themeColors: null,
    palette: null,
    designThemePreset: null,
    scaffoldMode: "auto",
    scaffoldId: null,
    lifecycleStage: "design",
  };
}

function followUpParams(
  overrides: Partial<BuildFollowUpOrchestrationInputParams> = {},
): BuildFollowUpOrchestrationInputParams {
  return {
    mode: "codegen",
    optimizedMessage: "wrapped follow-up message",
    message: "user follow-up text",
    buildIntent: "website",
    parsedMeta: followUpMeta(null),
    resolvedImageGenerations: false,
    designReferences: [],
    persistedScaffoldId: "landing-page",
    previousFilesCount: 8,
    hasFollowUpBase: true,
    ignorePersistedScaffoldForMatch: false,
    promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    existingRoutePaths: ["/"],
    existingShellRoutePaths: [],
    followUpCapabilityDetection: emptyCapabilityDetection(),
    followUpIntent: "neutral",
    orchestrationSnapshot: baseSnapshot(),
    engineModelId: "gpt-5.4",
    persistedVariantId: "minimalist-mag",
    contractAnswers: [],
    chatId: "chat_test_1",
    priorQualityTarget: "premium",
    requestKind: null,
    ...overrides,
  };
}

describe("buildFollowUpOrchestrationInput attaches followUpContract (5-1, additive)", () => {
  it("(a) vanlig follow-up: contract is fully derived and the brief fallback is unchanged (parity)", () => {
    const snapshot = baseSnapshot();
    const input = buildFollowUpOrchestrationInput(followUpParams());

    // Parity: with no inline brief, orchestrate's `brief` still falls back to
    // the snapshot brief exactly as before this change.
    expect(input.brief).toEqual(buildFollowUpBriefFromSnapshot(snapshot));

    expect(input.followUpContract).toEqual({
      baseVersionId: "ver_base_1",
      snapshotBrief: buildFollowUpBriefFromSnapshot(snapshot),
      scaffoldId: "landing-page",
      variantId: "minimalist-mag",
      routePlan: { existingRoutePaths: ["/"], existingShellRoutePaths: [] },
      capabilities: ["payments", "booking"],
      qualityTarget: "premium",
      previewSessionId: "preview_sess_1",
    });
  });

  it("(b) clear-redesign: contract.snapshotBrief still anchors the base even when the active brief is a fresh delta", () => {
    const snapshot = baseSnapshot();
    const deltaBrief = { requestedCapabilities: ["ai-chat"], projectTitle: "Redesign X" };
    const input = buildFollowUpOrchestrationInput(
      followUpParams({
        parsedMeta: followUpMeta(deltaBrief),
        followUpIntent: "clear-redesign",
        ignorePersistedScaffoldForMatch: true,
      }),
    );

    // Existing behaviour: the active brief becomes the fresh delta brief.
    expect(input.brief).toEqual(deltaBrief);

    // The contract still records the persisted base lineage, not the delta.
    expect(input.followUpContract?.baseVersionId).toBe("ver_base_1");
    expect(input.followUpContract?.snapshotBrief).toEqual(
      buildFollowUpBriefFromSnapshot(snapshot),
    );
    expect(input.followUpContract?.snapshotBrief).not.toEqual(deltaBrief);
    expect(input.followUpContract?.capabilities).toEqual(["payments", "booking"]);
  });

  it("attaches an identical contract in both plan and codegen mode (parity)", () => {
    const planInput = buildFollowUpOrchestrationInput(followUpParams({ mode: "plan" }));
    const codegenInput = buildFollowUpOrchestrationInput(followUpParams({ mode: "codegen" }));
    expect(planInput.followUpContract).toEqual(codegenInput.followUpContract);
    expect(planInput.followUpContract?.scaffoldId).toBe("landing-page");
  });
});

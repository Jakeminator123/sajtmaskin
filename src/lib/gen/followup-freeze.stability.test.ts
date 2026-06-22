import { describe, expect, it } from "vitest";

import {
  detectFollowUpRouteDrift,
  enforceFollowUpRouteFreeze,
  enforceFollowUpScaffoldFreeze,
  enforceFollowUpVariantFreeze,
  resolveOrchestrationBase,
  type OrchestrationInput,
} from "./orchestrate";
import type { FollowUpContract } from "./orchestration-snapshot";

/**
 * Grandmaster Område 5 — 5-3: frys-enforcement (freeze-enforcement).
 *
 * Källa: docs/plans/avklarat/grandmaster/aktiviteter/5-3-frys-enforcement.md
 *
 * Invariant som låses: en *neutral* follow-up får inte drifta bort från
 * basversionens frysta scaffold/variant/route. `FollowUpContract` är den
 * aktiva källan; clear-redesign (avsiktlig omdesign) är undantaget och får
 * fortsatt rematcha.
 *
 * Detta block kör mot den riktiga `resolveOrchestrationBase` (rena enheter:
 * inga embeddings — `embeddingScaffoldMatch:false`/manuellt scaffold — ingen
 * shadcn-IO — `simpleWebsitePath:true` — ingen builder, /api/engine eller
 * preview). Det bevisar att den kända manual-kringgången (`scaffoldMode:
 * "manual"` + annat `scaffoldId`) faktiskt stängs end-to-end.
 *
 * `landing-page` och `saas-landing` är två riktiga website-scaffolds i
 * registret (src/lib/gen/scaffolds/registry.ts) → ingen build-intent-promotion
 * brusar in.
 */

const FROZEN_SCAFFOLD_ID = "landing-page";
const OTHER_SCAFFOLD_ID = "saas-landing";

function makeContract(overrides: Partial<FollowUpContract> = {}): FollowUpContract {
  return {
    baseVersionId: "ver_base_1",
    snapshotBrief: null,
    scaffoldId: FROZEN_SCAFFOLD_ID,
    variantId: null,
    routePlan: {
      existingRoutePaths: ["/", "/om", "/kontakt"],
      existingShellRoutePaths: [],
    },
    capabilities: [],
    qualityTarget: null,
    previewSessionId: null,
    ...overrides,
  };
}

function makeFollowUpInput(overrides: Partial<OrchestrationInput> = {}): OrchestrationInput {
  const contract = overrides.followUpContract ?? makeContract();
  return {
    prompt: "Byt knappfärgen på hero-sektionen till blå.",
    rawPrompt: "Byt knappfärgen på hero-sektionen till blå.",
    buildIntent: "website",
    generationMode: "followUp",
    scaffoldMode: "manual",
    scaffoldId: OTHER_SCAFFOLD_ID,
    persistedScaffoldId: FROZEN_SCAFFOLD_ID,
    ignorePersistedScaffoldForMatch: false,
    embeddingScaffoldMatch: false,
    simpleWebsitePath: true,
    previousFilesCount: 4,
    existingRoutePaths: contract.routePlan.existingRoutePaths,
    existingShellRoutePaths: contract.routePlan.existingShellRoutePaths,
    followUpIntent: "neutral",
    chatId: "chat-5-3",
    ...overrides,
    followUpContract: contract,
  };
}

describe("5-3 freeze-enforcement — resolveOrchestrationBase (integration)", () => {
  it("clamps a neutral follow-up's manual scaffold swap back to the frozen contract scaffold (closes orchestrate manual-bypass)", async () => {
    const base = await resolveOrchestrationBase(
      makeFollowUpInput({ scaffoldMode: "manual", scaffoldId: OTHER_SCAFFOLD_ID }),
    );
    // Without enforcement, the manual scaffoldId wins (orchestrate.ts manual
    // branch) → resolvedScaffold === saas-landing. With 5-3, the frozen
    // contract scaffold wins.
    expect(base.resolvedScaffold?.id).toBe(FROZEN_SCAFFOLD_ID);
  });

  it("preserves the frozen contract routes on a neutral follow-up", async () => {
    const base = await resolveOrchestrationBase(makeFollowUpInput());
    const routePaths = base.routePlan.routes.map((route) => route.path);
    for (const frozenPath of makeContract().routePlan.existingRoutePaths) {
      expect(routePaths).toContain(frozenPath);
    }
  });

  it("does NOT clamp the scaffold when the lock is released (clear-redesign / ignorePersistedScaffoldForMatch)", async () => {
    // Isolates the exemption gate: even an explicit manual scaffold that
    // differs from the contract is allowed through when the scaffold lock is
    // released. The gate is `ignorePersistedScaffoldForMatch`, not scaffoldMode.
    const base = await resolveOrchestrationBase(
      makeFollowUpInput({
        scaffoldMode: "manual",
        scaffoldId: OTHER_SCAFFOLD_ID,
        ignorePersistedScaffoldForMatch: true,
      }),
    );
    expect(base.resolvedScaffold?.id).toBe(OTHER_SCAFFOLD_ID);
  });
});

describe("5-3 freeze-enforcement — enforceFollowUpScaffoldFreeze (unit)", () => {
  it("clamps a neutral follow-up's drifted scaffold back to the contract", () => {
    const decision = enforceFollowUpScaffoldFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractScaffoldId: FROZEN_SCAFFOLD_ID,
      resolvedScaffoldId: OTHER_SCAFFOLD_ID,
    });
    expect(decision).toEqual({ scaffoldId: FROZEN_SCAFFOLD_ID, clamped: true });
  });

  it("is a no-op when the resolved scaffold already equals the contract", () => {
    const decision = enforceFollowUpScaffoldFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractScaffoldId: FROZEN_SCAFFOLD_ID,
      resolvedScaffoldId: FROZEN_SCAFFOLD_ID,
    });
    expect(decision).toEqual({ scaffoldId: FROZEN_SCAFFOLD_ID, clamped: false });
  });

  it("does NOT clamp when the scaffold lock is released (clear-redesign exemption)", () => {
    const decision = enforceFollowUpScaffoldFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: true,
      contractScaffoldId: FROZEN_SCAFFOLD_ID,
      resolvedScaffoldId: OTHER_SCAFFOLD_ID,
    });
    expect(decision).toEqual({ scaffoldId: OTHER_SCAFFOLD_ID, clamped: false });
  });

  it("does NOT clamp on init runs", () => {
    const decision = enforceFollowUpScaffoldFreeze({
      resolvedMode: "init",
      ignorePersistedScaffoldForMatch: false,
      contractScaffoldId: FROZEN_SCAFFOLD_ID,
      resolvedScaffoldId: OTHER_SCAFFOLD_ID,
    });
    expect(decision.clamped).toBe(false);
  });

  it("does NOT clamp when the contract carries no frozen scaffold", () => {
    const decision = enforceFollowUpScaffoldFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractScaffoldId: null,
      resolvedScaffoldId: OTHER_SCAFFOLD_ID,
    });
    expect(decision.clamped).toBe(false);
  });
});

describe("5-3 freeze-enforcement — enforceFollowUpVariantFreeze (unit)", () => {
  it("clamps a neutral follow-up's drifted variant back to the contract", () => {
    const decision = enforceFollowUpVariantFreeze({
      resolvedMode: "followUp",
      followUpIntent: "neutral",
      contractVariantId: "warm-local",
      resolvedVariantId: "corporate-grid",
    });
    expect(decision).toEqual({ variantId: "warm-local", clamped: true });
  });

  it("does NOT clamp the variant on clear-redesign (exemption)", () => {
    const decision = enforceFollowUpVariantFreeze({
      resolvedMode: "followUp",
      followUpIntent: "clear-redesign",
      contractVariantId: "warm-local",
      resolvedVariantId: "corporate-grid",
    });
    expect(decision).toEqual({ variantId: "corporate-grid", clamped: false });
  });

  it("is a no-op when the resolved variant already equals the contract", () => {
    const decision = enforceFollowUpVariantFreeze({
      resolvedMode: "followUp",
      followUpIntent: "neutral",
      contractVariantId: "warm-local",
      resolvedVariantId: "warm-local",
    });
    expect(decision.clamped).toBe(false);
  });
});

describe("5-3 freeze-enforcement — detectFollowUpRouteDrift (unit)", () => {
  it("flags drift when a neutral follow-up dropped a frozen contract route", () => {
    const decision = detectFollowUpRouteDrift({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/", "/om", "/kontakt"],
      resolvedRoutePaths: ["/", "/om"],
    });
    expect(decision.drifted).toBe(true);
    expect(decision.droppedPaths).toEqual(["/kontakt"]);
  });

  it("reports no drift when every frozen route survives (trailing-slash insensitive)", () => {
    const decision = detectFollowUpRouteDrift({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/", "/om/", "/kontakt"],
      resolvedRoutePaths: ["/", "/om", "/kontakt", "/nyheter"],
    });
    expect(decision.drifted).toBe(false);
    expect(decision.droppedPaths).toEqual([]);
  });

  it("does NOT flag route drift on clear-redesign (exemption)", () => {
    const decision = detectFollowUpRouteDrift({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: true,
      contractExistingRoutePaths: ["/", "/om", "/kontakt"],
      resolvedRoutePaths: ["/"],
    });
    expect(decision.drifted).toBe(false);
  });

  it("flags drift when a neutral follow-up dropped a frozen deferred-shell route (full routePlan coverage)", () => {
    // Regression (false-green gap): the contract also freezes
    // `existingShellRoutePaths`. Here the dropped route is carried ONLY in the
    // shell array (not existingRoutePaths), so the pre-fix check — which
    // validated existingRoutePaths only — would have missed it and stayed
    // falsely green.
    const decision = detectFollowUpRouteDrift({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/"],
      contractShellRoutePaths: ["/dashboard"],
      resolvedRoutePaths: ["/"],
    });
    expect(decision.drifted).toBe(true);
    expect(decision.droppedShellPaths).toEqual(["/dashboard"]);
    expect(decision.droppedPaths).toContain("/dashboard");
  });

  it("does NOT flag a dropped shell route on clear-redesign (exemption holds for shell routes)", () => {
    const decision = detectFollowUpRouteDrift({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: true,
      contractExistingRoutePaths: ["/"],
      contractShellRoutePaths: ["/dashboard"],
      resolvedRoutePaths: ["/"],
    });
    expect(decision.drifted).toBe(false);
    expect(decision.droppedShellPaths).toEqual([]);
  });

  it("reports no drift when a frozen shell route survives in the resolved plan", () => {
    const decision = detectFollowUpRouteDrift({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/", "/dashboard"],
      contractShellRoutePaths: ["/dashboard"],
      resolvedRoutePaths: ["/", "/dashboard"],
    });
    expect(decision.drifted).toBe(false);
    expect(decision.droppedShellPaths).toEqual([]);
  });
});

/**
 * Grandmaster Område 5 — 5-6: route HARD-CLAMP + explicit route-removal.
 *
 * Källa: docs/plans/avklarat/grandmaster/aktiviteter/5-6-route-hard-clamp.md
 *
 * Invariant som låses: en *neutral* follow-up får inte SILENTLY (tyst) tappa
 * en route som basversionen hade. Kontraktets frysta routes (existing + shell)
 * är ett golv (floor) som återinförs vid tyst drop. Två undantag: clear-redesign
 * och EXPLICIT route-removal (kanonisk `collectExplicitRouteRemovals`).
 */
describe("5-6 route hard-clamp — enforceFollowUpRouteFreeze (unit)", () => {
  it("restores a silently-dropped frozen route on a neutral follow-up", () => {
    const decision = enforceFollowUpRouteFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/", "/om", "/kontakt"],
      resolvedRoutePaths: ["/", "/om"],
    });
    expect(decision.clamped).toBe(true);
    expect(decision.restoredPaths).toEqual(["/kontakt"]);
    expect(decision.allowedRemovalPaths).toEqual([]);
  });

  it("restores a silently-dropped frozen SHELL route (full routePlan coverage)", () => {
    const decision = enforceFollowUpRouteFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/"],
      contractShellRoutePaths: ["/dashboard"],
      resolvedRoutePaths: ["/"],
    });
    expect(decision.clamped).toBe(true);
    expect(decision.restoredPaths).toContain("/dashboard");
    expect(decision.restoredShellPaths).toEqual(["/dashboard"]);
  });

  it("does NOT restore a route the user explicitly removed (route-removal exemption)", () => {
    const decision = enforceFollowUpRouteFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/", "/om", "/kontakt"],
      resolvedRoutePaths: ["/", "/om"],
      explicitRouteRemovals: ["/kontakt"],
    });
    expect(decision.clamped).toBe(false);
    expect(decision.restoredPaths).toEqual([]);
    expect(decision.allowedRemovalPaths).toEqual(["/kontakt"]);
  });

  it("restores silently-dropped routes but honors explicit removal for the targeted one (mixed)", () => {
    const decision = enforceFollowUpRouteFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/", "/om", "/kontakt", "/blogg"],
      resolvedRoutePaths: ["/", "/om"],
      explicitRouteRemovals: ["/kontakt"],
    });
    expect(decision.clamped).toBe(true);
    expect(decision.restoredPaths).toEqual(["/blogg"]);
    expect(decision.allowedRemovalPaths).toEqual(["/kontakt"]);
  });

  it("does NOT clamp on clear-redesign (exemption)", () => {
    const decision = enforceFollowUpRouteFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: true,
      contractExistingRoutePaths: ["/", "/om", "/kontakt"],
      resolvedRoutePaths: ["/"],
    });
    expect(decision.clamped).toBe(false);
    expect(decision.restoredPaths).toEqual([]);
  });

  it("does NOT clamp on init runs", () => {
    const decision = enforceFollowUpRouteFreeze({
      resolvedMode: "init",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/", "/om", "/kontakt"],
      resolvedRoutePaths: ["/"],
    });
    expect(decision.clamped).toBe(false);
  });

  it("is a no-op when every frozen route survives (allows additive routes — floor, not ceiling)", () => {
    const decision = enforceFollowUpRouteFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/", "/om"],
      // Neutral follow-up added a brand-new route — must not be stripped, and
      // nothing frozen is missing, so the clamp is a pure no-op.
      resolvedRoutePaths: ["/", "/om", "/nyheter"],
    });
    expect(decision.clamped).toBe(false);
    expect(decision.restoredPaths).toEqual([]);
  });

  it("is trailing-slash insensitive (no false restore)", () => {
    const decision = enforceFollowUpRouteFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: ["/", "/om/"],
      resolvedRoutePaths: ["/", "/om"],
    });
    expect(decision.clamped).toBe(false);
    expect(decision.restoredPaths).toEqual([]);
  });

  it("is a no-op when the contract carries no frozen routes", () => {
    const decision = enforceFollowUpRouteFreeze({
      resolvedMode: "followUp",
      ignorePersistedScaffoldForMatch: false,
      contractExistingRoutePaths: [],
      contractShellRoutePaths: [],
      resolvedRoutePaths: ["/", "/om"],
    });
    expect(decision.clamped).toBe(false);
  });
});

describe("5-6 route hard-clamp — resolveOrchestrationBase (integration)", () => {
  it("restores a frozen contract route the resolved plan silently dropped", async () => {
    const contract = makeContract({
      routePlan: { existingRoutePaths: ["/", "/om", "/kontakt"], existingShellRoutePaths: [] },
    });
    const base = await resolveOrchestrationBase(
      makeFollowUpInput({
        followUpContract: contract,
        // Planner sees a lossy subset (frozen /kontakt missing) — the contract
        // is authoritative, so the clamp must restore it.
        existingRoutePaths: ["/", "/om"],
        existingShellRoutePaths: [],
      }),
    );
    const paths = base.routePlan.routes.map((route) => route.path);
    expect(paths).toContain("/kontakt");
    expect(paths).toContain("/");
    expect(paths).toContain("/om");
  });

  it("restores a frozen deferred-shell route the resolved plan dropped", async () => {
    const contract = makeContract({
      routePlan: { existingRoutePaths: ["/", "/om"], existingShellRoutePaths: ["/dashboard"] },
    });
    const base = await resolveOrchestrationBase(
      makeFollowUpInput({
        followUpContract: contract,
        existingRoutePaths: ["/", "/om"],
        existingShellRoutePaths: ["/dashboard"],
      }),
    );
    const paths = base.routePlan.routes.map((route) => route.path);
    expect(paths).toContain("/dashboard");
  });

  it("honors explicit route-removal — does NOT clamp back the route the user asked to remove", async () => {
    const contract = makeContract({
      routePlan: { existingRoutePaths: ["/", "/om", "/kontakt"], existingShellRoutePaths: [] },
    });
    const base = await resolveOrchestrationBase(
      makeFollowUpInput({
        followUpContract: contract,
        existingRoutePaths: ["/", "/om", "/kontakt"],
        existingShellRoutePaths: [],
        prompt: "Ta bort /kontakt",
        rawPrompt: "Ta bort /kontakt",
      }),
    );
    const paths = base.routePlan.routes.map((route) => route.path);
    expect(paths).not.toContain("/kontakt");
    expect(paths).toContain("/");
    expect(paths).toContain("/om");
  });

  it("does NOT restore dropped routes on clear-redesign (exemption)", async () => {
    const contract = makeContract({
      routePlan: { existingRoutePaths: ["/", "/om", "/kontakt"], existingShellRoutePaths: [] },
    });
    const base = await resolveOrchestrationBase(
      makeFollowUpInput({
        followUpContract: contract,
        existingRoutePaths: ["/", "/om"],
        existingShellRoutePaths: [],
        ignorePersistedScaffoldForMatch: true,
      }),
    );
    const paths = base.routePlan.routes.map((route) => route.path);
    expect(paths).not.toContain("/kontakt");
  });
});

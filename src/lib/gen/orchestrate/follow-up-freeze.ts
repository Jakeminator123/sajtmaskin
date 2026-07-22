/**
 * Follow-up freeze/floor enforcement (Område 5): scaffold/variant/route
 * freeze, route clamp, capability can-only-grow floor, F3 capability scope and
 * drift telemetry — moved verbatim from `src/lib/gen/orchestrate.ts`
 * (structural split, no behavior change).
 */
import { normalizeRoutePath } from "../route-plan";
import { expandDependentCapabilities, normalizeCapabilityId } from "../dossiers";
import type { BuildSpec } from "../build-spec";
import type { FollowUpIntentMode } from "../follow-up-intent-types";
import { getF2MutedIntegrationCapabilities } from "./capability-prompt-filter";

// ── Område 5 / 5-3: follow-up freeze-enforcement ──────────────────────────
// `FollowUpContract` is the *active* source of the frozen scaffold / variant /
// route a neutral follow-up must not drift away from. These pure helpers
// decide, from already-resolved values, whether orchestrate drifted from the
// contract — so the integration points stay tiny and the decisions are
// unit-testable in isolation (mirrors `resolveBuildIntentPromotion`).
// clear-redesign is the exemption: a genuine redesign is allowed to rematch.

/** Surfaces guarded by 5-3 freeze-enforcement (used by the drift telemetry). */
export type FollowUpFreezeSurface = "scaffold" | "variant" | "route" | "capabilities";

export interface FollowUpScaffoldFreezeInput {
  resolvedMode: "init" | "followUp";
  /** clear-redesign scaffold-unlock signal (auto-mode rematch) — exempts the clamp. */
  ignorePersistedScaffoldForMatch: boolean;
  /** Frozen scaffold id from the active contract (null → nothing to freeze to). */
  contractScaffoldId: string | null;
  /** Scaffold id orchestrate resolved before enforcement. */
  resolvedScaffoldId: string | null;
}

export interface FollowUpScaffoldFreezeDecision {
  /** Scaffold id to use after enforcement: the frozen id when clamped, else the resolved id. */
  scaffoldId: string | null;
  /** True when the resolved scaffold drifted from the contract and was clamped. */
  clamped: boolean;
}

/**
 * Decide whether a follow-up's resolved scaffold drifted from the frozen
 * contract scaffold. Returns `clamped: true` + the frozen id when a neutral
 * follow-up resolved a *different* scaffold — e.g. a client-sent
 * `scaffoldMode:"manual"` swap (the orchestrate manual-bypass). No-op on init,
 * on clear-redesign (lock released), when the contract carries no scaffold, or
 * when there is no drift. Pure and behaviour-neutral when nothing drifted.
 */
export function enforceFollowUpScaffoldFreeze(
  input: FollowUpScaffoldFreezeInput,
): FollowUpScaffoldFreezeDecision {
  const { resolvedMode, ignorePersistedScaffoldForMatch, contractScaffoldId, resolvedScaffoldId } =
    input;
  if (
    resolvedMode !== "followUp" ||
    ignorePersistedScaffoldForMatch ||
    !contractScaffoldId ||
    !resolvedScaffoldId ||
    resolvedScaffoldId === contractScaffoldId
  ) {
    return { scaffoldId: resolvedScaffoldId, clamped: false };
  }
  return { scaffoldId: contractScaffoldId, clamped: true };
}

export interface FollowUpVariantFreezeInput {
  resolvedMode: "init" | "followUp";
  /** clear-redesign releases the variant lock (matcher picks a fresh look). */
  followUpIntent: FollowUpIntentMode | null | undefined;
  contractVariantId: string | null;
  resolvedVariantId: string | null;
}

export interface FollowUpVariantFreezeDecision {
  variantId: string | null;
  clamped: boolean;
}

/**
 * Decide whether a follow-up's resolved variant drifted from the frozen
 * contract variant. `lockedVariantForFollowUp` already pins neutral follow-ups
 * to the prior variant; this is the assertion/clamp safety net for the residual
 * case where the lock fell through to a fresh pick. clear-redesign is exempt.
 */
export function enforceFollowUpVariantFreeze(
  input: FollowUpVariantFreezeInput,
): FollowUpVariantFreezeDecision {
  const { resolvedMode, followUpIntent, contractVariantId, resolvedVariantId } = input;
  if (
    resolvedMode !== "followUp" ||
    followUpIntent === "clear-redesign" ||
    !contractVariantId ||
    !resolvedVariantId ||
    resolvedVariantId === contractVariantId
  ) {
    return { variantId: resolvedVariantId, clamped: false };
  }
  return { variantId: contractVariantId, clamped: true };
}

export interface FollowUpRouteFreezeInput {
  resolvedMode: "init" | "followUp";
  /** clear-redesign may rebuild the route plan; skip the drift check. */
  ignorePersistedScaffoldForMatch: boolean;
  /** Frozen base routes from the contract (`routePlan.existingRoutePaths`). */
  contractExistingRoutePaths: string[];
  /**
   * Frozen deferred-shell route paths from the contract
   * (`routePlan.existingShellRoutePaths`). Validated alongside
   * `contractExistingRoutePaths` so dropping a frozen shell route also drifts.
   * Optional / defaults to `[]` so the no-shell case stays unchanged.
   */
  contractShellRoutePaths?: string[];
  /** Route paths orchestrate's `buildRoutePlan` produced. */
  resolvedRoutePaths: string[];
}

export interface FollowUpRouteFreezeDecision {
  /** Frozen contract routes (existing + shell) missing from the resolved plan. */
  droppedPaths: string[];
  /** Subset of `droppedPaths` that were frozen deferred-shell routes. */
  droppedShellPaths: string[];
  drifted: boolean;
}

/**
 * Detect whether any frozen contract route was dropped from a neutral
 * follow-up's resolved route plan. Covers the FULL frozen `routePlan` — both
 * `existingRoutePaths` and `existingShellRoutePaths` — so dropping a frozen
 * deferred-shell route also fires the drift signal (closes a false-green gap
 * where only the non-shell array was validated).
 *
 * Drift telemetry (5-3): reports every frozen route missing from the resolved
 * plan, regardless of whether the drop was intentional. 5-6 adds the actual
 * restore on top of this via {@link enforceFollowUpRouteFreeze}, which splits
 * the dropped set into silently-dropped (restored) vs explicitly-removed (left
 * gone, via the canonical `collectExplicitRouteRemovals` signal). This detector
 * stays the "what changed" signal; the clamp is the "what we corrected" step.
 * clear-redesign is exempt. Both sides are normalized so trailing-slash forms
 * never false-fire.
 */
export function detectFollowUpRouteDrift(
  input: FollowUpRouteFreezeInput,
): FollowUpRouteFreezeDecision {
  const {
    resolvedMode,
    ignorePersistedScaffoldForMatch,
    contractExistingRoutePaths,
    contractShellRoutePaths = [],
    resolvedRoutePaths,
  } = input;
  if (
    resolvedMode !== "followUp" ||
    ignorePersistedScaffoldForMatch ||
    (contractExistingRoutePaths.length === 0 && contractShellRoutePaths.length === 0)
  ) {
    return { droppedPaths: [], droppedShellPaths: [], drifted: false };
  }
  const resolved = new Set(resolvedRoutePaths.map((path) => normalizeRoutePath(path)));
  const frozenShell = Array.from(
    new Set(contractShellRoutePaths.map((path) => normalizeRoutePath(path))),
  );
  const frozenAll = Array.from(
    new Set(
      [...contractExistingRoutePaths, ...contractShellRoutePaths].map((path) =>
        normalizeRoutePath(path),
      ),
    ),
  );
  const droppedShellPaths = frozenShell.filter((path) => !resolved.has(path));
  const droppedPaths = frozenAll.filter((path) => !resolved.has(path));
  return { droppedPaths, droppedShellPaths, drifted: droppedPaths.length > 0 };
}

// ── Område 5 / 5-6: route HARD-CLAMP + explicit route-removal ──────────────
// #168 (5-3) left route as a drift SIGNAL only (`detectFollowUpRouteDrift`):
// it logged a dropped frozen route but never restored it, so a neutral
// follow-up could still SILENTLY drop a page. 5-6 closes that: the contract's
// frozen routes become a *floor* that a neutral follow-up must keep, with two
// exemptions — (a) clear-redesign (`ignorePersistedScaffoldForMatch`), and
// (b) EXPLICIT route-removal. Route-removal intent is NOT a new signal: it is
// the canonical `collectExplicitRouteRemovals` (owned by
// `route-plan/planning-helpers.ts`, the very signal `buildRoutePlan` already
// uses to honor intentional removals). The clamp restores only *silently*
// dropped frozen routes; explicitly removed ones stay gone. Drift telemetry is
// retained — drift is now both clamped AND logged.

export interface FollowUpRouteClampInput {
  resolvedMode: "init" | "followUp";
  /** clear-redesign may rebuild the route plan; exempts the clamp. */
  ignorePersistedScaffoldForMatch: boolean;
  /** Frozen base routes from the contract (`routePlan.existingRoutePaths`). */
  contractExistingRoutePaths: string[];
  /**
   * Frozen deferred-shell route paths from the contract
   * (`routePlan.existingShellRoutePaths`). Restored alongside
   * `contractExistingRoutePaths` so a silently dropped frozen shell route is
   * also clamped back. Optional / defaults to `[]` for the no-shell case.
   */
  contractShellRoutePaths?: string[];
  /** Route paths orchestrate's `buildRoutePlan` produced. */
  resolvedRoutePaths: string[];
  /**
   * Paths the user explicitly asked to remove — the CANONICAL route-removal
   * signal (`collectExplicitRouteRemovals`, owned by
   * `route-plan/planning-helpers.ts`). A frozen route in this set is treated as
   * an intentional removal and is NOT restored. Optional / defaults to `[]` so
   * a follow-up with no removal intent restores every dropped frozen route.
   */
  explicitRouteRemovals?: string[];
}

export interface FollowUpRouteClampDecision {
  /** Frozen routes silently dropped (not explicitly removed) → restored by the clamp. */
  restoredPaths: string[];
  /** Subset of `restoredPaths` that were frozen deferred-shell routes. */
  restoredShellPaths: string[];
  /** Frozen routes the user explicitly removed → intentionally left dropped (not restored). */
  allowedRemovalPaths: string[];
  /** True when the clamp restored at least one silently-dropped frozen route. */
  clamped: boolean;
}

/**
 * Decide which frozen contract routes a neutral follow-up dropped must be
 * restored. Mirrors `enforceFollowUpScaffoldFreeze`/`enforceFollowUpVariantFreeze`:
 * pure, decides from already-resolved values, behaviour-neutral when nothing
 * drifted. Covers the FULL frozen `routePlan` (existing + deferred-shell). The
 * frozen set is a FLOOR, not a ceiling — additive routes the follow-up added
 * are never touched, only missing frozen routes are considered for restore.
 *
 * Two exemptions keep intentional change working:
 *  - clear-redesign (`ignorePersistedScaffoldForMatch`) → no clamp at all.
 *  - EXPLICIT route-removal (`explicitRouteRemovals`, the canonical
 *    `collectExplicitRouteRemovals` signal) → that route stays dropped.
 *
 * No-op on init, on clear-redesign, when the contract carries no frozen routes,
 * or when every frozen route survived. Both sides are normalized so
 * trailing-slash forms never false-fire.
 */
export function enforceFollowUpRouteFreeze(
  input: FollowUpRouteClampInput,
): FollowUpRouteClampDecision {
  const {
    resolvedMode,
    ignorePersistedScaffoldForMatch,
    contractExistingRoutePaths,
    contractShellRoutePaths = [],
    resolvedRoutePaths,
    explicitRouteRemovals = [],
  } = input;
  const empty: FollowUpRouteClampDecision = {
    restoredPaths: [],
    restoredShellPaths: [],
    allowedRemovalPaths: [],
    clamped: false,
  };
  if (
    resolvedMode !== "followUp" ||
    ignorePersistedScaffoldForMatch ||
    (contractExistingRoutePaths.length === 0 && contractShellRoutePaths.length === 0)
  ) {
    return empty;
  }
  const resolved = new Set(resolvedRoutePaths.map((path) => normalizeRoutePath(path)));
  const removed = new Set(explicitRouteRemovals.map((path) => normalizeRoutePath(path)));
  const shellSet = new Set(contractShellRoutePaths.map((path) => normalizeRoutePath(path)));
  const frozenAll = Array.from(
    new Set(
      [...contractExistingRoutePaths, ...contractShellRoutePaths].map((path) =>
        normalizeRoutePath(path),
      ),
    ),
  );
  const restoredPaths: string[] = [];
  const allowedRemovalPaths: string[] = [];
  for (const path of frozenAll) {
    if (resolved.has(path)) continue; // frozen route survived → nothing to do
    if (removed.has(path)) {
      allowedRemovalPaths.push(path); // intentional removal → leave it dropped
      continue;
    }
    restoredPaths.push(path); // silently dropped → restore
  }
  const restoredShellPaths = restoredPaths.filter((path) => shellSet.has(path));
  return {
    restoredPaths,
    restoredShellPaths,
    allowedRemovalPaths,
    clamped: restoredPaths.length > 0,
  };
}

export interface FollowUpCapabilityFloorInput {
  resolvedMode: "init" | "followUp";
  /**
   * Dossier capabilities after `filterDossierCapabilitiesForPrompt` ran — the
   * brief ∪ inferred ∪ caller union with this-message prompt filtering already
   * applied.
   */
  resolvedCapabilities: string[];
  /**
   * Frozen capability floor from the {@link FollowUpContract} (base version's
   * snapshot `requestedCapabilities`). Empty/absent on init.
   */
  contractCapabilities: string[];
  /**
   * Active preview policy for this generation. When it is NOT `"fidelity3"`
   * (i.e. F2 / design) the floor must not silently re-introduce F2-muted
   * integrations ({@link getF2MutedIntegrationCapabilities}) that
   * `filterDossierCapabilitiesForPrompt` just dropped — F2 is integration-mute.
   * Those caps stay parked in the contract and are restored once the project
   * is lifted to F3. Optional/back-compat: when absent the floor restores every
   * missing capability (legacy behaviour). See `.cursor/rules/env-flow-f2-mute.mdc`.
   */
  previewPolicy?: BuildSpec["previewPolicy"];
  /**
   * Bugg B: integration capabilities the follow-up EXPLICITLY asked to remove
   * (`detectCapabilityRemoval`). Unlike the F2-mute park (which keeps the
   * capability frozen in the contract), an explicit removal is a genuine
   * SHRINK: the capability is dropped from BOTH the resolved set and the
   * restored floor, so an established integration the user removed cannot grow
   * back via can-only-grow. Optional/back-compat: absent = pure can-only-grow.
   *
   * This is the deliberate exception to the 5-5 invariant — a removal is an
   * explicit user intent, not a silent drop. See
   * `followup-capabilities.stability.test.ts` for the codified contract change.
   */
  removedCapabilities?: string[];
}

export interface FollowUpCapabilityFloorDecision {
  /** Final dossier capabilities: resolved with the floor restored (resolved → restored order). */
  capabilities: string[];
  /** Floor capabilities that were missing from `resolvedCapabilities` and got restored. */
  restoredCapabilities: string[];
  /** True when the floor restored at least one capability. */
  floorApplied: boolean;
}

/** Normalize a capability list: trim + lowercase + drop empties + dedup (order-preserving). */
function normalizeCapabilityList(capabilities: readonly unknown[]): string[] {
  return Array.from(
    new Set(
      capabilities
        .filter((capability): capability is string => typeof capability === "string")
        .map((capability) => capability.trim().toLowerCase())
        .filter((capability) => capability.length > 0),
    ),
  );
}

/**
 * 5-5 capabilities can-only-grow: a follow-up must never SILENTLY drop a
 * capability the base version already established. The post-filter dossier
 * capability list (`filterDossierCapabilitiesForPrompt` output) is unioned back
 * with the {@link FollowUpContract} floor so an established base capability
 * (e.g. an init `contact-form`) survives even when *this* follow-up message
 * doesn't mention it. Pure; behaviour-neutral when the floor adds nothing.
 *
 * Floor, not ceiling: capabilities the follow-up newly added flow through
 * untouched; only missing floor entries are restored, appended after the
 * resolved order (resolved → restored).
 *
 * NOTE — unlike scaffold/variant/route, the capability floor is NOT exempt on
 * clear-redesign: a genuine redesign still must not silently drop a paid
 * integration the user already has (can-only-grow holds across a redesign).
 * No-op on init (no contract floor) and whenever the floor is already covered.
 *
 * F2-mute exception: when `previewPolicy` is supplied and is NOT `"fidelity3"`
 * the floor will not restore F2-muted integrations
 * ({@link getF2MutedIntegrationCapabilities}). They are integration wiring that the
 * F2 design pass must not emit; they remain frozen in the contract and the
 * floor restores them once the project is lifted to F3 (previewPolicy
 * `"fidelity3"`), so can-only-grow still holds across the lifecycle.
 * See `.cursor/rules/env-flow-f2-mute.mdc`.
 */
export function enforceFollowUpCapabilityFloor(
  input: FollowUpCapabilityFloorInput,
): FollowUpCapabilityFloorDecision {
  const removedSet = new Set(normalizeCapabilityList(input.removedCapabilities ?? []));
  const resolved = normalizeCapabilityList(input.resolvedCapabilities).filter(
    (capability) => !removedSet.has(capability),
  );
  // Init never carries a contract floor; keep init capability selection intact.
  if (input.resolvedMode !== "followUp") {
    return { capabilities: resolved, restoredCapabilities: [], floorApplied: false };
  }
  const floor = normalizeCapabilityList(input.contractCapabilities).filter(
    (capability) => !removedSet.has(capability),
  );
  const resolvedSet = new Set(resolved);
  let restoredCapabilities = floor.filter((capability) => !resolvedSet.has(capability));
  // F2 (design) is integration-mute: do not re-introduce F2-muted integrations
  // the prompt filter dropped for this preview policy. Parked in the contract;
  // restored in F3 (when previewPolicy is "fidelity3" or absent/back-compat).
  if (input.previewPolicy && input.previewPolicy !== "fidelity3") {
    const f2MutedIntegrationCapabilities = getF2MutedIntegrationCapabilities();
    restoredCapabilities = restoredCapabilities.filter(
      (capability) => !f2MutedIntegrationCapabilities.has(capability),
    );
  }
  if (restoredCapabilities.length === 0) {
    return { capabilities: resolved, restoredCapabilities: [], floorApplied: false };
  }
  return {
    capabilities: [...resolved, ...restoredCapabilities],
    restoredCapabilities,
    floorApplied: true,
  };
}

/**
 * F3 capability scope (Task 2 — capability-inflation fix).
 *
 * In the integrations stage the F2 mute is lifted, so the prompt filter + the
 * can-only-grow floor restore EVERY capability the Deep Brief ever nominated
 * speculatively — turning a one-capability ask into a full-SaaS env wall (prod
 * 2026-07-09: one `ai-tool-calling` ask → 8 hard dossiers / ~40 env keys). An
 * F3 build should only wire integrations that are wanted NOW. The allowed set is:
 *
 *   - `explicitCapabilities`: inferred from the CURRENT message + providers the
 *     user explicitly APPROVED in the F3 suggestion flow;
 *   - `fileEvidenceCapabilities`: integrations with ACTUAL files in the
 *     parent/base version (already built — safe to keep so they still wire up).
 *
 * The allowed set is dependency-expanded (via {@link expandDependentCapabilities})
 * so a kept `subscriptions` still pulls its required `auth` (pinned to the
 * supabase-auth dossier in selection). Any capability NOT in the allowed set —
 * a speculative brief/floor entry with no ask, approval, or file evidence — is
 * dropped. Candidates are alias-normalized before the comparison
 * (test-sync finding 2026-07-22): a legacy snapshot id like `supabase-auth`
 * must be RECOGNIZED as `auth`, not dropped as unknown. Pure; the caller logs
 * `dropped` for observability and only reassigns when something was dropped.
 *
 * Only F3 rounds call this; F2/design rounds keep can-only-grow untouched.
 */
export function scopeF3DossierCapabilities(params: {
  capabilities: string[];
  explicitCapabilities: string[];
  fileEvidenceCapabilities: string[];
}): { capabilities: string[]; dropped: string[] } {
  const allowed = new Set(
    expandDependentCapabilities(
      normalizeCapabilityList([
        ...params.explicitCapabilities,
        ...params.fileEvidenceCapabilities,
      ]),
    ),
  );
  const capabilities: string[] = [];
  const seen = new Set<string>();
  const dropped: string[] = [];
  for (const cap of params.capabilities) {
    const normalized = normalizeCapabilityId(cap);
    if (allowed.has(normalized)) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        capabilities.push(normalized);
      }
    } else {
      dropped.push(cap);
    }
  }
  return { capabilities, dropped };
}

/**
 * Best-effort drift telemetry for 5-3 freeze-enforcement: emits the
 * `[orchestrate] followup_freeze_drift` console signal when a follow-up's
 * frozen scaffold/variant differs from the fresh pick. Wrapped so telemetry can
 * NEVER throw and break generation. (This is the only remaining orchestrate
 * drift signal — the brief-nomination `scaffold_drift` / `variant_drift` logs
 * were removed as dead code; the brief schema never produced their inputs.)
 */
export function emitFollowUpFreezeDrift(
  surface: FollowUpFreezeSurface,
  detail: Record<string, unknown>,
): void {
  try {
    console.info("[orchestrate] followup_freeze_drift", { surface, ...detail });
  } catch {
    // ignore — drift telemetry is best-effort and must not break gen
  }
}

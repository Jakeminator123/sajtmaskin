/**
 * Resolve the dossier set used for a chat's most recent build from its
 * persisted `orchestration_snapshot`. Shared between the readiness route
 * and the F3 finalize-design route so both consume the same enforcement
 * metadata when partitioning env keys into build / feature-runtime /
 * warn-only buckets.
 *
 * Source of truth: the persisted snapshot's `briefSummary.requestedCapabilities`
 * — the shape `extractBriefSummary` writes in `own-engine-build-session.ts`
 * and that `extractBriefSummaryFromSnapshot` / `buildFollowUpContract` read.
 * When the snapshot is missing or has no capabilities, returns `[]` — callers
 * then default every detected env key to `enforcement: "build"`, preserving
 * the pre-P31 conservative behaviour.
 *
 * BUG-SWARM rank 3 (capability single-source): this resolver previously read
 * `snapshot.brief.requestedCapabilities`, a field the persisted snapshot never
 * carries (it stores `briefSummary`). Every F3 readiness/finalize call therefore
 * silently resolved zero dossiers, so feature-runtime env keys were misclassified
 * as build-blocking. We now read the canonical `briefSummary` shape, keeping the
 * legacy `brief` and a top-level field as compatibility fallbacks.
 *
 * Caveats:
 *  - Snapshots can lag behind the user's most recent intent (e.g. user
 *    asked to "remove payments" but the merged snapshot still has
 *    `payments` in `requestedCapabilities`). This helper does not try to
 *    correct that — it returns whatever the snapshot says. The
 *    correction belongs in the orchestrator when building/merging snapshots.
 */
import { selectDossiersForRequest } from "./select";
import type { SelectedDossier } from "./types";

function readCapabilityArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c): c is string => typeof c === "string");
}

/**
 * Read `requestedCapabilities` from whichever snapshot shape carries it,
 * preferring the canonical persisted `briefSummary` field. Returns the first
 * non-empty string list found.
 */
function readRequestedCapabilitiesFromSnapshot(
  snapshot: Record<string, unknown>,
): string[] {
  const briefSummary = snapshot.briefSummary;
  const legacyBrief = snapshot.brief;
  const candidates: unknown[] = [
    // Canonical persisted shape (own-engine-build-session writes `briefSummary`).
    briefSummary && typeof briefSummary === "object"
      ? (briefSummary as { requestedCapabilities?: unknown }).requestedCapabilities
      : undefined,
    // Legacy / already-rehydrated `brief` shape (back-compat).
    legacyBrief && typeof legacyBrief === "object"
      ? (legacyBrief as { requestedCapabilities?: unknown }).requestedCapabilities
      : undefined,
    // Defensive: a top-level field, should one ever be persisted directly.
    (snapshot as { requestedCapabilities?: unknown }).requestedCapabilities,
  ];
  for (const candidate of candidates) {
    const caps = readCapabilityArray(candidate);
    if (caps.length > 0) return caps;
  }
  return [];
}

export function resolveSelectedDossiersFromSnapshot(
  snapshot: unknown,
): SelectedDossier[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const requestedCapabilities = readRequestedCapabilitiesFromSnapshot(
    snapshot as Record<string, unknown>,
  );
  if (requestedCapabilities.length === 0) return [];
  try {
    return selectDossiersForRequest({ requestedCapabilities }).selected;
  } catch {
    return [];
  }
}

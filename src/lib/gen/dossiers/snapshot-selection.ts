/**
 * Resolve the dossier set used for a chat's most recent build from its
 * persisted `orchestration_snapshot`. Shared between the readiness route
 * and the F3 finalize-design route so both consume the same enforcement
 * metadata when partitioning env keys into build / feature-runtime /
 * warn-only buckets.
 *
 * Source of truth: the persisted snapshot's top-level `requestedCapabilities`
 * — own-engine-build-session writes it from `orch.dossierRequestedCapabilities`,
 * i.e. the merged capability floor (brief + inferred-bridge + follow-up floor)
 * that actually drove dossier selection at generation time. The snapshot also
 * carries `briefSummary.requestedCapabilities`, but that is only the raw brief
 * subset, so it is used as a fallback for older snapshots / non-dossier builds.
 * When the snapshot is missing or has no capabilities, returns `[]` — callers
 * then default every detected env key to `enforcement: "build"`, preserving
 * the pre-P31 conservative behaviour.
 *
 * BUG-SWARM rank 3 (capability single-source): this resolver previously read
 * `snapshot.brief.requestedCapabilities`, a field the persisted snapshot never
 * carries, so it first resolved zero dossiers. A follow-up fix read
 * `briefSummary`, but that is a strict subset of the floor — capabilities added
 * by the inferred-bridge / follow-up floor were still dropped and their
 * feature-runtime env keys misclassified as build-blocking. We now read the
 * canonical top-level merged set first, with `briefSummary` and the legacy
 * `brief` shape as compatibility fallbacks.
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
 * preferring the canonical top-level merged floor (the set that drove dossier
 * selection at generation time) over the raw `briefSummary` subset. Returns the
 * first non-empty string list found.
 */
function readRequestedCapabilitiesFromSnapshot(
  snapshot: Record<string, unknown>,
): string[] {
  const briefSummary = snapshot.briefSummary;
  const legacyBrief = snapshot.brief;
  const candidates: unknown[] = [
    // Canonical: top-level merged floor (`orch.dossierRequestedCapabilities` =
    // brief + inferred-bridge + follow-up floor) — the exact capability set that
    // drove generation-time dossier selection. Must win over `briefSummary` so
    // bridge/floor capabilities are not dropped (BUG-SWARM rank 3 follow-up).
    (snapshot as { requestedCapabilities?: unknown }).requestedCapabilities,
    // Fallback: persisted briefSummary subset (older snapshots / non-dossier builds).
    briefSummary && typeof briefSummary === "object"
      ? (briefSummary as { requestedCapabilities?: unknown }).requestedCapabilities
      : undefined,
    // Fallback: legacy / already-rehydrated `brief` shape (back-compat).
    legacyBrief && typeof legacyBrief === "object"
      ? (legacyBrief as { requestedCapabilities?: unknown }).requestedCapabilities
      : undefined,
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

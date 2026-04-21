/**
 * Resolve the dossier set used for a chat's most recent build from its
 * persisted `orchestration_snapshot`. Shared between the readiness route
 * and the F3 finalize-design route so both consume the same enforcement
 * metadata when partitioning env keys into build / feature-runtime /
 * warn-only buckets.
 *
 * Source of truth: `chat.orchestration_snapshot.brief.requestedCapabilities`
 * (the same field the orchestrator merges with inferred capabilities at
 * generation time). When the snapshot is missing or has no capabilities,
 * returns `[]` — callers then default every detected env key to
 * `enforcement: "build"`, preserving the pre-P31 conservative behaviour.
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

export function resolveSelectedDossiersFromSnapshot(
  snapshot: unknown,
): SelectedDossier[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const brief = (snapshot as { brief?: unknown }).brief;
  if (!brief || typeof brief !== "object") return [];
  const caps = (brief as { requestedCapabilities?: unknown })
    .requestedCapabilities;
  if (!Array.isArray(caps)) return [];
  const requestedCapabilities = caps.filter(
    (c): c is string => typeof c === "string",
  );
  if (requestedCapabilities.length === 0) return [];
  try {
    return selectDossiersForRequest({ requestedCapabilities }).selected;
  } catch {
    return [];
  }
}

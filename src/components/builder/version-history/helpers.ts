import type { VersionSummary } from "./types";

/**
 * Sort key mirroring `engine-version-lifecycle`'s legacy ordering:
 * prefer `versionNumber`, fall back to `createdAt`. Used to derive
 * `isLatest` for the bus display-context (`retrying`/"Ersatt" only shows
 * for superseded, still-mid-flight rows).
 */
export function versionRowSortKey(version: VersionSummary): number {
  const versionNumber = version.versionNumber;
  if (typeof versionNumber === "number" && Number.isFinite(versionNumber)) {
    return versionNumber;
  }
  const createdAt = version.createdAt;
  if (!createdAt) return 0;
  const timestamp = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function resolveVersionInternalId(version: VersionSummary): string | null {
  if (typeof version.id === "string" && version.id.trim()) return version.id;
  if (typeof version.versionId === "string" && version.versionId.trim()) return version.versionId;
  return null;
}

/**
 * Fast Edit Lane label derivation. `quick_edit` rows render as a minor version
 * (`v3.1`, `v3.2`) under the integer version of their `parentVersionId`, in
 * `versionNumber` order. Everything else keeps its plain `v{versionNumber}`.
 * Returns a map keyed by engine version id.
 */
export function buildVersionLabelMap(versions: VersionSummary[]): Map<string, string> {
  const byId = new Map<string, VersionSummary>();
  for (const version of versions) {
    const id = resolveVersionInternalId(version);
    if (id) byId.set(id, version);
  }
  const childrenByParent = new Map<string, VersionSummary[]>();
  for (const version of versions) {
    if (version.editKind === "quick_edit" && version.parentVersionId) {
      const siblings = childrenByParent.get(version.parentVersionId) ?? [];
      siblings.push(version);
      childrenByParent.set(version.parentVersionId, siblings);
    }
  }
  const minorIndexById = new Map<string, number>();
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => (a.versionNumber ?? 0) - (b.versionNumber ?? 0));
    siblings.forEach((version, index) => {
      const id = resolveVersionInternalId(version);
      if (id) minorIndexById.set(id, index + 1);
    });
  }
  const labels = new Map<string, string>();
  for (const version of versions) {
    const id = resolveVersionInternalId(version);
    if (!id) continue;
    if (version.editKind === "quick_edit" && version.parentVersionId) {
      const parentNumber = byId.get(version.parentVersionId)?.versionNumber;
      const minor = minorIndexById.get(id);
      if (typeof parentNumber === "number" && typeof minor === "number") {
        labels.set(id, `v${parentNumber}.${minor}`);
        continue;
      }
    }
    if (typeof version.versionNumber === "number") {
      labels.set(id, `v${version.versionNumber}`);
    }
  }
  return labels;
}

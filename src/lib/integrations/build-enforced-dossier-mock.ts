import type { DossierEntry } from "@/lib/gen/dossiers/types";

type DossierRegistry = typeof import("@/lib/gen/dossiers/registry");

/**
 * Test-only registry wrapper for `vi.mock("@/lib/gen/dossiers/registry")`.
 * No shipped dossier declares `build` env keys, so the F3 missing-env block
 * is only reachable through a patched manifest.
 */
export function withBuildEnforcedDossier(
  actual: DossierRegistry,
  dossierId: string,
): DossierRegistry {
  const patch = (entry: DossierEntry): DossierEntry =>
    entry.id === dossierId
      ? {
          ...entry,
          envVars: (entry.envVars ?? []).map((envVar) =>
            envVar.required ? { ...envVar, enforcement: "build" } : envVar,
          ),
        }
      : entry;
  let source: DossierEntry[] | null = null;
  let patched: DossierEntry[] = [];
  const getAllDossiers = (): DossierEntry[] => {
    const current = actual.getAllDossiers();
    if (current !== source) {
      source = current;
      patched = current.map(patch);
    }
    return patched;
  };
  return {
    ...actual,
    getAllDossiers,
    getDossierById: (id) => getAllDossiers().find((entry) => entry.id === id) ?? null,
    getDossiersByCapability: (capability) =>
      getAllDossiers().filter(
        (entry) => entry.capability.toLowerCase() === capability.toLowerCase(),
      ),
    resolveDossierProvider: (provider, dossiers = getAllDossiers()) =>
      actual.resolveDossierProvider(provider, dossiers),
  };
}

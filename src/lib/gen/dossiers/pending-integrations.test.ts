import { describe, expect, it } from "vitest";
import {
  mergePersistedOrchestrationSnapshots,
  readMutedDossierIdsFromSnapshot,
} from "@/lib/gen/orchestration-snapshot";
import {
  preferPendingIntegrationDossiers,
  resolvePendingIntegrationDossiers,
} from "./pending-integrations";
import { resolveSelectedDossiersWithVersionPresence } from "./version-presence";

describe("provider-specific pending integration dossiers", () => {
  it("preserves the exact database provider selected in F2", () => {
    const pending = resolvePendingIntegrationDossiers({
      snapshot: {
        mutedCapabilities: ["database"],
        mutedDossierIds: ["mongodb-atlas"],
      },
      versionFiles: [],
    });

    expect(pending.map((selected) => selected.entry.id)).toEqual(["mongodb-atlas"]);
  });

  it("falls back to the capability default for legacy snapshots", () => {
    const pending = resolvePendingIntegrationDossiers({
      snapshot: { mutedCapabilities: ["database"] },
      versionFiles: [],
    });

    expect(pending.map((selected) => selected.entry.id)).toEqual(["postgres-drizzle"]);
  });

  it("keeps a policy-deferred client-only integration for the F3 build", () => {
    const exact = resolvePendingIntegrationDossiers({
      snapshot: {
        mutedCapabilities: ["analytics"],
        mutedDossierIds: ["vercel-analytics"],
      },
      versionFiles: [],
    });
    const legacy = resolvePendingIntegrationDossiers({
      snapshot: { mutedCapabilities: ["analytics"] },
      versionFiles: [],
    });

    expect(exact.map((selected) => selected.entry.id)).toEqual(["vercel-analytics"]);
    expect(legacy.map((selected) => selected.entry.id)).toEqual(["vercel-analytics"]);
  });

  it("combines exact and legacy pending selections in a rollout-era hybrid snapshot", () => {
    const pending = resolvePendingIntegrationDossiers({
      snapshot: {
        mutedCapabilities: ["database", "payments"],
        mutedDossierIds: ["mongodb-atlas"],
      },
      versionFiles: [],
    });

    expect(pending.map((selected) => selected.entry.id)).toEqual([
      "mongodb-atlas",
      "stripe-checkout",
    ]);
  });

  it("lets exact pending provider identity replace a brief-derived default sibling", () => {
    const snapshot = {
      requestedCapabilities: [],
      briefSummary: { requestedCapabilities: ["database"] },
      mutedCapabilities: ["database"],
      mutedDossierIds: ["mongodb-atlas"],
    };
    const selected = resolveSelectedDossiersWithVersionPresence({
      snapshot,
      versionFiles: [],
    });
    const pending = resolvePendingIntegrationDossiers({ snapshot, versionFiles: [] });

    expect(selected.map((item) => item.entry.id)).toEqual(["postgres-drizzle"]);
    expect(
      preferPendingIntegrationDossiers({ selected, pending }).map(
        (item) => item.entry.id,
      ),
    ).toEqual(["mongodb-atlas"]);
  });

  it("accumulates ids across F2 tweaks and clears a delivered dossier", () => {
    const accumulated = mergePersistedOrchestrationSnapshots(
      { mutedDossierIds: ["mongodb-atlas"] },
      { mutedDossierIds: ["stripe-checkout"] },
    );
    expect(readMutedDossierIdsFromSnapshot(accumulated)).toEqual([
      "mongodb-atlas",
      "stripe-checkout",
    ]);

    const delivered = mergePersistedOrchestrationSnapshots(accumulated, {
      selectedDossierIds: ["mongodb-atlas"],
      mutedDossierIds: [],
    });
    expect(readMutedDossierIdsFromSnapshot(delivered)).toEqual(["stripe-checkout"]);
  });

  it("filters explicit dossier removal tombstones", () => {
    expect(
      readMutedDossierIdsFromSnapshot({
        mutedDossierIds: ["stripe-checkout"],
        removedDossierIds: ["stripe-checkout"],
      }),
    ).toEqual([]);
  });
});

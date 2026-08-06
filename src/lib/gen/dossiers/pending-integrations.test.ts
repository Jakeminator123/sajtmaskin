import { describe, expect, it } from "vitest";
import {
  mergePersistedOrchestrationSnapshots,
  readMutedDossierIdsFromSnapshot,
} from "@/lib/gen/orchestration-snapshot";
import {
  isPlannedDossierCoveredByModelBuiltBlock,
  preferPendingIntegrationDossiers,
  resolvePendingIntegrationDossiers,
} from "./pending-integrations";
import { resolveSelectedDossiersWithVersionPresence } from "./version-presence";

describe("provider-specific pending integration dossiers", () => {
  it("preserves the exact auth provider selected in F2", () => {
    const pending = resolvePendingIntegrationDossiers({
      snapshot: {
        mutedCapabilities: ["auth"],
        mutedDossierIds: ["supabase-auth"],
      },
      versionFiles: [],
    });

    expect(pending.map((selected) => selected.entry.id)).toEqual(["supabase-auth"]);
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
        mutedCapabilities: ["auth", "payments"],
        mutedDossierIds: ["supabase-auth"],
      },
      versionFiles: [],
    });

    expect(pending.map((selected) => selected.entry.id)).toEqual([
      "supabase-auth",
      "stripe-checkout",
    ]);
  });

  it("lets exact pending provider identity replace a brief-derived default sibling", () => {
    const snapshot = {
      requestedCapabilities: [],
      briefSummary: { requestedCapabilities: ["auth"] },
      mutedCapabilities: ["auth"],
      mutedDossierIds: ["supabase-auth"],
    };
    const selected = resolveSelectedDossiersWithVersionPresence({
      snapshot,
      versionFiles: [],
    });
    const pending = resolvePendingIntegrationDossiers({ snapshot, versionFiles: [] });

    expect(selected.map((item) => item.entry.id)).toEqual(["clerk-auth"]);
    expect(
      preferPendingIntegrationDossiers({ selected, pending }).map(
        (item) => item.entry.id,
      ),
    ).toEqual(["supabase-auth"]);
  });

  it("accumulates ids across F2 tweaks and clears only exact file-evidenced delivery", () => {
    const accumulated = mergePersistedOrchestrationSnapshots(
      { mutedDossierIds: ["supabase-auth"] },
      { mutedDossierIds: ["stripe-checkout"] },
    );
    expect(readMutedDossierIdsFromSnapshot(accumulated)).toEqual([
      "supabase-auth",
      "stripe-checkout",
    ]);

    const delivered = mergePersistedOrchestrationSnapshots(accumulated, {
      selectedDossierIds: ["supabase-auth"],
      fileEvidenceDossierIds: ["supabase-auth"],
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

  it("treats a parked dossier id as selecting nothing (etapp 3 safety valve)", () => {
    const pending = resolvePendingIntegrationDossiers({
      snapshot: {
        mutedCapabilities: ["database"],
        mutedDossierIds: ["mongodb-atlas"],
      },
      versionFiles: [],
    });
    // Parked id resolves to nothing; legacy capability falls back to the sole
    // database dossier (postgres-drizzle).
    expect(pending.map((selected) => selected.entry.id)).toEqual(["postgres-drizzle"]);
  });
});

// M#li6 (prod 2026-08-01, chat 7a4d609f): en modellbyggd chattpost och den
// F2-uppskjutna openai-chat-dossiern visades som separata Byggblock — tre
// poster för två funktioner. Ett byggt block som täcker samma capability (or
// samma vendor via env-överlapp) ska ge EN post, inte två.
describe("isPlannedDossierCoveredByModelBuiltBlock (M#li6)", () => {
  it("supersedes a planned dossier when a model-built block has the same capability", () => {
    expect(
      isPlannedDossierCoveredByModelBuiltBlock({
        planned: { capability: "payments", envKeys: ["STRIPE_SECRET_KEY"] },
        modelBuiltBlocks: [{ capability: "payments", envKeys: [] }],
      }),
    ).toBe(true);
  });

  it("supersedes across capability keys when env surfaces overlap (openai prod case)", () => {
    expect(
      isPlannedDossierCoveredByModelBuiltBlock({
        planned: { capability: "ai-chat", envKeys: ["OPENAI_API_KEY"] },
        modelBuiltBlocks: [
          // Stale parked capability id with overlapping env — still covers.
          { capability: "ai-tool-calling", envKeys: ["OPENAI_API_KEY"] },
        ],
      }),
    ).toBe(true);
  });

  it("keeps a planned dossier when neither capability nor env surface overlaps", () => {
    expect(
      isPlannedDossierCoveredByModelBuiltBlock({
        planned: { capability: "newsletter", envKeys: ["MAILCHIMP_API_KEY"] },
        modelBuiltBlocks: [
          { capability: "payments", envKeys: ["STRIPE_SECRET_KEY"] },
        ],
      }),
    ).toBe(false);
  });

  it("keeps every planned dossier when no model-built block exists", () => {
    expect(
      isPlannedDossierCoveredByModelBuiltBlock({
        planned: { capability: "ai-chat", envKeys: ["OPENAI_API_KEY"] },
        modelBuiltBlocks: [],
      }),
    ).toBe(false);
  });
});

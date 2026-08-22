import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, useDossierPipeline: true },
  };
});

import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import { inferCapabilities } from "./capability-inference";
import {
  resolveOrchestrationBase,
  type OrchestrationInput,
} from "./orchestrate";

async function resolveDatabasePrompt(
  prompt: string,
  overrides: Partial<OrchestrationInput> = {},
) {
  const capabilities = inferCapabilities(prompt);
  const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
    mode: "init",
  }).capabilityIds;
  return resolveOrchestrationBase({
    prompt,
    rawPrompt: prompt,
    contractsPrompt: prompt,
    capabilitiesPrompt: prompt,
    buildSpecPrompt: prompt,
    routePlanPrompt: prompt,
    scaffoldMatchPrompt: prompt,
    buildIntent: "website",
    generationMode: "followUp",
    lifecycleStage: "integrations",
    scaffoldMode: "off",
    embeddingScaffoldMatch: false,
    previousFilesCount: 1,
    previousFilePaths: ["app/page.tsx"],
    capabilities,
    requestedDossierCapabilities,
    ...overrides,
  });
}

describe("resolveOrchestrationBase — explicit database provider alignment", () => {
  it("keeps an explicit SQLite target out of the postgres-drizzle dossier path", async () => {
    const prompt = "Import from MongoDB into SQLite and use SQLite for storage";
    const base = await resolveDatabasePrompt(prompt);

    expect(base.preGenerationContracts.contracts.databaseProvider).toBe("SQLite");
    expect(base.dossierRequestedCapabilities).not.toContain("database");
    expect((base.dossierSelection?.selected ?? []).map((entry) => entry.entry.id)).not.toContain(
      "postgres-drizzle",
    );
  });

  it("keeps a positive MongoDB target on the postgres-drizzle dossier path", async () => {
    const prompt = "Save products in MongoDB";
    const base = await resolveDatabasePrompt(prompt);

    expect(base.preGenerationContracts.contracts.databaseProvider).toBe(
      "postgres-drizzle",
    );
    expect(base.dossierRequestedCapabilities).toContain("database");
    expect((base.dossierSelection?.selected ?? []).map((entry) => entry.entry.id)).toContain(
      "postgres-drizzle",
    );
  });

  it("does not select postgres-drizzle when Supabase is the explicit target", async () => {
    const base = await resolveDatabasePrompt("Import from MongoDB into Supabase");

    expect(base.preGenerationContracts.contracts.databaseProvider).toBe("Supabase");
    expect(base.dossierRequestedCapabilities).not.toContain("database");
    expect((base.dossierSelection?.selected ?? []).map((entry) => entry.entry.id)).not.toContain(
      "postgres-drizzle",
    );
  });

  it("retains existing Postgres state for a secondary SQLite export", async () => {
    const base = await resolveDatabasePrompt(
      "Add an export to SQLite while keeping Postgres",
      {
        followUpContract: {
          baseVersionId: "ver_base",
          snapshotBrief: null,
          scaffoldId: null,
          variantId: null,
          routePlan: { existingRoutePaths: [], existingShellRoutePaths: [] },
          capabilities: ["database"],
          f3ApprovedCapabilities: ["database"],
          f3ApprovedProviders: ["postgres-drizzle"],
          qualityTarget: null,
          previewSessionId: null,
        },
        previousFilePaths: ["lib/db/schema.ts", "drizzle.config.ts"],
      },
    );

    expect(base.preGenerationContracts.contracts.databaseProvider).toBe(
      "Postgres / DATABASE_URL",
    );
    expect(
      base.preGenerationContracts.contracts.integrations.map(
        (integration) => integration.provider,
      ),
    ).not.toContain("SQLite");
    expect(base.dossierRequestedCapabilities).toContain("database");
    expect((base.dossierSelection?.selected ?? []).map((entry) => entry.entry.id)).toContain(
      "postgres-drizzle",
    );
    expect(base.f3ApprovedCapabilities).toContain("database");
    expect(base.f3ApprovedProviders).toContain("postgres-drizzle");
  });

  it("does not fall back to the SQLite source when the Mongoose target is vetoed", async () => {
    const base = await resolveDatabasePrompt("Migrate from SQLite to Mongoose", {
      followUpContract: {
        baseVersionId: "ver_base",
        snapshotBrief: null,
        scaffoldId: null,
        variantId: null,
        routePlan: { existingRoutePaths: [], existingShellRoutePaths: [] },
        capabilities: ["database"],
        f3ApprovedCapabilities: ["database"],
        f3ApprovedProviders: ["mongodb-atlas"],
        qualityTarget: null,
        previewSessionId: null,
      },
      dossierProviderHints: ["mongodb"],
    });

    expect(base.preGenerationContracts.contracts.databaseProvider).toBeUndefined();
    expect(
      base.preGenerationContracts.contracts.integrations.map(
        (integration) => integration.provider,
      ),
    ).not.toContain("SQLite");
    expect(base.dossierRequestedCapabilities).not.toContain("database");
    expect(base.f3ApprovedCapabilities).not.toContain("database");
    expect(base.f3ApprovedProviders).not.toContain("mongodb-atlas");
  });

  it("removes stale dossierless Supabase state on an explicit SQLite replacement", async () => {
    const base = await resolveDatabasePrompt("Migrate from Supabase to SQLite", {
      followUpContract: {
        baseVersionId: "ver_base",
        snapshotBrief: null,
        scaffoldId: null,
        variantId: null,
        routePlan: { existingRoutePaths: [], existingShellRoutePaths: [] },
        capabilities: ["database"],
        f3ApprovedCapabilities: ["database"],
        f3ApprovedProviders: ["Supabase"],
        qualityTarget: null,
        previewSessionId: null,
      },
      dossierProviderHints: ["Supabase"],
      previousFilePaths: ["lib/supabase.ts"],
    });

    expect(base.preGenerationContracts.contracts.databaseProvider).toBe("SQLite");
    expect(base.dossierRequestedCapabilities).not.toContain("database");
    expect(base.f3ApprovedCapabilities).not.toContain("database");
    expect(base.f3ApprovedProviders).not.toContain("Supabase");
    expect((base.dossierSelection?.selected ?? []).map((entry) => entry.entry.id)).not.toContain(
      "postgres-drizzle",
    );
  });

  it("removes legacy Mongo approvals and hints on an explicit SQLite replacement", async () => {
    const base = await resolveDatabasePrompt("Migrate from MongoDB to SQLite", {
      followUpContract: {
        baseVersionId: "ver_base",
        snapshotBrief: null,
        scaffoldId: null,
        variantId: null,
        routePlan: { existingRoutePaths: [], existingShellRoutePaths: [] },
        capabilities: ["database"],
        f3ApprovedCapabilities: ["database"],
        f3ApprovedProviders: ["mongodb", "mongodb-atlas"],
        qualityTarget: null,
        previewSessionId: null,
      },
      dossierProviderHints: ["mongodb", "mongodb-atlas"],
    });

    expect(base.preGenerationContracts.contracts.databaseProvider).toBe("SQLite");
    expect(base.dossierRequestedCapabilities).not.toContain("database");
    expect(base.f3ApprovedCapabilities).not.toContain("database");
    expect(base.f3ApprovedProviders).not.toContain("mongodb");
    expect(base.f3ApprovedProviders).not.toContain("mongodb-atlas");
    expect((base.dossierSelection?.selected ?? []).map((entry) => entry.entry.id)).not.toContain(
      "postgres-drizzle",
    );
  });

  it("lets the current SQLite target outrank stale Mongo brief storage", async () => {
    const base = await resolveDatabasePrompt("Migrate from MongoDB to SQLite", {
      brief: { mustHave: ["Use MongoDB for storage"] },
      followUpContract: {
        baseVersionId: "ver_base",
        snapshotBrief: null,
        scaffoldId: null,
        variantId: null,
        routePlan: { existingRoutePaths: [], existingShellRoutePaths: [] },
        capabilities: ["database"],
        f3ApprovedCapabilities: ["database"],
        f3ApprovedProviders: ["postgres-drizzle"],
        qualityTarget: null,
        previewSessionId: null,
      },
    });

    expect(base.preGenerationContracts.contracts.databaseProvider).toBe("SQLite");
    expect(base.dossierRequestedCapabilities).not.toContain("database");
    expect(base.f3ApprovedProviders).not.toContain("postgres-drizzle");
  });

  it("removes stale Postgres approval state on an explicit SQLite replacement", async () => {
    const base = await resolveDatabasePrompt(
      "Migrate from MongoDB to SQLite and use SQLite as the primary database",
      {
        followUpContract: {
          baseVersionId: "ver_base",
          snapshotBrief: null,
          scaffoldId: null,
          variantId: null,
          routePlan: { existingRoutePaths: [], existingShellRoutePaths: [] },
          capabilities: ["database"],
          f3ApprovedCapabilities: ["database"],
          f3ApprovedProviders: ["postgres-drizzle"],
          qualityTarget: null,
          previewSessionId: null,
        },
        dossierProviderHints: ["postgres-drizzle"],
        previousFilePaths: ["lib/db/schema.ts", "drizzle.config.ts"],
      },
    );

    expect(base.preGenerationContracts.contracts.databaseProvider).toBe("SQLite");
    expect(base.dossierRequestedCapabilities).not.toContain("database");
    expect(base.f3ApprovedCapabilities).not.toContain("database");
    expect(base.f3ApprovedProviders).not.toContain("postgres-drizzle");
    expect((base.dossierSelection?.selected ?? []).map((entry) => entry.entry.id)).not.toContain(
      "postgres-drizzle",
    );
  });
});

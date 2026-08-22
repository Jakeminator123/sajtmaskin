import { describe, expect, it } from "vitest";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import {
  filterManifestDatabaseProviderIdentities,
  inferPreGenerationContracts,
} from "./pre-generation-contracts";
import { inferCapabilities, type InferredCapabilities } from "../capability-inference";

const baseCaps = (over: Partial<InferredCapabilities> = {}): InferredCapabilities => ({
  needsMotion: false,
  needs3D: false,
  needsCharts: false,
  needsDatabase: false,
  needsAuth: false,
  needsAppShell: false,
  needsDataUI: false,
  needsForms: false,
  needsEcommerce: false,
  needsCarousel: false,
  needsPremiumVisuals: false,
  needsCalendar: false,
  needsCommandSearch: false,
  needsThemeToggle: false,
  ...over,
});

describe("inferPreGenerationContracts — preview-first defaults", () => {
  it("classifies legacy Mongo provider ids from manifest-owned aliases", () => {
    expect(
      filterManifestDatabaseProviderIdentities([
        "mongodb",
        "MongoDB-Atlas",
        "Supabase",
        "resend",
      ]),
    ).toEqual(["resend"]);
  });

  it("keeps visual-only 3D follow-ups free from backend/auth/payment contracts despite negated keywords", () => {
    const ctx = inferPreGenerationContracts({
      prompt:
        "Lägg till en tydligt synlig flygande 3D-anka. Lägg inte till backend, API-routes, auth, betalning eller externa tjänster.",
      buildIntent: "website",
      capabilities: baseCaps({ needs3D: true, needsAuth: true, needsPayments: true, needsDatabase: true }),
    });

    expect(ctx.contracts.dataMode).toBe("none");
    expect(ctx.contracts.integrations).toEqual([]);
    expect(ctx.contracts.envVars).toEqual([]);
    expect(ctx.contracts.authProvider).toBeUndefined();
    expect(ctx.contracts.paymentProvider).toBeUndefined();
    expect(ctx.contracts.databaseProvider).toBeUndefined();
  });

  it("defaults to SQLite (no modal) when persistence is implied but no DB named in prompt", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Vi behöver spara data i en databas",
      buildIntent: "website",
      capabilities: baseCaps({ needsDatabase: true }),
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "database")).toBe(false);
    expect(ctx.contracts.databaseProvider).toBe("SQLite");
    expect(ctx.contracts.integrations.some((i) => i.provider === "SQLite")).toBe(true);
  });

  it("contracts an explicit Mongo ask as the active Postgres/Drizzle database identity", () => {
    const prompt = "Save products in MongoDB";
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    expect(capabilities.needsDatabase).toBe(false);
    expect(requestedDossierCapabilities).toContain("database");

    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBe("postgres-drizzle");
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).toEqual([
      "postgres-drizzle",
    ]);
    expect(ctx.contracts.integrations.some((integration) => integration.provider === "SQLite"))
      .toBe(false);
    expect(ctx.contracts.envVars.map((envVar) => envVar.key)).toContain("DATABASE_URL");
    expect(ctx.contracts.envVars.map((envVar) => envVar.key)).not.toContain("MONGODB_URI");
  });

  it("does not contract Mongoose as Postgres without the dossier database signal", () => {
    const prompt = "Use Mongoose with a database";
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    expect(capabilities.needsDatabase).toBe(true);
    expect(requestedDossierCapabilities).not.toContain("database");

    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).not.toBe("postgres-drizzle");
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).not.toContain(
      "postgres-drizzle",
    );
    expect(ctx.contracts.envVars.map((envVar) => envVar.key)).not.toContain("DATABASE_URL");
  });

  it("does not fall back to a source provider when the intended Mongoose target is vetoed", () => {
    const prompt = "Migrate from SQLite to Mongoose";
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    expect(requestedDossierCapabilities).not.toContain("database");

    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBeUndefined();
    expect(ctx.databaseSelection?.targetGuardVetoed).toBe(true);
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).not.toContain(
      "SQLite",
    );
    expect(ctx.contracts.envVars.map((envVar) => envVar.key)).not.toContain("DATABASE_URL");
  });

  it("keeps an explicit SQLite choice when MongoDB is negated", () => {
    const prompt = "Use SQLite for the database, not MongoDB";
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    expect(requestedDossierCapabilities).toContain("database");

    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBe("SQLite");
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).toEqual([
      "SQLite",
    ]);
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).not.toContain(
      "postgres-drizzle",
    );
  });

  it("lets an explicit SQLite storage target win over a MongoDB import source", () => {
    const prompt = "Import from MongoDB into SQLite and use SQLite for storage";
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    expect(requestedDossierCapabilities).toContain("database");

    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBe("SQLite");
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).toEqual([
      "SQLite",
    ]);
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).not.toContain(
      "postgres-drizzle",
    );
  });

  it.each([
    "store imported MongoDB data in SQLite",
    "use a SQLite database",
    "import from MongoDB into better-sqlite3",
    "Migrera från MongoDB till SQLite",
    "Använd SQLite som databas och importera från MongoDB",
    "Use MongoDB as source and SQLite as target",
    "Använd MongoDB som källa och SQLite som mål",
  ])("selects the explicit SQLite target in: %s", (prompt) => {
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBe("SQLite");
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).toEqual([
      "SQLite",
    ]);
  });

  it.each([
    "Replace MongoDB with SQLite",
    "Switch from MongoDB to SQLite",
    "Ersätt MongoDB med SQLite",
    "Byt MongoDB mot SQLite",
  ])("treats bilingual switch/replace direction as a primary replacement: %s", (prompt) => {
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBe("SQLite");
    expect(ctx.databaseSelection?.replacesPrimary).toBe(true);
  });

  it("does not let an unrelated keep cue block a database replacement", () => {
    const prompt = "Keep the layout; migrate from MongoDB to SQLite";
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBe("SQLite");
    expect(ctx.databaseSelection?.replacesPrimary).toBe(true);
  });

  it("lets a current provider target outrank a stale brief provider", () => {
    const prompt = "Migrate from MongoDB to SQLite";
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    const ctx = inferPreGenerationContracts({
      prompt,
      brief: { mustHave: ["Use MongoDB for storage"] },
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBe("SQLite");
    expect(ctx.databaseSelection?.replacesPrimary).toBe(true);
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).toEqual([
      "SQLite",
    ]);
  });

  it("uses the brief provider as fallback when the current prompt names none", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      brief: { mustHave: ["Use MongoDB for storage"] },
      buildIntent: "website",
      capabilities: baseCaps({ needsDatabase: true }),
      requestedDossierCapabilities: ["database"],
    });

    expect(ctx.contracts.databaseProvider).toBe("postgres-drizzle");
  });

  it("selects Mongo/Postgres as the target when migrating away from SQLite", () => {
    const prompt = "migrate from using SQLite to MongoDB";
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBe("postgres-drizzle");
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).toEqual([
      "postgres-drizzle",
    ]);
  });

  it("scores only the positive MongoDB occurrence when another occurrence is negated", () => {
    const prompt = "Do not use MongoDB. Import from MongoDB into SQLite.";
    const capabilities = inferCapabilities(prompt);
    const requestedDossierCapabilities = detectFollowUpCapabilities(prompt, {
      mode: "init",
    }).capabilityIds;
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
      requestedDossierCapabilities,
    });

    expect(ctx.contracts.databaseProvider).toBe("SQLite");
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).toEqual([
      "SQLite",
    ]);
  });

  it("does not activate Postgres for a fully negated MongoDB mention", () => {
    const prompt = "avoid MongoDB";
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities: inferCapabilities(prompt),
      // Exercise the provider matcher defensively even if an upstream caller
      // carries a broad/stale database capability into this contract pass.
      requestedDossierCapabilities: ["database"],
    });

    expect(ctx.contracts.databaseProvider).not.toBe("postgres-drizzle");
    expect(ctx.contracts.integrations.map((integration) => integration.provider)).not.toContain(
      "postgres-drizzle",
    );
  });

  it("marks inferred Stripe env as non-blocking (no env modal) when checkout is mentioned", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "We need Stripe checkout for subscriptions",
      buildIntent: "website",
      capabilities: baseCaps({ needsEcommerce: true }),
    });

    expect(ctx.contracts.paymentProvider).toBe("Stripe");
    expect(ctx.unresolvedDecisions.some((d) => d.kind === "env")).toBe(false);
    expect(ctx.contracts.envVars.every((e) => !e.required)).toBe(true);
  });

  it("inferred Stripe env uses NEXT_PUBLIC_ prefix for the publishable key", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Build a Stripe checkout page",
      buildIntent: "website",
      capabilities: baseCaps({ needsEcommerce: true }),
    });

    const stripeKeys = ctx.contracts.envVars
      .filter((e) => e.key.includes("STRIPE"))
      .map((e) => e.key);
    expect(stripeKeys).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(stripeKeys).not.toContain("STRIPE_PUBLISHABLE_KEY");
  });

  it("defaults to NextAuth/Auth.js (no modal) when login is needed but no provider named", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Bygg med inloggning för användare",
      buildIntent: "website",
      capabilities: baseCaps({ needsAuth: true }),
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "auth")).toBe(false);
    expect(ctx.contracts.authProvider).toBe("NextAuth / Auth.js");
    expect(ctx.contracts.integrations.some((i) => i.provider === "NextAuth / Auth.js")).toBe(true);
  });
});

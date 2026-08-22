import { describe, expect, it } from "vitest";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import { inferPreGenerationContracts } from "./pre-generation-contracts";
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

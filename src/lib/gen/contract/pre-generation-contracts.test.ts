import { describe, expect, it } from "vitest";
import { inferPreGenerationContracts } from "./pre-generation-contracts";
import type { InferredCapabilities } from "../capability-inference";

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

describe("inferPreGenerationContracts — UI answers", () => {
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

  it('clears database unresolved when user picks "Annat / vet inte än" (mock first)', () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Vi behöver spara data i en databas",
      buildIntent: "website",
      capabilities: baseCaps({ needsDatabase: true }),
      contractAnswers: [
        {
          kind: "database",
          question: "Vilken datalagring ska vi bygga mot nu?",
          answer: "Annat / vet inte än",
        },
      ],
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "database")).toBe(false);
    expect(ctx.contracts.databaseProvider).toBe("mock data");
    expect(ctx.contracts.dataMode).toBe("mocked");
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

  it("does not add an env blocker after a provider answer in persisted preview flows", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Bygg en medlemsportal med inloggning och databas för kunder",
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true, needsAuth: true }),
      contractAnswers: [
        {
          kind: "auth",
          question: "Vilken autentisering?",
          answer: "Clerk",
        },
      ],
    });

    expect(ctx.contracts.authProvider).toBe("Clerk");
    expect(ctx.contracts.databaseProvider).toBe("SQLite");
    expect(ctx.contracts.envVars.some((e) => e.key === "CLERK_SECRET_KEY" && e.required)).toBe(true);
    expect(ctx.unresolvedDecisions.some((d) => d.kind === "env")).toBe(false);
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

  it('clears auth unresolved when user picks "Annat / vet inte än" (no auth yet)', () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Bygg inloggning och användarkonto",
      buildIntent: "website",
      capabilities: baseCaps({ needsAuth: true }),
      contractAnswers: [
        {
          kind: "auth",
          question: "Vilken autentisering?",
          answer: "Annat / vet inte än",
        },
      ],
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "auth")).toBe(false);
    expect(ctx.contracts.authProvider).toBe("ingen");
  });

  it('clears payment unresolved when user picks "Annat / vet inte än"', () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Checkout och betalning med kort",
      buildIntent: "website",
      capabilities: baseCaps({ needsEcommerce: true }),
      contractAnswers: [
        {
          kind: "payment",
          question: "Vilken betal-lösning?",
          answer: "Annat / vet inte än",
        },
      ],
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "payment")).toBe(false);
    expect(ctx.contracts.paymentProvider).toBe("ingen");
  });
});

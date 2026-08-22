import { describe, expect, it } from "vitest";
import { inferPreGenerationContracts } from "./pre-generation-contracts";
import {
  inferCapabilities,
  type InferredCapabilities,
} from "../capability-inference";

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
  it.each([
    "Add recurring billing for the premium plan",
    "Subscription page for members",
    "En medlemskapssida med återkommande betalning",
  ])("keeps recurring-only intent out of payment contracts: %s", (prompt) => {
    const capabilities = inferCapabilities(prompt);
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
    });

    expect(capabilities.needsPayments).toBe(false);
    expect(ctx.contracts.paymentProvider).toBeUndefined();
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ provider: "Stripe" }),
    );
    expect(ctx.contracts.envVars).not.toContainEqual(
      expect.objectContaining({ key: expect.stringContaining("STRIPE") }),
    );
  });

  it.each([
    "Stripe checkout",
    "Lägg till en kassa",
    "Ta emot en engångsbetalning för kursen",
    "Accept one-off payments for workshop bookings",
    "Ta emot engångsbetalningar för kurser",
  ])("keeps explicit one-off payment intent on Stripe contracts: %s", (prompt) => {
    const capabilities = inferCapabilities(prompt);
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities,
    });

    expect(capabilities.needsPayments).toBe(true);
    expect(ctx.contracts.paymentProvider).toBe("Stripe");
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({ provider: "Stripe" }),
    );
    expect(ctx.contracts.envVars).toContainEqual(
      expect.objectContaining({ key: "STRIPE_SECRET_KEY" }),
    );
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

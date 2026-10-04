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

  it("aligns a generic database default with the dossier catalog", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Vi behöver spara data i en databas",
      buildIntent: "website",
      capabilities: baseCaps({ needsDatabase: true }),
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "database")).toBe(false);
    expect(ctx.contracts.databaseProvider).toBe("Postgres");
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "postgres",
        dossierCapability: "database",
        selectionSource: "dossier-default",
      }),
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

  it("aligns a generic auth default with the dossier catalog", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Bygg med inloggning för användare",
      buildIntent: "website",
      capabilities: baseCaps({ needsAuth: true }),
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "auth")).toBe(false);
    expect(ctx.contracts.authProvider).toBe("Clerk");
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "clerk",
        dossierCapability: "auth",
        selectionSource: "dossier-default",
      }),
    );
  });

  it.each([
    ["Use MongoDB for persistence, not Postgres", "database", "mongodb", "MongoDB"],
    ["Use Auth0, not Clerk", "auth", "auth0", "Auth0"],
    ["Use Swish, not Stripe", "payments", "swish", "Swish"],
  ])("keeps explicit unsupported providers out of dossier defaults: %s", (prompt, capability, providerKey, provider) => {
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "app",
      capabilities: baseCaps({
        needsDatabase: capability === "database",
        needsAuth: capability === "auth",
        needsPayments: capability === "payments",
      }),
    });
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey,
        dossierCapability: capability,
        provider,
        selectionSource: "explicit",
      }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({
        providerKey: capability === "database" ? "postgres" : capability === "auth" ? "clerk" : "stripe",
      }),
    );
  });

  it("binds an explicit Supabase auth request to auth, not database", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use Supabase auth for member login",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    });
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "supabase",
        dossierCapability: "auth",
        selectionSource: "explicit",
      }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "supabase", dossierCapability: "database" }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "clerk" }),
    );
  });

  it.each([
    "Use Supabase for authentication",
    "Använd Supabase för inloggning",
    "Authentication with Supabase",
  ])("recognizes provider-to-auth phrasing without adding a database contract: %s", (prompt) => {
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    });
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "supabase", dossierCapability: "auth" }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "supabase", dossierCapability: "database" }),
    );
  });

  it("keeps an explicit Supabase database request out of auth", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use Supabase database for stored bookings",
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
    });
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "supabase", dossierCapability: "database" }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "supabase", dossierCapability: "auth" }),
    );
  });

  it("keeps explicit Supabase database and auth intent on both capabilities", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use Supabase for database and auth",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true, needsDatabase: true }),
    });
    expect(ctx.contracts.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerKey: "supabase", dossierCapability: "auth" }),
        expect.objectContaining({ providerKey: "supabase", dossierCapability: "database" }),
      ]),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "clerk" }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "postgres" }),
    );
  });

  it("keeps Stripe as provider while recording an explicit Elements method", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use Stripe Elements for payments",
      buildIntent: "app",
      capabilities: baseCaps({ needsPayments: true }),
    });
    expect(ctx.contracts.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerKey: "stripe", dossierCapability: "payments" }),
        expect.objectContaining({ providerKey: "stripe-elements", dossierCapability: undefined }),
      ]),
    );
  });

  it.each([
    ["Switch from Stripe to Swish", "swish"],
    ["Byt från Swish till Stripe", "stripe"],
  ])("uses the directional provider-switch target in %s", (prompt, providerKey) => {
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "app",
      capabilities: baseCaps({ needsPayments: true }),
    });
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey, dossierCapability: "payments" }),
    );
    expect(ctx.contracts.integrations.filter((entry) => entry.dossierCapability === "payments"))
      .toHaveLength(1);
  });

  it("persists an unresolved auth capability when Clerk is rejected without an alternative", () => {
    const inherited = inferPreGenerationContracts({
      prompt: "Use Clerk auth",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    }).contracts.integrations;
    const rejected = inferPreGenerationContracts({
      prompt: "Do not use Clerk",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: inherited,
    });
    expect(rejected.contracts.integrations).toContainEqual(
      expect.objectContaining({
        status: "unresolved",
        dossierCapability: "auth",
        selectionSource: "explicit",
      }),
    );
    expect(rejected.contracts.integrations[0]).not.toHaveProperty("providerKey");

    const neutral = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: rejected.contracts.integrations,
    });
    expect(neutral.contracts.integrations[0]).toMatchObject({
      status: "unresolved",
      dossierCapability: "auth",
    });
  });

  it("keeps a provider-negated capability unresolved even without an inherited choice", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Build login, but do not use Clerk",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    });
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({
        status: "unresolved",
        dossierCapability: "auth",
        selectionSource: "explicit",
      }),
    );
    expect(ctx.contracts.integrations[0]).not.toHaveProperty("providerKey");
  });

  it("does not pick manifest order when project evidence proves two providers for one capability", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Keep the existing database wiring",
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
      projectProviderEvidence: [
        { providerKey: "postgres", dossierCapability: "database", packageRoot: "pg" },
        { providerKey: "mongodb", dossierCapability: "database", packageRoot: "mongodb" },
      ],
    });
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({
        status: "unresolved",
        dossierCapability: "database",
      }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: expect.any(String) }),
    );
    expect(ctx.contracts.integrations[0]).not.toHaveProperty("selectionSource");

    const neutral = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
      inheritedIntegrations: ctx.contracts.integrations,
    });
    expect(neutral.contracts.integrations[0]).toMatchObject({
      status: "unresolved",
      dossierCapability: "database",
    });
  });

  it.each([
    ["Use Postgres with Prisma", "prisma"],
    ["Use Postgres with Drizzle", "drizzle"],
  ])("keeps %s as method metadata while Postgres remains the provider", (prompt, methodKey) => {
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
    });
    expect(ctx.contracts.databaseProvider).toBe("Postgres / DATABASE_URL");
    expect(ctx.contracts.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerKey: "postgres", dossierCapability: "database" }),
        expect.objectContaining({ providerKey: methodKey, dossierCapability: undefined }),
      ]),
    );
  });

  it("does not persist project evidence as a user-explicit selection", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Keep the existing login",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      projectProviderEvidence: [
        { providerKey: "next-auth", dossierCapability: "auth", packageRoot: "next-auth" },
      ],
    });
    const contract = ctx.contracts.integrations.find((entry) => entry.providerKey === "next-auth");
    expect(contract).toBeDefined();
    expect(contract).not.toHaveProperty("selectionSource");
  });

  it("preserves unambiguous legacy choices across repeated neutral follow-ups", () => {
    const legacy = [
      {
        provider: "Auth.js / NextAuth",
        name: "Auth.js / NextAuth",
        reason: "Stored by an older snapshot",
        status: "chosen" as const,
      },
      {
        provider: "SQLite",
        name: "SQLite",
        reason: "Stored by an older snapshot",
        status: "chosen" as const,
      },
    ];
    const first = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true, needsDatabase: true }),
      inheritedIntegrations: legacy,
    });
    const second = inferPreGenerationContracts({
      prompt: "Use a warmer background",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true, needsDatabase: true }),
      inheritedIntegrations: first.contracts.integrations,
    });

    for (const round of [first, second]) {
      expect(round.contracts.integrations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            providerKey: "next-auth",
            dossierCapability: "auth",
            selectionSource: "legacy-preserved",
          }),
          expect.objectContaining({
            providerKey: "sqlite",
            dossierCapability: "database",
            selectionSource: "legacy-preserved",
          }),
        ]),
      );
      expect(round.contracts.integrations).not.toContainEqual(
        expect.objectContaining({ providerKey: "clerk" }),
      );
      expect(round.contracts.integrations).not.toContainEqual(
        expect.objectContaining({ providerKey: "postgres" }),
      );
    }
  });

  it("keeps a generic legacy Supabase identity unresolved instead of guessing DB or Clerk", () => {
    const first = inferPreGenerationContracts({
      prompt: "Keep the existing login",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: [
        {
          provider: "Supabase",
          name: "Supabase",
          reason: "Stored by an older snapshot",
          status: "chosen",
        },
      ],
    });
    const second = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: first.contracts.integrations,
    });

    for (const round of [first, second]) {
      expect(round.contracts.integrations).toEqual([
        expect.objectContaining({
          dossierCapability: "auth",
          status: "unresolved",
        }),
      ]);
      expect(round.contracts.integrations[0]).not.toHaveProperty("providerKey");
      expect(round.contracts.integrations).not.toContainEqual(
        expect.objectContaining({ dossierCapability: "database" }),
      );
      expect(round.contracts.integrations).not.toContainEqual(
        expect.objectContaining({ providerKey: "clerk" }),
      );
      expect(round.contracts.authProvider).toBeUndefined();
      expect(round.contracts.databaseProvider).toBeUndefined();
    }
  });

  it("preserves a specifically named legacy Supabase Auth identity", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Keep the existing login",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: [
        {
          provider: "Supabase",
          name: "Supabase Auth",
          reason: "Stored by an older snapshot",
          status: "chosen",
        },
      ],
    });

    expect(ctx.contracts.integrations).toEqual([
      expect.objectContaining({
        providerKey: "supabase",
        dossierCapability: "auth",
        selectionSource: "legacy-preserved",
      }),
    ]);
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ dossierCapability: "database" }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "clerk" }),
    );
  });

  it.each([
    [
      "auth-only",
      baseCaps({ needsAuth: true }),
      [{ providerKey: "supabase", dossierCapability: "auth", packageRoot: "@supabase/ssr" }],
      ["auth"],
    ],
    [
      "database-only",
      baseCaps({ needsDatabase: true }),
      [{ providerKey: "supabase", dossierCapability: "database", packageRoot: "@supabase/supabase-js" }],
      ["database"],
    ],
    [
      "mixed",
      baseCaps({ needsAuth: true, needsDatabase: true }),
      [
        { providerKey: "supabase", dossierCapability: "auth", packageRoot: "@supabase/ssr" },
        { providerKey: "supabase", dossierCapability: "database", packageRoot: "@supabase/supabase-js" },
      ],
      ["auth", "database"],
    ],
  ] as const)("resolves Supabase project evidence by provider and capability for %s", (_label, capabilities, evidence, expectedCapabilities) => {
    const ctx = inferPreGenerationContracts({
      prompt: "Keep the existing project wiring",
      buildIntent: "app",
      capabilities,
      projectProviderEvidence: evidence,
    });

    expect(
      ctx.contracts.integrations
        .filter((entry) => entry.providerKey === "supabase")
        .map((entry) => entry.dossierCapability)
        .sort(),
    ).toEqual([...expectedCapabilities].sort());
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "clerk" }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "postgres" }),
    );
  });

  it.each([
    [
      "Do not use Supabase database; keep the existing login",
      "auth",
      "database",
    ],
    [
      "Do not use Supabase auth; keep the existing database",
      "database",
      "auth",
    ],
  ] as const)(
    "scopes a Supabase negation to its capability: %s",
    (prompt, preservedCapability, rejectedCapability) => {
      const ctx = inferPreGenerationContracts({
        prompt,
        buildIntent: "app",
        capabilities: baseCaps({ needsAuth: true, needsDatabase: true }),
        inheritedIntegrations: [
          {
            kind: "auth",
            providerKey: "supabase",
            dossierCapability: "auth",
            selectionSource: "explicit",
            provider: "Supabase",
            name: "Supabase Auth",
            reason: "Explicit auth choice",
            status: "chosen",
          },
          {
            kind: "database",
            providerKey: "supabase",
            dossierCapability: "database",
            selectionSource: "explicit",
            provider: "Supabase",
            name: "Supabase",
            reason: "Explicit database choice",
            status: "chosen",
          },
        ],
      });

      expect(ctx.contracts.integrations).toContainEqual(
        expect.objectContaining({
          providerKey: "supabase",
          dossierCapability: preservedCapability,
          status: "chosen",
        }),
      );
      const rejected = ctx.contracts.integrations.find(
        (entry) => entry.dossierCapability === rejectedCapability,
      );
      expect(rejected).toMatchObject({ status: "unresolved" });
      expect(rejected).not.toHaveProperty("providerKey");
    },
  );

  it("deduplicates method evidence without replacing current explicit provenance", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use PostgreSQL with Prisma",
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
      projectProviderEvidence: [
        { providerKey: "prisma", kind: "database", packageRoot: "@prisma/client" },
      ],
    });
    const prisma = ctx.contracts.integrations.filter((entry) => entry.providerKey === "prisma");

    expect(prisma).toHaveLength(1);
    expect(prisma[0]).toMatchObject({
      kind: "database",
      selectionSource: "explicit",
      reason: "Prompten nämner Prisma uttryckligen.",
    });
  });

  it("prefers current project proof over an older legacy-preserved provider", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Keep the existing login",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: [
        {
          kind: "auth",
          providerKey: "next-auth",
          dossierCapability: "auth",
          selectionSource: "legacy-preserved",
          provider: "NextAuth / Auth.js",
          name: "NextAuth / Auth.js",
          reason: "Older choice",
          status: "chosen",
        },
      ],
      projectProviderEvidence: [
        { providerKey: "clerk", dossierCapability: "auth", packageRoot: "@clerk/nextjs" },
      ],
    });

    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "clerk", dossierCapability: "auth" }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "next-auth" }),
    );
  });

  it("keeps two current explicit providers for one capability unresolved", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use Clerk or Auth0 for login",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    });
    const authContracts = ctx.contracts.integrations.filter(
      (entry) => entry.dossierCapability === "auth",
    );
    expect(authContracts).toEqual([
      expect.objectContaining({ status: "unresolved", dossierCapability: "auth" }),
    ]);
    expect(authContracts[0]).not.toHaveProperty("providerKey");
    expect(ctx.contracts.authProvider).toBeUndefined();
  });
});

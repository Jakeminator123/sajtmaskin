import { describe, expect, it } from "vitest";
import { getPreGenerationContractsConfigFromManifest } from "@/lib/ai-models/load-manifest";
import { inferPreGenerationContracts } from "./pre-generation-contracts";
import {
  inferCapabilities,
  type InferredCapabilities,
} from "../capability-inference";
import { getAllDossiers } from "../dossiers/registry";

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

  it("lets exact Supabase auth project evidence replace an unsourced unresolved legacy choice", () => {
    const unresolved = inferPreGenerationContracts({
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
    const neutral = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: unresolved.contracts.integrations,
    });
    const evidenced = inferPreGenerationContracts({
      prompt: "Keep the existing login",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: neutral.contracts.integrations,
      projectProviderEvidence: [
        { providerKey: "supabase", dossierCapability: "auth", packageRoot: "@supabase/ssr" },
      ],
    });

    expect(evidenced.contracts.integrations).toEqual([
      expect.objectContaining({
        providerKey: "supabase",
        dossierCapability: "auth",
        status: "chosen",
      }),
    ]);
    expect(evidenced.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ dossierCapability: "database" }),
    );
    expect(evidenced.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "clerk" }),
    );
  });

  it("does not let project evidence bypass an explicit unresolved provider rejection", () => {
    const rejected = inferPreGenerationContracts({
      prompt: "Do not use Supabase auth",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
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
      ],
    });
    const evidenced = inferPreGenerationContracts({
      prompt: "Keep the existing login",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: rejected.contracts.integrations,
      projectProviderEvidence: [
        { providerKey: "supabase", dossierCapability: "auth", packageRoot: "@supabase/ssr" },
      ],
    });

    expect(evidenced.contracts.integrations).toEqual([
      expect.objectContaining({
        dossierCapability: "auth",
        selectionSource: "explicit",
        status: "unresolved",
      }),
    ]);
    expect(evidenced.contracts.integrations[0]).not.toHaveProperty("providerKey");
    expect(evidenced.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "clerk" }),
    );
  });

  it.each([
    [
      "Do not use Supabase auth",
      { providerKey: "supabase", dossierCapability: "auth", packageRoot: "@supabase/ssr" },
      "supabase",
    ],
    [
      "Build login, but do not use Clerk",
      { providerKey: "clerk", dossierCapability: "auth", packageRoot: "@clerk/nextjs" },
      "clerk",
    ],
  ] as const)(
    "keeps current provider negation ahead of exact project evidence: %s",
    (prompt, evidence, rejectedProviderKey) => {
      const ctx = inferPreGenerationContracts({
        prompt,
        buildIntent: "app",
        capabilities: baseCaps({ needsAuth: true }),
        projectProviderEvidence: [evidence],
      });

      expect(ctx.contracts.integrations).toEqual([
        expect.objectContaining({
          dossierCapability: "auth",
          selectionSource: "explicit",
          status: "unresolved",
        }),
      ]);
      expect(ctx.contracts.integrations[0]).not.toHaveProperty("providerKey");
      expect(ctx.contracts.integrations).not.toContainEqual(
        expect.objectContaining({ providerKey: rejectedProviderKey }),
      );
    },
  );

  it("filters current-negated method evidence without dropping the selected provider", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use PostgreSQL, but do not use Prisma",
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
      projectProviderEvidence: [
        { providerKey: "prisma", kind: "database", packageRoot: "@prisma/client" },
      ],
    });

    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "postgres", dossierCapability: "database" }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "prisma" }),
    );
  });

  it("promotes a technical unresolved choice to a durable explicit rejection before evidence", () => {
    const technicalUnresolved = [
      {
        kind: "auth" as const,
        dossierCapability: "auth",
        provider: "auth provider not selected",
        name: "auth provider not selected",
        reason: "The project contains runtime proof for multiple providers.",
        status: "unresolved" as const,
      },
    ];
    const evidence = [
      { providerKey: "supabase", dossierCapability: "auth", packageRoot: "@supabase/ssr" },
    ];
    const rejected = inferPreGenerationContracts({
      prompt: "Do not use Supabase auth",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: technicalUnresolved,
      projectProviderEvidence: evidence,
    });
    const neutral = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: rejected.contracts.integrations,
      projectProviderEvidence: evidence,
    });

    for (const round of [rejected, neutral]) {
      expect(round.contracts.integrations).toEqual([
        expect.objectContaining({
          dossierCapability: "auth",
          selectionSource: "explicit",
          status: "unresolved",
        }),
      ]);
      expect(round.contracts.integrations[0]).not.toHaveProperty("providerKey");
    }

    const replaced = inferPreGenerationContracts({
      prompt: "Use Clerk auth",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: neutral.contracts.integrations,
      projectProviderEvidence: evidence,
    });
    expect(replaced.contracts.integrations).toEqual([
      expect.objectContaining({
        providerKey: "clerk",
        dossierCapability: "auth",
        selectionSource: "explicit",
        status: "chosen",
      }),
    ]);
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

  it.each([
    ["Do not use Supabase database; keep Supabase auth", "auth", "database"],
    ["Do not use Supabase auth, but keep Supabase database", "database", "auth"],
    ["Använd inte Supabase database; behåll Supabase auth", "auth", "database"],
    ["Använd inte Supabase auth, men behåll Supabase database", "database", "auth"],
  ] as const)(
    "uses one segment decision for Supabase reject/keep pairs: %s",
    (prompt, keptCapability, rejectedCapability) => {
      const ctx = inferPreGenerationContracts({
        prompt,
        buildIntent: "app",
        capabilities: baseCaps({ needsAuth: true, needsDatabase: true }),
      });

      expect(ctx.contracts.integrations).toContainEqual(
        expect.objectContaining({
          providerKey: "supabase",
          dossierCapability: keptCapability,
          status: "chosen",
        }),
      );
      const rejected = ctx.contracts.integrations.find(
        (entry) => entry.dossierCapability === rejectedCapability,
      );
      expect(rejected).toMatchObject({ status: "unresolved" });
      expect(rejected).not.toHaveProperty("providerKey");
      expect(ctx.contracts.integrations).not.toContainEqual(
        expect.objectContaining({ providerKey: "clerk" }),
      );
      expect(ctx.contracts.integrations).not.toContainEqual(
        expect.objectContaining({ providerKey: "postgres" }),
      );
    },
  );

  it("lets the current Supabase pair decision override stale brief text", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Do not use Supabase database; keep Supabase auth",
      brief: { mustHave: ["Member portal backed by Supabase database"] },
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true, needsDatabase: true }),
    });

    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "supabase",
        dossierCapability: "auth",
        status: "chosen",
      }),
    );
    const database = ctx.contracts.integrations.find(
      (entry) => entry.dossierCapability === "database",
    );
    expect(database).toMatchObject({ status: "unresolved" });
    expect(database).not.toHaveProperty("providerKey");
  });

  it("keeps a generic Supabase rejection unresolved for both relevant capabilities", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Do not use Supabase",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true, needsDatabase: true }),
    });

    expect(ctx.contracts.integrations).toHaveLength(2);
    for (const capability of ["auth", "database"]) {
      const integration = ctx.contracts.integrations.find(
        (entry) => entry.dossierCapability === capability,
      );
      expect(integration).toMatchObject({ status: "unresolved" });
      expect(integration).not.toHaveProperty("providerKey");
    }
  });

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

  it.each([
    ["Do not use Clerk", undefined],
    ["Use Auth0 instead", "auth0"],
    ["Make the heading larger", "clerk"],
  ] as const)(
    "lets the current prompt own an auth decision over a stale brief: %s",
    (prompt, expectedProviderKey) => {
      const ctx = inferPreGenerationContracts({
        prompt,
        brief: { mustHave: ["Use Clerk auth"] },
        buildIntent: "app",
        capabilities: baseCaps({ needsAuth: true }),
      });
      const auth = ctx.contracts.integrations.filter(
        (entry) => entry.dossierCapability === "auth",
      );

      expect(auth).toHaveLength(1);
      if (expectedProviderKey) {
        expect(auth[0]).toMatchObject({ providerKey: expectedProviderKey, status: "chosen" });
      } else {
        expect(auth[0]).toMatchObject({ status: "unresolved", selectionSource: "explicit" });
        expect(auth[0]).not.toHaveProperty("providerKey");
      }
      expect(auth).not.toContainEqual(expect.objectContaining({
        providerKey: expectedProviderKey === "clerk" ? "auth0" : "clerk",
      }));
    },
  );

  it("lets a current method rejection override stale brief method metadata", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use PostgreSQL, but do not use Prisma",
      brief: { mustHave: ["Use Prisma for the database"] },
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
    });

    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "prisma" }),
    );
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "postgres", dossierCapability: "database" }),
    );
  });

  it("keeps an inherited explicit auth choice ahead of stale brief fallback", () => {
    const selected = inferPreGenerationContracts({
      prompt: "Use Auth0, not Clerk",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    });
    const neutral = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      brief: { mustHave: ["Use Clerk auth"] },
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: selected.contracts.integrations,
    });

    expect(neutral.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "auth0",
        dossierCapability: "auth",
        selectionSource: "explicit",
      }),
    );
    expect(neutral.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "clerk" }),
    );
  });

  it("keeps an inherited explicit unresolved holder ahead of stale brief fallback", () => {
    const rejected = inferPreGenerationContracts({
      prompt: "Do not use Clerk",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    });
    const neutral = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      brief: { mustHave: ["Use Clerk auth"] },
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: rejected.contracts.integrations,
    });
    const auth = neutral.contracts.integrations.filter(
      (entry) => entry.dossierCapability === "auth",
    );

    expect(auth).toEqual([
      expect.objectContaining({ status: "unresolved", selectionSource: "explicit" }),
    ]);
    expect(auth[0]).not.toHaveProperty("providerKey");
  });

  it("lets a current database method replace stale brief and inherited method choices", () => {
    const staleBrief = inferPreGenerationContracts({
      prompt: "Use Drizzle instead",
      brief: { mustHave: ["Use Prisma for the database"] },
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
    });
    const inheritedPrisma = inferPreGenerationContracts({
      prompt: "Use Drizzle instead",
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
      inheritedIntegrations: [
        {
          kind: "database",
          providerKey: "prisma",
          selectionSource: "explicit",
          provider: "Prisma",
          name: "Prisma",
          reason: "Previously selected method.",
          status: "chosen",
          envVars: ["DATABASE_URL"],
        },
      ],
    });

    for (const ctx of [staleBrief, inheritedPrisma]) {
      expect(ctx.contracts.integrations).toContainEqual(
        expect.objectContaining({ providerKey: "drizzle", selectionSource: "explicit" }),
      );
      expect(ctx.contracts.integrations).not.toContainEqual(
        expect.objectContaining({ providerKey: "prisma" }),
      );
    }
  });

  it("does not let a stale brief switch resolve a current ambiguous provider choice", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use Clerk and Auth0 for login",
      brief: { mustHave: ["Switch from Clerk to Auth0"] },
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    });
    const auth = ctx.contracts.integrations.filter(
      (entry) => entry.dossierCapability === "auth",
    );

    expect(auth).toEqual([
      expect.objectContaining({ status: "unresolved", selectionSource: "explicit" }),
    ]);
    expect(auth[0]).not.toHaveProperty("providerKey");
  });

  it("reprojects inherited explicit provider identity and non-blocking env across neutral rounds", () => {
    const explicit = inferPreGenerationContracts({
      prompt: "Use Auth0, not Clerk",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    });
    const neutralOne = inferPreGenerationContracts({
      prompt: "Make the heading larger",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: explicit.contracts.integrations,
    });
    const neutralTwo = inferPreGenerationContracts({
      prompt: "Use a warmer background",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: neutralOne.contracts.integrations,
    });

    for (const round of [neutralOne, neutralTwo]) {
      expect(round.contracts.authProvider).toBe("Auth0");
      expect(round.contracts.envVars).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "AUTH0_SECRET", required: false }),
          expect.objectContaining({ key: "AUTH0_CLIENT_ID", required: false }),
        ]),
      );
    }

    const rejected = inferPreGenerationContracts({
      prompt: "Do not use Auth0",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: neutralTwo.contracts.integrations,
    });
    expect(rejected.contracts.authProvider).toBeUndefined();
    expect(rejected.contracts.envVars).not.toContainEqual(
      expect.objectContaining({ key: "AUTH0_SECRET" }),
    );

    const replaced = inferPreGenerationContracts({
      prompt: "Use Clerk auth",
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
      inheritedIntegrations: rejected.contracts.integrations,
    });
    expect(replaced.contracts.authProvider).toBe("Clerk");
    expect(replaced.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "clerk", status: "chosen" }),
    );
  });

  it.each([
    ["Use Firebase for login", "auth", "Firebase"],
    ["Use PayPal for payments", "payments", "PayPal"],
  ] as const)(
    "keeps recognized but undeliverable provider intent unresolved: %s",
    (prompt, capability, label) => {
      const ctx = inferPreGenerationContracts({
        prompt,
        buildIntent: "app",
        capabilities: baseCaps({
          needsAuth: capability === "auth",
          needsPayments: capability === "payments",
        }),
      });
      expect(ctx.contracts.integrations).toEqual([
        expect.objectContaining({
          dossierCapability: capability,
          selectionSource: "explicit",
          provider: label,
          name: label,
          status: "unresolved",
        }),
      ]);
      expect(ctx.contracts.integrations[0]).not.toHaveProperty("providerKey");
      expect(ctx.contracts.integrations[0].envVars ?? []).toEqual([]);
      expect(ctx.contracts.authProvider).toBeUndefined();
      expect(ctx.contracts.paymentProvider).toBeUndefined();
      expect(ctx.contracts.envVars).toEqual([]);
    },
  );

  it.each([
    ["Do not use Clerk, Auth0", "auth", ["clerk", "auth0"]],
    ["Använd inte Clerk, Auth0", "auth", ["clerk", "auth0"]],
    ["Do not use Prisma, Drizzle", "database", ["prisma", "drizzle"]],
  ] as const)(
    "keeps a bare comma-list inside the shared negation window: %s",
    (prompt, capability, forbiddenKeys) => {
      const ctx = inferPreGenerationContracts({
        prompt,
        buildIntent: "app",
        capabilities: baseCaps({
          needsAuth: capability === "auth",
          needsDatabase: capability === "database",
        }),
      });
      for (const providerKey of forbiddenKeys) {
        expect(ctx.contracts.integrations).not.toContainEqual(
          expect.objectContaining({ providerKey }),
        );
      }
    },
  );

  it.each([
    ["Do not use Clerk, use Auth0", "auth0"],
    ["Use Clerk, but do not use Auth0", "clerk"],
    ["Använd inte Clerk, använd Auth0", "auth0"],
  ] as const)("preserves a new imperative or adversative positive choice: %s", (prompt, expected) => {
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "app",
      capabilities: baseCaps({ needsAuth: true }),
    });
    expect(ctx.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: expected, status: "chosen" }),
    );
  });

  it.each([
    ["Use Upstash as the database", "database", "Upstash"],
    ["Använd Redis som databas", "database", "Redis"],
    ["Use Resend for newsletter signup", "newsletter-subscribe", "Resend"],
    ["Använd Resend för nyhetsbrev", "newsletter-subscribe", "Resend"],
  ] as const)(
    "holds a recognized provider with an unsupported purpose unresolved: %s",
    (prompt, capability, label) => {
      const ctx = inferPreGenerationContracts({
        prompt,
        buildIntent: "app",
        capabilities: baseCaps({
          needsDatabase: capability === "database",
        }),
      });
      expect(ctx.contracts.integrations).toEqual([
        expect.objectContaining({
          dossierCapability: capability,
          selectionSource: "explicit",
          provider: label,
          name: label,
          status: "unresolved",
        }),
      ]);
      expect(ctx.contracts.integrations[0]).not.toHaveProperty("providerKey");
      expect(ctx.contracts.integrations[0].envVars ?? []).toEqual([]);
      expect(ctx.contracts.databaseProvider).toBeUndefined();
      expect(ctx.contracts.envVars).toEqual([]);
    },
  );

  it("does not reinterpret bare or supported-purpose provider mentions", () => {
    const bareUpstash = inferPreGenerationContracts({
      prompt: "Use Upstash",
      buildIntent: "app",
      capabilities: baseCaps(),
    });
    expect(bareUpstash.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "upstash", status: "chosen" }),
    );

    const resendContact = inferPreGenerationContracts({
      prompt: "Use Resend for the contact form",
      buildIntent: "website",
      capabilities: baseCaps(),
    });
    expect(resendContact.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "resend",
        dossierCapability: "contact-form",
        status: "chosen",
      }),
    );

    const genericDatabase = inferPreGenerationContracts({
      prompt: "Add a database",
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
    });
    expect(genericDatabase.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "postgres", status: "chosen" }),
    );
  });

  it("keeps an inherited supported capability while holding another purpose unresolved", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use Redis as the database",
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
      inheritedIntegrations: [
        {
          kind: "integration",
          providerKey: "upstash",
          dossierCapability: "analytics",
          selectionSource: "explicit",
          provider: "Upstash",
          name: "Upstash visitor counter",
          reason: "Previously selected visitor counter.",
          status: "chosen",
          envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
        },
      ],
    });
    expect(ctx.contracts.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dossierCapability: "database",
          provider: "Redis",
          status: "unresolved",
        }),
        expect.objectContaining({
          providerKey: "upstash",
          dossierCapability: "analytics",
          status: "chosen",
        }),
      ]),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "upstash", dossierCapability: undefined }),
    );
  });

  it("keeps inherited Resend contact-form while a new newsletter purpose stays unresolved", () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Use Resend for newsletter signup",
      buildIntent: "website",
      capabilities: baseCaps({ needsForms: true }),
      inheritedIntegrations: [
        {
          kind: "integration",
          providerKey: "resend",
          dossierCapability: "contact-form",
          selectionSource: "explicit",
          provider: "Resend",
          name: "Resend",
          reason: "Existing contact form.",
          status: "chosen",
          envVars: ["RESEND_API_KEY"],
        },
      ],
    });

    expect(ctx.contracts.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dossierCapability: "newsletter-subscribe",
          status: "unresolved",
        }),
        expect.objectContaining({
          providerKey: "resend",
          dossierCapability: "contact-form",
          status: "chosen",
        }),
      ]),
    );
    expect(ctx.contracts.envVars).toContainEqual(
      expect.objectContaining({ key: "RESEND_API_KEY", required: false }),
    );
  });

  it("keeps distinct same-vendor purposes and switches away from the unsupported source", () => {
    for (const prompt of [
      "Use Resend for newsletter signup and Resend for the contact form",
      "Använd Resend för nyhetsbrev och Resend för kontaktformulär",
    ]) {
      const dual = inferPreGenerationContracts({
        prompt,
        buildIntent: "website",
        capabilities: baseCaps({ needsForms: true }),
      });
      expect(dual.contracts.integrations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            dossierCapability: "newsletter-subscribe",
            status: "unresolved",
          }),
          expect.objectContaining({
            providerKey: "resend",
            dossierCapability: "contact-form",
            status: "chosen",
          }),
        ]),
      );
    }

    for (const prompt of [
      "Switch from Resend newsletter to contact form",
      "Byt från Resend nyhetsbrev till kontaktformulär",
    ]) {
      const switched = inferPreGenerationContracts({
        prompt,
        buildIntent: "website",
        capabilities: baseCaps({ needsForms: true }),
      });
      expect(switched.contracts.integrations).toEqual([
        expect.objectContaining({
          providerKey: "resend",
          dossierCapability: "contact-form",
          status: "chosen",
        }),
      ]);
    }
  });

  it("switches from Resend contact form to newsletter without retaining contact env", () => {
    for (const prompt of [
      "Switch from Resend contact form to newsletter signup",
      "Byt från Resend kontaktformulär till nyhetsbrev",
    ]) {
      const switched = inferPreGenerationContracts({
        prompt,
        buildIntent: "website",
        capabilities: baseCaps({ needsForms: true }),
        inheritedIntegrations: [
          {
            kind: "integration",
            providerKey: "resend",
            dossierCapability: "contact-form",
            selectionSource: "explicit",
            provider: "Resend",
            name: "Resend",
            reason: "Existing contact form.",
            status: "chosen",
            envVars: ["RESEND_API_KEY"],
          },
        ],
      });
      expect(switched.contracts.integrations).toEqual([
        expect.objectContaining({
          dossierCapability: "newsletter-subscribe",
          status: "unresolved",
        }),
      ]);
      expect(switched.contracts.integrations[0]).not.toHaveProperty("providerKey");
      expect(switched.contracts.envVars).not.toContainEqual(
        expect.objectContaining({ key: "RESEND_API_KEY" }),
      );
    }
  });

  it("does not infer a Resend contact sidecar from negated or stale contact purpose", () => {
    for (const params of [
      {
        prompt: "Use Resend for newsletter signup, not a contact form",
        brief: null,
      },
      {
        prompt: "Use Resend for newsletter signup",
        brief: { mustHave: ["Use Resend for the contact form"] },
      },
    ]) {
      const ctx = inferPreGenerationContracts({
        ...params,
        buildIntent: "website",
        capabilities: baseCaps({ needsForms: true }),
      });
      expect(ctx.contracts.integrations).toEqual([
        expect.objectContaining({
          dossierCapability: "newsletter-subscribe",
          status: "unresolved",
        }),
      ]);
      expect(ctx.contracts.integrations).not.toContainEqual(
        expect.objectContaining({ dossierCapability: "contact-form" }),
      );
    }
  });

  it.each([
    ["Use Firebase as the database", "Firebase"],
    ["Use Firestore for the database", "Firestore"],
    ["Använd Firebase som databas", "Firebase"],
    ["Använd Firestore för databasen", "Firestore"],
  ] as const)("keeps explicit unsupported Firebase database intent unresolved: %s", (prompt, label) => {
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "app",
      capabilities: baseCaps({ needsDatabase: true }),
    });
    expect(ctx.contracts.integrations).toEqual([
      expect.objectContaining({
        dossierCapability: "database",
        provider: label,
        status: "unresolved",
      }),
    ]);
    expect(ctx.contracts.integrations[0]).not.toHaveProperty("providerKey");
    expect(ctx.contracts.integrations[0].envVars ?? []).toEqual([]);
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ dossierCapability: "auth" }),
    );
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "postgres" }),
    );
    expect(ctx.contracts.databaseProvider).toBeUndefined();
    expect(ctx.contracts.envVars).toEqual([]);
  });

  it("requires an auth purpose before treating Firebase as auth", () => {
    const bare = inferPreGenerationContracts({
      prompt: "Use Firebase",
      buildIntent: "app",
      capabilities: baseCaps(),
    });
    expect(bare.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ dossierCapability: "auth" }),
    );

    for (const prompt of [
      "Use Firebase for login",
      "Build authentication with Firebase",
      "Använd Firebase för inloggning",
      "Bygg inloggning med Firebase",
    ]) {
      const auth = inferPreGenerationContracts({
        prompt,
        buildIntent: "app",
        capabilities: baseCaps({ needsAuth: true }),
      });
      expect(auth.contracts.integrations).toEqual([
        expect.objectContaining({
          dossierCapability: "auth",
          provider: "Firebase",
          status: "unresolved",
        }),
      ]);
    }
  });

  it("does not use unresolved purpose metadata to reinterpret chosen legacy providers", () => {
    const resend = inferPreGenerationContracts({
      prompt: "Keep the existing integration",
      buildIntent: "website",
      capabilities: baseCaps({ needsForms: true }),
      inheritedIntegrations: [
        {
          kind: "integration",
          provider: "Resend",
          name: "Resend",
          reason: "Legacy provider choice.",
          status: "chosen",
        },
      ],
    });
    expect(resend.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "resend",
        dossierCapability: "contact-form",
        status: "chosen",
      }),
    );

    const upstash = inferPreGenerationContracts({
      prompt: "Keep the existing integration",
      buildIntent: "app",
      capabilities: baseCaps(),
      inheritedIntegrations: [
        {
          kind: "integration",
          provider: "Upstash",
          name: "Upstash",
          reason: "Legacy provider choice.",
          status: "chosen",
        },
      ],
    });
    expect(upstash.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "upstash", status: "chosen" }),
    );
    expect(upstash.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ dossierCapability: "database", status: "unresolved" }),
    );
  });

  it("keeps every provider-rule capability in the canonical hard dossier catalog", () => {
    const hardCapabilities = new Set(
      getAllDossiers()
        .filter((entry) => entry.class === "hard")
        .map((entry) => entry.capability),
    );
    const configuredCapabilities = getPreGenerationContractsConfigFromManifest()
      .providerRules
      .map((rule) => rule.dossierCapability)
      .filter((capability): capability is string => Boolean(capability));

    expect(
      configuredCapabilities.filter((capability) => !hardCapabilities.has(capability)),
    ).toEqual([]);
  });

  it.each([
    ["Use Google Analytics 4", "google-analytics"],
    ["Use Google Tag Manager", "gtm"],
    ["Use Plausible analytics", "plausible"],
    ["Use PostHog analytics", "posthog"],
  ] as const)("owns explicit analytics provider intent without an Upstash fallback: %s", (prompt, providerKey) => {
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      capabilities: baseCaps(),
    });
    expect(ctx.contracts.integrations).toEqual([
      expect.objectContaining({
        providerKey,
        dossierCapability: "analytics",
        selectionSource: "explicit",
      }),
    ]);
    expect(ctx.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "upstash" }),
    );
  });
});

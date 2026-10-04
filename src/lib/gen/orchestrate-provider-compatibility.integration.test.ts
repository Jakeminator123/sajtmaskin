import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, FEATURES: { ...actual.FEATURES, useDossierPipeline: true } };
});

vi.mock("./data/shadcn-ui-recipes", () => ({
  resolveShadcnUiRecipes: vi.fn(async () => []),
}));

import { resolveOrchestrationBase, type OrchestrationInput } from "./orchestrate";
import type { InferredCapabilities } from "./capability-inference";

const none: InferredCapabilities = {
  needsMotion: false,
  needs3D: false,
  needsPhysics: false,
  needsParallax: false,
  needsPayments: false,
  needsCharts: false,
  needsDatabase: false,
  needsAuth: false,
  needsAppShell: false,
  needsDataUI: false,
  needsForms: false,
  needsGame: false,
  needsEcommerce: false,
  needsCarousel: false,
  needsPremiumVisuals: false,
  needsCalendar: false,
  needsCommandSearch: false,
  needsThemeToggle: false,
};

function input(prompt: string, overrides: Partial<OrchestrationInput>): OrchestrationInput {
  return {
    prompt,
    rawPrompt: prompt,
    routePlanPrompt: prompt,
    buildSpecPrompt: prompt,
    contractsPrompt: prompt,
    capabilitiesPrompt: prompt,
    scaffoldMatchPrompt: prompt,
    buildIntent: "app",
    generationMode: "init",
    lifecycleStage: "integrations",
    scaffoldMode: "auto",
    embeddingScaffoldMatch: false,
    previousFilesCount: 0,
    previousFiles: [],
    capabilities: none,
    promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    ...overrides,
  };
}

function followUpContract(
  capabilities: string[],
  inheritedProviderContracts: NonNullable<
    OrchestrationInput["followUpContract"]
  >["inheritedProviderContracts"] = [],
): NonNullable<OrchestrationInput["followUpContract"]> {
  return {
    baseVersionId: "ver_base",
    snapshotBrief: null,
    scaffoldId: null,
    variantId: null,
    routePlan: { existingRoutePaths: [], existingShellRoutePaths: [] },
    capabilities,
    f3ApprovedCapabilities: [],
    qualityTarget: null,
    previewSessionId: null,
    inheritedProviderContracts,
  };
}

describe("provider-compatible orchestration", () => {
  it.each([
    ["Use MongoDB, not Postgres", "database", "mongodb", "postgres-drizzle", { needsDatabase: true }],
    ["Use Auth0, not Clerk", "auth", "auth0", "clerk-auth", { needsAuth: true }],
    ["Use Swish, not Stripe", "payments", "swish", "stripe-checkout", { needsPayments: true }],
  ])("never injects the wrong dossier for %s", async (prompt, capability, providerKey, wrongId, flags) => {
    const base = await resolveOrchestrationBase(
      input(prompt, {
        capabilities: { ...none, ...flags },
        requestedDossierCapabilities: [capability],
      }),
    );
    expect(base.preGenerationContracts.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey, dossierCapability: capability }),
    );
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).not.toContain(wrongId);
  });

  it("keeps generic defaults and dossiers on the same provider", async () => {
    const base = await resolveOrchestrationBase(
      input("Build login and stored profiles", {
        capabilities: { ...none, needsAuth: true, needsDatabase: true },
        requestedDossierCapabilities: ["auth", "database"],
      }),
    );
    expect(base.preGenerationContracts.contracts.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerKey: "clerk", dossierCapability: "auth" }),
        expect.objectContaining({ providerKey: "postgres", dossierCapability: "database" }),
      ]),
    );
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).toEqual(
      expect.arrayContaining(["clerk-auth", "postgres-drizzle"]),
    );
  });

  it.each([
    ["Use PostgreSQL with Prisma", false],
    ["Use PostgreSQL with Drizzle", true],
  ])("does not force the Drizzle dossier across an explicit database method: %s", async (prompt, keepsDossier) => {
    const base = await resolveOrchestrationBase(
      input(prompt, {
        capabilities: { ...none, needsDatabase: true },
        requestedDossierCapabilities: ["database"],
      }),
    );
    expect(base.preGenerationContracts.contracts.databaseProvider).toBe("Postgres / DATABASE_URL");
    expect(base.dossierSelection?.selected.some((selected) => selected.entry.id === "postgres-drizzle"))
      .toBe(keepsDossier);
  });

  it("lets exact package plus runtime evidence prevent an auth default", async () => {
    const base = await resolveOrchestrationBase(
      input("Keep the existing login", {
        capabilities: { ...none, needsAuth: true },
        requestedDossierCapabilities: ["auth"],
        previousFiles: [
          {
            path: "package.json",
            content: JSON.stringify({ dependencies: { "next-auth": "5" } }),
            language: "json",
          },
          {
            path: "lib/auth.ts",
            content: 'import NextAuth from "next-auth"; export const auth = NextAuth({ providers: [] });',
            language: "ts",
          },
        ],
      }),
    );
    expect(base.preGenerationContracts.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "next-auth", dossierCapability: "auth" }),
    );
    expect(base.dossierSelection?.selected).toEqual([]);
  });

  it("keeps an existing Prisma project out of the competing Drizzle dossier", async () => {
    const base = await resolveOrchestrationBase(
      input("Keep the existing database implementation", {
        capabilities: { ...none, needsDatabase: true },
        requestedDossierCapabilities: ["database"],
        previousFiles: [
          {
            path: "package.json",
            content: JSON.stringify({ dependencies: { "@prisma/client": "^6" } }),
            language: "json",
          },
          {
            path: "lib/db.ts",
            content: 'import { PrismaClient } from "@prisma/client"; export const db = new PrismaClient();',
            language: "ts",
          },
        ],
      }),
    );
    expect(base.preGenerationContracts.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "prisma", dossierCapability: undefined }),
    );
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).not.toContain(
      "postgres-drizzle",
    );
  });

  it("re-derives the same-round BuildSpec after a registry default synthesizes a contract", async () => {
    const base = await resolveOrchestrationBase(
      input("Show the site owner a visitor count", {
        buildIntent: "website",
        requestedDossierCapabilities: ["analytics"],
      }),
    );
    expect(base.preGenerationContracts.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "upstash",
        dossierCapability: "analytics",
        selectionSource: "dossier-default",
      }),
    );
    expect(base.buildSpec.changeScope).toBe("integration");
    expect(base.buildSpec.referenceCategories).toContain("backend");
  });

  it("keeps a neutral contact-form dossier, contract, and same-round BuildSpec aligned", async () => {
    const base = await resolveOrchestrationBase(
      input("Lägg till ett kontaktformulär", {
        buildIntent: "website",
        capabilities: { ...none, needsForms: true },
        requestedDossierCapabilities: ["contact-form"],
      }),
    );

    expect(base.preGenerationContracts.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "resend",
        dossierCapability: "contact-form",
        selectionSource: "dossier-default",
      }),
    );
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).toContain(
      "resend-contact-form",
    );
    expect(base.buildSpec.changeScope).toBe("integration");
    expect(base.buildSpec.referenceCategories).toContain("backend");
  });

  it("keeps explicit Resend newsletter intent unresolved on the canonical capability", async () => {
    const base = await resolveOrchestrationBase(
      input("Use Resend for newsletter signup", {
        buildIntent: "website",
        requestedDossierCapabilities: ["newsletter-subscribe"],
      }),
    );

    expect(base.preGenerationContracts.contracts.integrations).toEqual([
      expect.objectContaining({
        dossierCapability: "newsletter-subscribe",
        provider: "Resend",
        status: "unresolved",
      }),
    ]);
    expect(base.preGenerationContracts.contracts.integrations[0]).not.toHaveProperty(
      "providerKey",
    );
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).not.toContain(
      "mailchimp-newsletter",
    );
  });

  it.each([
    ["Switch from Resend contact form to Mailchimp for newsletter signup"],
    ["Byt från Resend kontaktformulär till Mailchimp för nyhetsbrev"],
  ])("removes the source capability before caller and floor restoration: %s", async (prompt) => {
    const base = await resolveOrchestrationBase(
      input(prompt, {
        generationMode: "followUp",
        previousFilesCount: 1,
        capabilities: { ...none, needsForms: true },
        brief: { requestedCapabilities: ["contact-form", "newsletter-subscribe"] },
        requestedDossierCapabilities: ["contact-form", "newsletter-subscribe"],
        followUpContract: followUpContract(["contact-form", "newsletter-subscribe"], [
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
        ]),
      }),
    );

    expect(base.removedCapabilities).toContain("contact-form");
    expect(base.dossierRequestedCapabilities).not.toContain("contact-form");
    expect(base.preGenerationContracts.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "mailchimp",
        dossierCapability: "newsletter-subscribe",
        status: "chosen",
      }),
    );
    expect(base.preGenerationContracts.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ providerKey: "resend" }),
    );
    expect(base.preGenerationContracts.contracts.envVars).not.toContainEqual(
      expect.objectContaining({ key: "RESEND_API_KEY" }),
    );
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).toEqual([
      "mailchimp-newsletter",
    ]);
  });

  it.each([
    ["Switch from Resend newsletter to Mailchimp for newsletter signup"],
    ["Byt från Resend nyhetsbrev till Mailchimp för nyhetsbrev"],
  ])("keeps a same-capability provider switch active without deleting the capability: %s", async (prompt) => {
    const base = await resolveOrchestrationBase(
      input(prompt, {
        generationMode: "followUp",
        previousFilesCount: 1,
        requestedDossierCapabilities: ["newsletter-subscribe"],
        followUpContract: followUpContract(["newsletter-subscribe"]),
      }),
    );

    expect(base.removedCapabilities).not.toContain("newsletter-subscribe");
    expect(base.preGenerationContracts.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "mailchimp",
        dossierCapability: "newsletter-subscribe",
      }),
    );
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).toEqual([
      "mailchimp-newsletter",
    ]);
  });

  it.each([
    ["Switch from Resend contact form to newsletter signup"],
    ["Byt från Resend kontaktformulär till nyhetsbrev"],
  ])("removes same-vendor source capability before unresolved newsletter planning: %s", async (prompt) => {
    const base = await resolveOrchestrationBase(
      input(prompt, {
        generationMode: "followUp",
        previousFilesCount: 1,
        capabilities: { ...none, needsForms: true },
        requestedDossierCapabilities: ["contact-form", "newsletter-subscribe"],
        followUpContract: followUpContract(["contact-form", "newsletter-subscribe"]),
      }),
    );

    expect(base.removedCapabilities).toContain("contact-form");
    expect(base.dossierRequestedCapabilities).not.toContain("contact-form");
    expect(base.preGenerationContracts.contracts.integrations).toEqual([
      expect.objectContaining({
        dossierCapability: "newsletter-subscribe",
        status: "unresolved",
      }),
    ]);
    expect(base.preGenerationContracts.contracts.envVars).not.toContainEqual(
      expect.objectContaining({ key: "RESEND_API_KEY" }),
    );
    expect(base.dossierSelection?.selected).toEqual([]);
  });

  it("switches Firebase auth to Supabase database without restoring auth defaults", async () => {
    const base = await resolveOrchestrationBase(
      input("Switch from Firebase auth to Supabase database", {
        generationMode: "followUp",
        previousFilesCount: 1,
        capabilities: { ...none, needsAuth: true, needsDatabase: true },
        requestedDossierCapabilities: ["auth", "database"],
        followUpContract: followUpContract(["auth", "database"]),
      }),
    );

    expect(base.removedCapabilities).toContain("auth");
    expect(base.dossierRequestedCapabilities).not.toContain("auth");
    expect(base.preGenerationContracts.contracts.integrations).toContainEqual(
      expect.objectContaining({
        providerKey: "supabase",
        dossierCapability: "database",
      }),
    );
    expect(base.preGenerationContracts.contracts.integrations).not.toContainEqual(
      expect.objectContaining({ dossierCapability: "auth" }),
    );
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).not.toContain(
      "clerk-auth",
    );
  });

  it("keeps a same-capability auth provider switch without deleting auth", async () => {
    const base = await resolveOrchestrationBase(
      input("Switch from Auth0 to Clerk auth", {
        generationMode: "followUp",
        previousFilesCount: 1,
        capabilities: { ...none, needsAuth: true },
        requestedDossierCapabilities: ["auth"],
        followUpContract: followUpContract(["auth"]),
      }),
    );

    expect(base.removedCapabilities).not.toContain("auth");
    expect(base.preGenerationContracts.contracts.integrations).toContainEqual(
      expect.objectContaining({ providerKey: "clerk", dossierCapability: "auth" }),
    );
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).toContain(
      "clerk-auth",
    );
  });

  it.each([
    ["Use Google Analytics 4", "google-analytics"],
    ["Use Google Tag Manager", "gtm"],
    ["Use Plausible analytics", "plausible"],
    ["Use PostHog analytics", "posthog"],
  ] as const)(
    "keeps explicit analytics provider work context-only instead of injecting visitor-counter: %s",
    async (prompt, providerKey) => {
      const base = await resolveOrchestrationBase(
        input(prompt, { requestedDossierCapabilities: ["analytics"] }),
      );

      expect(base.preGenerationContracts.contracts.integrations).toEqual([
        expect.objectContaining({ providerKey, dossierCapability: "analytics" }),
      ]);
      expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).not.toContain(
        "visitor-counter",
      );
    },
  );

  it("keeps explicit Vercel Blob on the media-storage dossier without generic duplication", async () => {
    const base = await resolveOrchestrationBase(
      input("Use Vercel Blob for the owner's media library", {
        requestedDossierCapabilities: ["media-storage"],
      }),
    );

    expect(base.preGenerationContracts.contracts.integrations).toEqual([
      expect.objectContaining({
        providerKey: "vercel-blob",
        dossierCapability: "media-storage",
      }),
    ]);
    expect(base.dossierSelection?.selected.map((selected) => selected.entry.id)).toEqual([
      "vercel-blob-media",
    ]);
  });
});

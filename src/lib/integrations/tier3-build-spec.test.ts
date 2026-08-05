import { describe, expect, it } from "vitest";
import {
  approvedProvidersShipConfigNotice,
  deriveTier3BuildSpec,
  deriveTier3BuildSpecForProviderKeys,
  hasRequiredRealBuildKeys,
  mapProviderKeysToDossierCapabilities,
  providerKeysWithoutBackingDossier,
  renderTier3BuildPlanBlock,
  validateTier3Readiness,
} from "./tier3-build-spec";
import { resolveIntegrationIdentityKey } from "./suggestion-display";
import { integrationRegistryByKey } from "./registry";
import type { PlanContracts } from "@/lib/gen/plan/schema";

const emptyContracts: PlanContracts = {
  dataMode: "none",
  integrations: [],
  envVars: [],
};

it("projects unique Sentry and Resend registry contracts from manifests", () => {
  const resend = integrationRegistryByKey.get("resend");
  expect(resend?.envVars).toEqual(["RESEND_API_KEY", "EMAIL_FROM", "CONTACT_EMAIL_TO"]);
  expect(resend?.setupGuide).toContain("https://resend.com/docs/dashboard/api-keys/introduction");

  const sentry = integrationRegistryByKey.get("sentry");
  expect(sentry?.envVars).toEqual([
    "NEXT_PUBLIC_SENTRY_DSN",
    "SENTRY_ENVIRONMENT",
    "SENTRY_TRACES_SAMPLE_RATE",
  ]);
  expect(sentry?.envVars).not.toContain("SENTRY_DSN");
  expect(sentry?.setupGuide).toContain(
    "https://docs.sentry.io/product/sentry-basics/concepts/dsn-explainer/",
  );
});

it("derives build requirements directly from explicit provider approvals", () => {
  const spec = deriveTier3BuildSpecForProviderKeys(["stripe"]);
  expect(spec.requirements.map((requirement) => requirement.key)).toContain("stripe");
});

it("accepts legacy exact dossier ids in the approved-provider list", () => {
  const spec = deriveTier3BuildSpecForProviderKeys(["stripe-checkout"]);
  expect(spec.requirements).toHaveLength(1);
  expect(spec.requirements[0]).toMatchObject({
    key: "stripe-checkout",
    provider: "stripe",
    featureRuntimeEnvKeys: ["STRIPE_SECRET_KEY"],
  });
  expect(spec.requirements[0].buildInstructions.join("\n")).toContain(
    "components/api/checkout-session/route.ts",
  );
});

it("deduplicates mixed provider and legacy dossier identities", () => {
  const specs = [];
  for (const approvals of [
    ["stripe", "stripe-checkout"],
    ["stripe-checkout", "stripe"],
  ]) {
    const spec = deriveTier3BuildSpecForProviderKeys(approvals);
    expect(spec.requirements).toHaveLength(1);
    expect(spec.requirements[0]).toMatchObject({
      key: "stripe-checkout",
      provider: "stripe",
      featureRuntimeEnvKeys: ["STRIPE_SECRET_KEY"],
    });
    specs.push(spec);
  }
  expect(specs[0]).toEqual(specs[1]);
});

describe("providerKeysWithoutBackingDossier (coach edge case on #503)", () => {
  it("flags registry providers without a backing dossier (posthog, google-analytics)", () => {
    expect(providerKeysWithoutBackingDossier(["posthog"])).toEqual(["posthog"]);
    expect(providerKeysWithoutBackingDossier(["google-analytics"])).toEqual(["google-analytics"]);
  });

  it("does NOT flag dossier-backed providers (stripe, mongodb)", () => {
    expect(providerKeysWithoutBackingDossier(["stripe"])).toEqual([]);
    expect(providerKeysWithoutBackingDossier(["mongodb"])).toEqual([]);
  });

  it("flags ambiguous providers instead of choosing an implicit dossier", () => {
    expect(providerKeysWithoutBackingDossier(["openai"])).toEqual(["openai"]);
    expect(providerKeysWithoutBackingDossier(["supabase"])).toEqual(["supabase"]);
  });

  it("skips unknown providers and empty input", () => {
    expect(providerKeysWithoutBackingDossier(["not-a-real-provider"])).toEqual([]);
    expect(providerKeysWithoutBackingDossier([])).toEqual([]);
  });
});

describe("config-notice advertisement uses strict backing (Codex P1 on #506)", () => {
  it("does NOT advertise a category sibling's config notice for a dossierless provider (contentful vs sanity-cms)", () => {
    const spec = deriveTier3BuildSpecForProviderKeys(["contentful"]);
    const contentful = spec.requirements.find((r) => r.key === "contentful");
    expect(contentful).toBeDefined();
    // sanity-cms matches contentful only via the category fallback ("cms") —
    // it is never injected for a contentful approval, so its notice file must
    // not be advertised (the model would import a component never emitted).
    expect(contentful?.hasConfigNoticeComponent).toBe(false);
  });

  it("still advertises the notice for a strict-backed provider (stripe → stripe-checkout)", () => {
    const spec = deriveTier3BuildSpecForProviderKeys(["stripe"]);
    const stripe = spec.requirements.find((r) => r.key === "stripe");
    expect(stripe?.hasConfigNoticeComponent).toBe(true);
  });
});

describe("resolveIntegrationIdentityKey generic-provider guard (Codex P1 on #506)", () => {
  it("falls through to the named provider when provider is the generic 'other'", () => {
    expect(resolveIntegrationIdentityKey({ provider: "other", name: "PostHog" })).toBe("posthog");
    expect(resolveIntegrationIdentityKey({ provider: "custom", name: "Google Analytics" })).toBe(
      "googleanalytics",
    );
  });

  it("keeps a real provider identity untouched", () => {
    expect(resolveIntegrationIdentityKey({ provider: "stripe", name: "Stripe Checkout" })).toBe(
      "stripe",
    );
  });

  it("returns null when both provider and name are generic", () => {
    expect(resolveIntegrationIdentityKey({ provider: "other", name: "integration" })).toBeNull();
  });
});

describe("deriveTier3BuildSpec", () => {
  it("returns no requirements when contracts are empty", () => {
    expect(deriveTier3BuildSpec(emptyContracts)).toEqual({ requirements: [] });
  });

  it("uses the exact Stripe dossier contract instead of hand-written provider instructions", () => {
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "stripe",
          name: "Stripe",
          reason: "billing",
          status: "chosen",
          envVars: [
            "STRIPE_SECRET_KEY",
            "STRIPE_WEBHOOK_SECRET",
            "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
          ],
        },
      ],
    });

    expect(spec.requirements).toHaveLength(1);
    const req = spec.requirements[0];
    expect(req.key).toBe("stripe");
    expect(req.requiredRealEnvKeys).toEqual([]);
    expect(req.featureRuntimeEnvKeys).toEqual(["STRIPE_SECRET_KEY"]);
    expect(req.warnOnlyEnvKeys).toEqual(["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]);
    expect(req.placeholderOkEnvKeys).toEqual([]);
    expect(req.buildInstructions.length).toBeGreaterThanOrEqual(4);
    expect(req.buildInstructions.join("\n")).toContain("stripe-checkout");
    expect(req.buildInstructions.join("\n")).toContain("components/api/checkout-session/route.ts");
    expect(req.buildInstructions.join("\n")).not.toContain("STRIPE_WEBHOOK_SECRET");
  });

  it("uses manifest envVars when contract envVars is empty", () => {
    // A unique provider projection makes stripe-checkout the contract owner;
    // contract/registry env lists cannot override its enforcement metadata.
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "stripe",
          name: "Stripe",
          reason: "billing",
          status: "chosen",
          envVars: [],
        },
      ],
    });

    expect(spec.requirements).toHaveLength(1);
    const req = spec.requirements[0];
    expect(req.featureRuntimeEnvKeys).toContain("STRIPE_SECRET_KEY");
    expect(req.warnOnlyEnvKeys).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  });

  it("keeps a manifest-only provider emitted by the agent contract", () => {
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "fal",
          name: "Fal",
          reason: "image generation",
          status: "chosen",
          envVars: [],
        },
      ],
    });

    expect(spec.requirements).toHaveLength(1);
    expect(spec.requirements[0]).toMatchObject({
      key: "fal",
      provider: "fal",
      featureRuntimeEnvKeys: ["FAL_API_KEY"],
    });
    expect(spec.requirements[0].buildInstructions.join("\n")).toContain("fal-image-generation");
  });

  it("keeps dossierless registry integrations non-blocking", () => {
    // Vercel KV has a registry definition but no manifest provider owner.
    // The generic path surfaces its keys without claiming dossier enforcement.
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "vercel-kv",
          name: "Vercel KV",
          reason: "cache",
          status: "chosen",
          envVars: [],
        },
      ],
    });

    expect(spec.requirements).toHaveLength(1);
    const req = spec.requirements[0];
    expect(req.requiredRealEnvKeys).toEqual([]);
    expect(req.warnOnlyEnvKeys).toContain("KV_REST_API_URL");
    expect(req.warnOnlyEnvKeys).toContain("KV_REST_API_TOKEN");
  });

  it("keeps ambiguous Supabase approvals on the generic path", () => {
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "supabase",
          name: "Supabase",
          reason: "db",
          status: "chosen",
          envVars: [],
        },
      ],
    });

    expect(spec.requirements).toHaveLength(1);
    const req = spec.requirements[0];
    expect(req.requiredRealEnvKeys).toEqual([]);
    expect(req.buildInstructions[0]).toContain("No unique dossier contract");
    expect(req.buildInstructions.join("\n")).not.toContain("supabase-auth");
    expect(req.buildInstructions.join("\n")).not.toContain("paddle-billing");
    expect(req.hasConfigNoticeComponent).toBe(false);
  });

  it("skips optional integrations", () => {
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "stripe",
          name: "Stripe",
          reason: "maybe",
          status: "optional",
          envVars: [],
        },
      ],
    });

    expect(spec.requirements).toEqual([]);
  });

  it("dedupes integrations with the same provider id", () => {
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "stripe",
          name: "Stripe (billing)",
          reason: "billing",
          status: "chosen",
        },
        {
          provider: "stripe",
          name: "Stripe (subscriptions)",
          reason: "subs",
          status: "chosen",
        },
      ],
    });

    expect(spec.requirements).toHaveLength(1);
  });

  it("lets unique dossier enforcement override upstream/global classification", () => {
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "stripe",
          name: "Stripe",
          reason: "orphan import",
          status: "chosen",
          envVars: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
          envEnforcement: {
            STRIPE_SECRET_KEY: "warn-only",
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "warn-only",
          },
        },
        {
          provider: "clerk",
          name: "Clerk",
          reason: "orphan import",
          status: "chosen",
          envVars: ["CLERK_SECRET_KEY"],
          envEnforcement: { CLERK_SECRET_KEY: "warn-only" },
        },
      ],
    });

    const stripe = spec.requirements.find((r) => r.key === "stripe");
    const clerk = spec.requirements.find((r) => r.key === "clerk");
    expect(stripe?.featureRuntimeEnvKeys).toContain("STRIPE_SECRET_KEY");
    expect(stripe?.warnOnlyEnvKeys).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(clerk?.requiredRealEnvKeys).toContain("CLERK_SECRET_KEY");
    expect(clerk?.requiredRealEnvKeys).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");

    const readiness = validateTier3Readiness(spec, {});
    expect(readiness.ready).toBe(false);
    expect(hasRequiredRealBuildKeys(spec)).toBe(true);
  });

  it("treats only required real build keys as permission for an F3 LLM round", () => {
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "clerk",
          name: "Clerk",
          reason: "auth",
          status: "chosen",
          envVars: ["CLERK_SECRET_KEY"],
          envEnforcement: { CLERK_SECRET_KEY: "build" },
        },
      ],
    });

    expect(hasRequiredRealBuildKeys(spec)).toBe(true);
    expect(hasRequiredRealBuildKeys({ requirements: [] })).toBe(false);
  });

  it("sorts requirements by key for stable output", () => {
    const spec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        { provider: "stripe", name: "Stripe", reason: "x", status: "chosen" },
        { provider: "supabase", name: "Supabase", reason: "x", status: "chosen" },
        { provider: "clerk", name: "Clerk", reason: "x", status: "chosen" },
      ],
    });

    expect(spec.requirements.map((r) => r.key)).toEqual(["clerk", "stripe", "supabase"]);
  });
});

describe("validateTier3Readiness", () => {
  const clerkSpec = deriveTier3BuildSpec({
    ...emptyContracts,
    integrations: [
      {
        provider: "clerk",
        name: "Clerk",
        reason: "auth",
        status: "chosen",
      },
    ],
  });

  it("reports ready when all required keys have non-empty values", () => {
    const report = validateTier3Readiness(clerkSpec, {
      CLERK_SECRET_KEY: "sk_test_real",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_real",
    });
    expect(report.ready).toBe(true);
    expect(report.missingByIntegration).toEqual([]);
  });

  it("reports missing keys when env vars are absent or empty", () => {
    const report = validateTier3Readiness(clerkSpec, {
      CLERK_SECRET_KEY: "  ",
    });
    expect(report.ready).toBe(false);
    expect(report.missingByIntegration).toEqual([
      {
        key: "clerk",
        name: "Clerk",
        missing: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      },
    ]);
  });

  it("does not block on manifest feature-runtime or warn-only keys", () => {
    const stripeSpec = deriveTier3BuildSpec({
      ...emptyContracts,
      integrations: [
        {
          provider: "stripe",
          name: "Stripe",
          reason: "billing",
          status: "chosen",
        },
      ],
    });
    const report = validateTier3Readiness(stripeSpec, {});
    expect(report.ready).toBe(true);
  });
});

describe("renderTier3BuildPlanBlock", () => {
  it("returns null for empty spec", () => {
    expect(renderTier3BuildPlanBlock({ requirements: [] })).toBeNull();
  });

  it("renders Markdown block with required env keys and steps", () => {
    const block = renderTier3BuildPlanBlock(
      deriveTier3BuildSpec({
        ...emptyContracts,
        integrations: [
          {
            provider: "stripe",
            name: "Stripe",
            reason: "billing",
            status: "chosen",
            envVars: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
          },
        ],
      }),
    );
    expect(block).not.toBeNull();
    expect(block).toContain("## Tier-3 Integration Build Plan");
    expect(block).toContain("### Stripe (`stripe`)");
    expect(block).toContain("STRIPE_SECRET_KEY");
    expect(block).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(block).toContain("Steps:");
  });

  it("instructs the graceful not-configured fallback for integrations whose dossier ships the notice", () => {
    const block = renderTier3BuildPlanBlock(
      deriveTier3BuildSpec({
        ...emptyContracts,
        integrations: [
          {
            provider: "stripe",
            name: "Stripe",
            reason: "billing",
            status: "chosen",
          },
        ],
      }),
    );
    expect(block).not.toBeNull();
    // stripe-checkout ships components/integration-config-notice.tsx →
    // the model must be told to degrade calmly on not-configured responses.
    expect(block).toContain("Graceful fallback (mandatory)");
    expect(block).toContain("payments-not-configured");
    expect(block).toContain("IntegrationConfigNotice");
  });

  it("never tells the model to assume real env values (P2 F3-loop åtgärd 1)", () => {
    // The old copy ("assume real values are present at runtime") was wrong
    // for the approval-without-keys case: feature-runtime keys may stay
    // placeholders until the owner fills them in. The block must demand the
    // #374 graceful not-configured pattern instead.
    const block = renderTier3BuildPlanBlock(
      deriveTier3BuildSpec({
        ...emptyContracts,
        integrations: [
          {
            provider: "stripe",
            name: "Stripe",
            reason: "billing",
            status: "chosen",
          },
        ],
      }),
    );
    expect(block).not.toBeNull();
    expect(block).not.toContain("assume real values are present");
    expect(block).toContain("NEVER assume they hold real values");
    expect(block).toContain("Initialize SDK clients lazily");
    expect(block).toContain("`*-not-configured`");
  });

  it("renders feature-runtime keys with the graceful-fallback requirement", () => {
    const block = renderTier3BuildPlanBlock(
      deriveTier3BuildSpec({
        ...emptyContracts,
        integrations: [
          {
            provider: "stripe",
            name: "Stripe",
            reason: "billing",
            status: "chosen",
            envVars: ["STRIPE_SECRET_KEY"],
            envEnforcement: { STRIPE_SECRET_KEY: "feature-runtime" },
          },
        ],
      }),
    );
    expect(block).not.toBeNull();
    expect(block).toContain(
      "Feature-runtime env (may be missing/placeholder at runtime — graceful fallback required): `STRIPE_SECRET_KEY`",
    );
  });

  it("does NOT emit the config-notice instruction for dossiers that lack the component (Clerk)", () => {
    // clerk-auth is dossier-backed but does not ship integration-config-notice.tsx.
    // Referencing IntegrationConfigNotice here would make the model import
    // `@/components/integration-config-notice` with no file behind it → build break.
    const block = renderTier3BuildPlanBlock(
      deriveTier3BuildSpec({
        ...emptyContracts,
        integrations: [
          {
            provider: "clerk",
            name: "Clerk",
            reason: "auth",
            status: "chosen",
          },
        ],
      }),
    );
    expect(block).not.toBeNull();
    expect(block).toContain("### Clerk (`clerk`)");
    expect(block).not.toContain("IntegrationConfigNotice");
    expect(block).not.toContain("Graceful fallback (mandatory)");
  });
});

// ── P2 F3-loop (åtgärd 2): approved provider → dossier capability ─────────
describe("mapProviderKeysToDossierCapabilities", () => {
  it("maps stripe to the stripe-checkout dossier's capability (payments)", () => {
    expect(mapProviderKeysToDossierCapabilities(["stripe"])).toContain("payments");
  });

  it("maps unique Clerk/Resend providers and leaves OpenAI ambiguous", () => {
    expect(mapProviderKeysToDossierCapabilities(["clerk"])).toContain("auth");
    expect(mapProviderKeysToDossierCapabilities(["openai"])).toEqual([]);
    expect(mapProviderKeysToDossierCapabilities(["resend"])).toContain("contact-form");
  });

  it("compact-matches identity-form keys (suggestIntegration output)", () => {
    // toolSignaledProviders stores compact identity form ("vercelblob"),
    // the registry uses the hyphenated slug ("vercel-blob").
    expect(mapProviderKeysToDossierCapabilities(["VercelAnalytics"])).toEqual(["analytics"]);
  });

  it("returns [] for unknown providers, blanks and empty input", () => {
    expect(mapProviderKeysToDossierCapabilities([])).toEqual([]);
    expect(mapProviderKeysToDossierCapabilities(["totally-unknown-vendor"])).toEqual([]);
    expect(mapProviderKeysToDossierCapabilities(["", "   "])).toEqual([]);
  });

  it("does NOT map generic supabase (data) approval to subscriptions or auth", () => {
    // Two manifests explicitly claim Supabase, so the provider is ambiguous.
    // Neither sibling may be injected without an exact dossier/capability.
    const caps = mapProviderKeysToDossierCapabilities(["supabase"]);
    expect(caps).not.toContain("subscriptions");
    expect(caps).not.toContain("supabase-auth");
    expect(caps).not.toContain("auth");
  });

  it("does not choose any dossier for an ambiguous OpenAI approval", () => {
    expect(mapProviderKeysToDossierCapabilities(["openai"])).toEqual([]);
    const spec = deriveTier3BuildSpecForProviderKeys(["openai"]);
    expect(spec.requirements).toHaveLength(1);
    expect(spec.requirements[0].buildInstructions[0]).toContain("No unique dossier contract");
    expect(spec.requirements[0].buildInstructions.join("\n")).not.toContain("openai-chat");
  });

  it("does NOT map category-only siblings — next-auth must not inject clerk-auth (Codex P1 PR #383)", () => {
    // No manifest claims next-auth. A category-only match would inject
    // clerk-auth's templates and env keys for the wrong provider.
    expect(mapProviderKeysToDossierCapabilities(["next-auth"])).toEqual([]);
  });
});

describe("approvedProvidersShipConfigNotice (Codex P2 PR #383)", () => {
  it("true for providers whose strict-backed dossier ships integration-config-notice", () => {
    expect(approvedProvidersShipConfigNotice(["stripe"])).toBe(true);
    expect(approvedProvidersShipConfigNotice(["resend"])).toBe(true);
    // OpenAI is ambiguous and therefore cannot advertise any sibling's notice.
    expect(approvedProvidersShipConfigNotice(["openai"])).toBe(false);
  });

  it("false for providers whose dossier lacks the component, and for unknowns", () => {
    // clerk-auth ships no *config-notice*.tsx; supabase-auth's
    // `supabase-auth-notice.tsx` deliberately does NOT match the RE (it is
    // not imported via the IntegrationConfigNotice contract).
    expect(approvedProvidersShipConfigNotice(["clerk"])).toBe(false);
    expect(approvedProvidersShipConfigNotice(["totally-unknown-vendor"])).toBe(false);
    expect(approvedProvidersShipConfigNotice([])).toBe(false);
  });
});

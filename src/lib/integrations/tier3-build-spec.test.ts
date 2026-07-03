import { describe, expect, it } from "vitest";
import {
  deriveTier3BuildSpec,
  renderTier3BuildPlanBlock,
  validateTier3Readiness,
} from "./tier3-build-spec";
import type { PlanContracts } from "@/lib/gen/plan/schema";

const emptyContracts: PlanContracts = {
  dataMode: "none",
  integrations: [],
  envVars: [],
};

describe("deriveTier3BuildSpec", () => {
  it("returns no requirements when contracts are empty", () => {
    expect(deriveTier3BuildSpec(emptyContracts)).toEqual({ requirements: [] });
  });

  it("partitions Stripe envVars into harmless (publishable) vs tier-3 (secret/webhook)", () => {
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
    expect(req.requiredRealEnvKeys.sort()).toEqual(
      ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].sort(),
    );
    expect(req.placeholderOkEnvKeys).toEqual(["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]);
    expect(req.buildInstructions.length).toBeGreaterThanOrEqual(4);
    expect(req.buildInstructions.some((s) => s.toLowerCase().includes("stripe"))).toBe(true);
  });

  it("falls back to integrationRegistry envVars when contract envVars is empty", () => {
    // Uses Stripe because it is backed by the stripe-checkout dossier, so
    // required env keys survive the dossier-backing clamp. Supabase (which
    // used to be here) has no dossier yet and would correctly be downgraded
    // to warn-only — see the dedicated clamp test below.
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
    expect(req.requiredRealEnvKeys).toContain("STRIPE_SECRET_KEY");
    expect(req.placeholderOkEnvKeys).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  });

  it("downgrades unbacked integrations (no matching dossier) to warn-only", () => {
    // Supabase is in integrationRegistry but no dossier on disk implements
    // it — F3 would otherwise block on NEXT_PUBLIC_SUPABASE_URL even though
    // nothing in generated code would consume it. Clamp moves the keys
    // from requiredRealEnvKeys → warnOnlyEnvKeys so the UI still surfaces
    // them but F3 validation doesn't refuse to start.
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
    expect(req.warnOnlyEnvKeys).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(req.warnOnlyEnvKeys).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
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

  it("respects upstream warn-only envEnforcement so unbacked integrations don't block F3 (plan-12 #15)", () => {
    // End-to-end check for the chat-b71dafb3 scenario: detect-integrations
    // marks orphan Stripe + Clerk imports as warn-only when no matching
    // dossier was selected (via the new applyEnforcementOverlay default).
    // tier3-build-spec must honour that classification so every required
    // real env key is empty → validateTier3Readiness reports ready.
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
    expect(stripe?.requiredRealEnvKeys).toEqual([]);
    expect(stripe?.warnOnlyEnvKeys).toContain("STRIPE_SECRET_KEY");
    expect(clerk?.requiredRealEnvKeys).toEqual([]);
    expect(clerk?.warnOnlyEnvKeys).toContain("CLERK_SECRET_KEY");

    const readiness = validateTier3Readiness(spec, {});
    expect(readiness.ready).toBe(true);
    expect(readiness.missingByIntegration).toEqual([]);
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
  const stripeSpec = deriveTier3BuildSpec({
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

  it("reports ready when all required keys have non-empty values", () => {
    const report = validateTier3Readiness(stripeSpec, {
      STRIPE_SECRET_KEY: "sk_test_real",
      STRIPE_WEBHOOK_SECRET: "whsec_real",
    });
    expect(report.ready).toBe(true);
    expect(report.missingByIntegration).toEqual([]);
  });

  it("reports missing keys when env vars are absent or empty", () => {
    const report = validateTier3Readiness(stripeSpec, {
      STRIPE_SECRET_KEY: "  ",
    });
    expect(report.ready).toBe(false);
    expect(report.missingByIntegration).toEqual([
      {
        key: "stripe",
        name: "Stripe",
        missing: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      },
    ]);
  });

  it("ignores harmless keys even when missing", () => {
    const report = validateTier3Readiness(stripeSpec, {
      STRIPE_SECRET_KEY: "sk_test_real",
      STRIPE_WEBHOOK_SECRET: "whsec_real",
      // NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY intentionally absent
    });
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

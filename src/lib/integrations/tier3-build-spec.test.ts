import { describe, expect, it } from "vitest";
import {
  approvedProvidersShipConfigNotice,
  deriveTier3BuildSpec,
  mapProviderKeysToDossierCapabilities,
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
    // Pin change (dossier-batch): the fixture used to be "supabase", but the
    // promoted supabase-auth dossier now BACKS the supabase registry entry
    // (id-prefix match) and genuinely consumes its keys — see the companion
    // test below. vercel-kv remains truly unbacked (no dossier id/dependency
    // implements it; category "data" has no dossier capability), so F3 must
    // not block on KV keys nothing in generated code would consume. Clamp
    // moves them from requiredRealEnvKeys → warnOnlyEnvKeys so the UI still
    // surfaces them but F3 validation doesn't refuse to start.
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

  it("no longer clamps supabase — the supabase-auth dossier backs it (dossier-batch)", () => {
    // Before the batch, "supabase" had no backing dossier and was clamped to
    // warn-only. supabase-auth (id-prefix "supabase-") now implements it and
    // consumes NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, so requiring real values at
    // an explicit supabase approval is actionable again.
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
    expect(req.requiredRealEnvKeys).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(req.requiredRealEnvKeys).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
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

  it("maps clerk/openai/resend via the same dossier matching rules as the backing clamp", () => {
    expect(mapProviderKeysToDossierCapabilities(["clerk"])).toContain("auth");
    expect(mapProviderKeysToDossierCapabilities(["openai"])).toContain("ai-chat");
    expect(mapProviderKeysToDossierCapabilities(["resend"])).toContain("contact-form");
  });

  it("compact-matches identity-form keys (suggestIntegration output)", () => {
    // toolSignaledProviders stores compact identity form ("vercelblob"),
    // the registry uses the hyphenated slug ("vercel-blob").
    const caps = mapProviderKeysToDossierCapabilities(["VercelBlob"]);
    expect(Array.isArray(caps)).toBe(true);
  });

  it("returns [] for unknown providers, blanks and empty input", () => {
    expect(mapProviderKeysToDossierCapabilities([])).toEqual([]);
    expect(mapProviderKeysToDossierCapabilities(["totally-unknown-vendor"])).toEqual([]);
    expect(mapProviderKeysToDossierCapabilities(["", "   "])).toEqual([]);
  });

  it("does NOT map supabase approval to subscriptions (paddle infra deps only)", () => {
    const caps = mapProviderKeysToDossierCapabilities(["supabase"]);
    expect(caps).not.toContain("subscriptions");
    expect(caps).toContain("supabase-auth");
  });

  it("does NOT map openai approval to rag-chat (shared @ai-sdk/openai dep only)", () => {
    const caps = mapProviderKeysToDossierCapabilities(["openai"]);
    expect(caps).not.toContain("rag-chat");
    expect(caps).toContain("ai-chat");
  });

  it("does NOT map category-only siblings — next-auth must not inject clerk-auth (Codex P1 PR #383)", () => {
    // next-auth shares the "auth" CATEGORY with clerk, but no dossier
    // id-prefix/dependency implements next-auth. A category-only match would
    // inject clerk-auth's verbatim templates + env keys for the wrong
    // provider. Strict mapping → no capability at all.
    expect(mapProviderKeysToDossierCapabilities(["next-auth"])).toEqual([]);
  });
});

describe("approvedProvidersShipConfigNotice (Codex P2 PR #383)", () => {
  it("true for providers whose strict-backed dossier ships integration-config-notice", () => {
    expect(approvedProvidersShipConfigNotice(["stripe"])).toBe(true);
    expect(approvedProvidersShipConfigNotice(["resend"])).toBe(true);
    // openai strict-backs ai-chat (no config-notice UI). rag-chat is excluded
    // from provider mapping so OpenAI approval must not flip this to true via RAG.
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

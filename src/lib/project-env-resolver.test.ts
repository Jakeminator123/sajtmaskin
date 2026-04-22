import { describe, expect, it, vi } from "vitest";

// `project-env-resolver` transitively imports `getStoredProjectEnvVarMap`
// from `@/lib/project-env-vars`, which in turn pulls in the Postgres client
// at module load. We mock both so the focused enforcement-bucketing tests
// run without a database connection.
vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap: async () => ({}),
}));

import {
  resolveEnvRequirementsFromDetected,
  type ResolvedProjectEnv,
} from "./project-env-resolver";
import type { DetectedIntegration } from "./gen/detect-integrations";

function envFixture(configured: Record<string, string>): ResolvedProjectEnv {
  return {
    source: "app-project",
    projectId: "p-test",
    configuredKeys: new Set(Object.keys(configured)),
    configuredMap: configured,
  };
}

const RESEND_DETECTED: DetectedIntegration = {
  key: "resend",
  name: "Resend",
  provider: "resend",
  intent: "env_vars",
  envVars: ["RESEND_API_KEY", "EMAIL_FROM", "CONTACT_EMAIL_TO"],
  envEnforcement: {
    RESEND_API_KEY: "feature-runtime",
    EMAIL_FROM: "feature-runtime",
    CONTACT_EMAIL_TO: "feature-runtime",
  },
  status: "Kräver konfiguration",
};

const PLAUSIBLE_DETECTED: DetectedIntegration = {
  key: "plausible",
  name: "Plausible",
  provider: "plausible",
  intent: "env_vars",
  envVars: ["NEXT_PUBLIC_PLAUSIBLE_DOMAIN", "NEXT_PUBLIC_PLAUSIBLE_API_HOST"],
  envEnforcement: {
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "warn-only",
    NEXT_PUBLIC_PLAUSIBLE_API_HOST: "warn-only",
  },
  status: "Kräver konfiguration",
};

const STRIPE_DETECTED: DetectedIntegration = {
  key: "stripe",
  name: "Stripe",
  provider: "stripe",
  intent: "env_vars",
  envVars: ["STRIPE_SECRET_KEY"],
  envEnforcement: { STRIPE_SECRET_KEY: "build" },
  status: "Kräver konfiguration",
};

describe("resolveEnvRequirementsFromDetected enforcement buckets (P31 follow-up)", () => {
  it("excludes CONFIGURED feature-runtime keys from featureRuntimeKeys", () => {
    const env = envFixture({
      RESEND_API_KEY: "re_real_value",
      EMAIL_FROM: "site@example.com",
      // CONTACT_EMAIL_TO intentionally NOT configured
    });
    const result = resolveEnvRequirementsFromDetected([RESEND_DETECTED], env);
    expect(result.featureRuntimeKeys).not.toContain("RESEND_API_KEY");
    expect(result.featureRuntimeKeys).not.toContain("EMAIL_FROM");
    expect(result.featureRuntimeKeys).toContain("CONTACT_EMAIL_TO");
  });

  it("excludes CONFIGURED warn-only keys from warnOnlyKeys", () => {
    const env = envFixture({ NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bonan-och-boken.se" });
    const result = resolveEnvRequirementsFromDetected([PLAUSIBLE_DETECTED], env);
    expect(result.warnOnlyKeys).not.toContain("NEXT_PUBLIC_PLAUSIBLE_DOMAIN");
    // The optional API_HOST is unconfigured → still appears.
    expect(result.warnOnlyKeys).toContain("NEXT_PUBLIC_PLAUSIBLE_API_HOST");
  });

  it("when nothing is configured, all keys appear in their bucket", () => {
    const env = envFixture({});
    const result = resolveEnvRequirementsFromDetected([RESEND_DETECTED], env);
    expect(result.featureRuntimeKeys).toEqual(
      expect.arrayContaining(["RESEND_API_KEY", "EMAIL_FROM", "CONTACT_EMAIL_TO"]),
    );
    expect(result.buildBlockingKeys).toEqual([]);
  });

  it("buildBlockingKeys is the only blocker for an unconfigured build-enforcement key", () => {
    const env = envFixture({});
    const result = resolveEnvRequirementsFromDetected([STRIPE_DETECTED], env);
    expect(result.buildBlockingKeys).toContain("STRIPE_SECRET_KEY");
    expect(result.featureRuntimeKeys).not.toContain("STRIPE_SECRET_KEY");
    expect(result.warnOnlyKeys).not.toContain("STRIPE_SECRET_KEY");
  });

  it("CONFIGURED build keys do NOT appear in buildBlockingKeys", () => {
    const env = envFixture({ STRIPE_SECRET_KEY: "sk_live_real" });
    const result = resolveEnvRequirementsFromDetected([STRIPE_DETECTED], env);
    expect(result.buildBlockingKeys).not.toContain("STRIPE_SECRET_KEY");
  });

  it("allowPlaceholdersInF3 lifts a placeholder-covered build key out of buildBlockingKeys", () => {
    // STRIPE_SECRET_KEY exists in the tier-3 placeholder set, so the toggle
    // should let the build pass even when unconfigured.
    const env = envFixture({});
    const result = resolveEnvRequirementsFromDetected([STRIPE_DETECTED], env, {
      allowPlaceholdersInF3: true,
    });
    expect(result.buildBlockingKeys).not.toContain("STRIPE_SECRET_KEY");
    expect(result.placeholderCoveredKeys).toContain("STRIPE_SECRET_KEY");
  });

  it("missingEnvKeys (legacy field) preserves old semantics: unconfigured + no placeholder", () => {
    const env = envFixture({});
    const result = resolveEnvRequirementsFromDetected([RESEND_DETECTED], env);
    // RESEND_API_KEY is in placeholder set → not in missingEnvKeys.
    expect(result.missingEnvKeys).not.toContain("RESEND_API_KEY");
  });
});

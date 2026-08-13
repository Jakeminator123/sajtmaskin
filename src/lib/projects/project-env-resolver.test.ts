import { describe, expect, it, vi } from "vitest";

// `project-env-resolver` transitively imports `getStoredProjectEnvVarMap`
// from `@/lib/projects/project-env-vars`, which in turn pulls in the Postgres client
// at module load. We mock both so the focused enforcement-bucketing tests
// run without a database connection.
vi.mock("@/lib/projects/project-env-vars", () => ({
  getStoredProjectEnvVarMap: async () => ({}),
}));

import {
  resolveEnvRequirementsFromDetected,
  type ResolvedProjectEnv,
} from "./project-env-resolver";
import type { DetectedIntegration } from "@/lib/gen/detect-integrations";

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
      lifecycleStage: "integrations",
    });
    expect(result.buildBlockingKeys).not.toContain("STRIPE_SECRET_KEY");
    expect(result.placeholderCoveredKeys).toContain("STRIPE_SECRET_KEY");
  });

  it("does not treat tier-3 stubs as placeholder-covered during F3 unless explicitly allowed", () => {
    const env = envFixture({});
    const result = resolveEnvRequirementsFromDetected([STRIPE_DETECTED], env, {
      lifecycleStage: "integrations",
    });
    expect(result.buildBlockingKeys).toContain("STRIPE_SECRET_KEY");
    expect(result.placeholderCoveredKeys).not.toContain("STRIPE_SECRET_KEY");
    expect(result.missingEnvKeys).toContain("STRIPE_SECRET_KEY");
  });

  it("missingEnvKeys (legacy field) preserves old semantics: unconfigured + no placeholder", () => {
    const env = envFixture({});
    const result = resolveEnvRequirementsFromDetected([RESEND_DETECTED], env);
    // RESEND_API_KEY is in placeholder set → not in missingEnvKeys.
    expect(result.missingEnvKeys).not.toContain("RESEND_API_KEY");
  });
});

// M#li2 (prod 2026-08-01, chat 7a4d609f): the F2 deploy backstop used the whole
// `missingEnvKeys`, so truly-absent feature-runtime keys (Resend
// EMAIL_FROM/CONTACT_EMAIL_TO) 409'd a demo publish that readiness reported as
// deployable. `designDeployBlockingKeys` is the shared corrected set both the
// deploy route (F2 branch) and the readiness route block on.
describe("designDeployBlockingKeys — F2 deploy backstop (M#li2)", () => {
  it("excludes truly-absent feature-runtime keys (Resend EMAIL_FROM/CONTACT_EMAIL_TO)", () => {
    const env = envFixture({});
    const result = resolveEnvRequirementsFromDetected([RESEND_DETECTED], env);
    // Both keys are truly absent (unconfigured, no placeholder) …
    expect(result.missingEnvKeys).toEqual(
      expect.arrayContaining(["EMAIL_FROM", "CONTACT_EMAIL_TO"]),
    );
    // … but must NOT hard-block an F2 deploy.
    expect(result.designDeployBlockingKeys).toEqual([]);
  });

  it("excludes warn-only keys", () => {
    const env = envFixture({});
    const result = resolveEnvRequirementsFromDetected([PLAUSIBLE_DETECTED], env);
    expect(result.designDeployBlockingKeys).toEqual([]);
  });

  it("keeps a truly-absent build-enforcement key hard-blocking", () => {
    const env = envFixture({});
    const customEnv: DetectedIntegration = {
      key: "custom-env",
      name: "Miljövariabler",
      provider: "custom",
      intent: "env_vars",
      envVars: ["MY_SECRET_TOKEN"],
      envEnforcement: { MY_SECRET_TOKEN: "build" },
      status: "Kräver konfiguration",
    };
    const result = resolveEnvRequirementsFromDetected([customEnv], env);
    expect(result.designDeployBlockingKeys).toEqual(["MY_SECRET_TOKEN"]);
  });

  it("excludes tier-3-placeholder-covered build keys in design (bugbot high #461 stays fixed)", () => {
    const env = envFixture({});
    const result = resolveEnvRequirementsFromDetected([STRIPE_DETECTED], env);
    // In design the tier-3 stub covers STRIPE_SECRET_KEY, so it sits in
    // `buildBlockingKeys` (allowPlaceholdersInF3=false) but not in
    // `missingEnvKeys` — the F2 backstop must not block on it.
    expect(result.buildBlockingKeys).toContain("STRIPE_SECRET_KEY");
    expect(result.designDeployBlockingKeys).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { detectIntegrations, detectIntegrationsFromVersionFiles } from "./detect-integrations";
import type { SelectedDossier } from "./dossiers/types";

const RESEND_DOSSIER: SelectedDossier = {
  reason: "capability-match",
  configured: true,
  entry: {
    class: "hard",
    id: "resend-contact-form",
    label: "Resend Contact Form",
    capability: "contact-form",
    codeFidelity: "rewritable",
    complexity: "medium",
    defaultForCapability: true,
    summary: "test fixture",
    envVars: [
      { key: "RESEND_API_KEY", required: true, purpose: "...", enforcement: "feature-runtime" },
      { key: "EMAIL_FROM", required: true, purpose: "...", enforcement: "feature-runtime" },
      { key: "CONTACT_EMAIL_TO", required: true, purpose: "...", enforcement: "feature-runtime" },
    ],
    lastVerified: "2026-04-21",
  },
};

const STRIPE_DOSSIER: SelectedDossier = {
  reason: "capability-match",
  configured: true,
  entry: {
    class: "hard",
    id: "stripe-checkout",
    label: "Stripe Checkout",
    capability: "payments",
    codeFidelity: "verbatim",
    complexity: "medium",
    defaultForCapability: true,
    summary: "test fixture",
    envVars: [
      { key: "STRIPE_SECRET_KEY", required: true, purpose: "...", enforcement: "build" },
      {
        key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        required: true,
        purpose: "...",
        enforcement: "warn-only",
      },
    ],
    lastVerified: "2026-04-21",
  },
};

const RESEND_CODE = `
import { Resend } from "resend";
const client = new Resend(process.env.RESEND_API_KEY!);
`;

const STRIPE_CODE = `
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
`;

const NO_INTEGRATION_CODE = `
export default function Page() { return <div>Hello</div>; }
`;

describe("detectIntegrations + selectedDossiers enforcement overlay", () => {
  it("does not populate envEnforcement when no dossiers are passed", () => {
    const detected = detectIntegrations(RESEND_CODE);
    expect(detected.length).toBeGreaterThanOrEqual(1);
    const resend = detected.find((d) => d.provider === "resend");
    expect(resend?.envEnforcement).toBeUndefined();
  });

  it("inherits feature-runtime enforcement from the matching dossier (resend)", () => {
    const detected = detectIntegrations(RESEND_CODE, {
      selectedDossiers: [RESEND_DOSSIER],
    });
    const resend = detected.find((d) => d.provider === "resend");
    expect(resend).toBeDefined();
    expect(resend?.envEnforcement?.RESEND_API_KEY).toBe("feature-runtime");
    expect(resend?.envEnforcement?.EMAIL_FROM).toBe("feature-runtime");
    expect(resend?.envEnforcement?.CONTACT_EMAIL_TO).toBe("feature-runtime");
  });

  it("preserves build enforcement for keys not covered by dossier metadata", () => {
    // Stripe code triggers stripe registry; only some keys are tagged in dossier
    const detected = detectIntegrations(STRIPE_CODE, {
      selectedDossiers: [STRIPE_DOSSIER],
    });
    const stripe = detected.find((d) => d.provider === "stripe");
    expect(stripe).toBeDefined();
    expect(stripe?.envEnforcement?.STRIPE_SECRET_KEY).toBe("build");
    expect(stripe?.envEnforcement?.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).toBe("warn-only");
  });

  it("defaults to build enforcement for integrations without a matching dossier", () => {
    const detected = detectIntegrations(STRIPE_CODE, {
      selectedDossiers: [RESEND_DOSSIER], // mismatched dossier
    });
    const stripe = detected.find((d) => d.provider === "stripe");
    expect(stripe).toBeDefined();
    for (const key of stripe?.envVars ?? []) {
      expect(stripe?.envEnforcement?.[key]).toBe("build");
    }
  });

  it("custom-env spillover always defaults to build enforcement", () => {
    const code = `const v = process.env.MY_RANDOM_KEY;`;
    const detected = detectIntegrations(code, {
      selectedDossiers: [RESEND_DOSSIER],
    });
    const customEnv = detected.find((d) => d.key === "custom-env");
    expect(customEnv).toBeDefined();
    expect(customEnv?.envEnforcement?.MY_RANDOM_KEY).toBe("build");
  });

  it("returns empty array on code with no detectable integrations", () => {
    const detected = detectIntegrations(NO_INTEGRATION_CODE, {
      selectedDossiers: [RESEND_DOSSIER],
    });
    expect(detected).toHaveLength(0);
  });
});

describe("detectIntegrations + best-matching-cluster on shared env keys", () => {
  // Two dossiers that both claim DATABASE_URL (Supabase + Prisma scenario).
  const SUPABASE_DOSSIER: SelectedDossier = {
    reason: "capability-match",
    configured: true,
    entry: {
      class: "hard",
      id: "supabase",
      label: "Supabase",
      capability: "database",
      codeFidelity: "verbatim",
      complexity: "medium",
      defaultForCapability: true,
      summary: "test fixture",
      envVars: [
        { key: "NEXT_PUBLIC_SUPABASE_URL", required: true, purpose: "...", enforcement: "build" },
        { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, purpose: "...", enforcement: "build" },
        { key: "DATABASE_URL", required: false, purpose: "...", enforcement: "build" },
      ],
      lastVerified: "2026-04-21",
    },
  };
  const PRISMA_DOSSIER: SelectedDossier = {
    reason: "capability-match",
    configured: true,
    entry: {
      class: "soft",
      id: "prisma-orm",
      label: "Prisma ORM",
      capability: "orm",
      codeFidelity: "rewritable",
      complexity: "simple",
      defaultForCapability: false,
      summary: "test fixture",
      envVars: [
        { key: "DATABASE_URL", required: true, purpose: "...", enforcement: "feature-runtime" },
      ],
      lastVerified: "2026-04-21",
    },
  };

  it("matches the cluster with MORE env-overlap when two dossiers share a key", () => {
    // Both dossiers have DATABASE_URL — but Supabase has 3 keys overlapping
    // the Supabase registry detection (URL + anon + DATABASE), while Prisma
    // has only 1 (DATABASE_URL). Best-overlap should pick Supabase even
    // when Prisma is listed first in selectedDossiers.
    const code = `
      import { createClient } from "@supabase/supabase-js";
      const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    `;
    const detected = detectIntegrations(code, {
      selectedDossiers: [PRISMA_DOSSIER, SUPABASE_DOSSIER],
    });
    const supabase = detected.find((d) => d.provider === "supabase");
    expect(supabase).toBeDefined();
    // Supabase cluster wins → DATABASE_URL inherits its `build` enforcement,
    // not Prisma's `feature-runtime`. (Pre-fix, first-match would pick Prisma.)
    expect(supabase?.envEnforcement?.NEXT_PUBLIC_SUPABASE_URL).toBe("build");
    expect(supabase?.envEnforcement?.DATABASE_URL).toBe("build");
  });

});

describe("detectIntegrationsFromVersionFiles + selectedDossiers", () => {
  it("applies overlay even when manifest is present", () => {
    const manifestContent = JSON.stringify({
      schemaVersion: 1,
      integrations: [{ key: "resend", required: true, envVars: ["RESEND_API_KEY", "EMAIL_FROM", "CONTACT_EMAIL_TO"] }],
    });
    const detected = detectIntegrationsFromVersionFiles(
      [
        { name: "sajtmaskin.integration-manifest.json", content: manifestContent },
        { name: "components/contact.tsx", content: RESEND_CODE },
      ],
      { selectedDossiers: [RESEND_DOSSIER] },
    );
    const resend = detected.find((d) => d.key === "resend");
    expect(resend?.envEnforcement?.RESEND_API_KEY).toBe("feature-runtime");
  });
});

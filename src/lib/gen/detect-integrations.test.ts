import { describe, expect, it } from "vitest";
import {
  detectIntegrations,
  detectIntegrationsFromVersionFiles,
  isEmailRecipientEnvKey,
} from "./detect-integrations";
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

  it("downgrades to warn-only for integrations without a matching dossier when selectedDossiers were resolved (plan-12 #15)", () => {
    // Pre-plan-12: an orphan Stripe import in code (or a phantom @clerk/nextjs
    // entry the LLM left in package.json) would default every detected env
    // key to "build" even when the user's snapshot has no payments / auth
    // capability. That blocked F2 readiness + F3 finalize-design with
    // false-positive STRIPE_SECRET_KEY / CLERK_SECRET_KEY prompts. New
    // behaviour: when the caller passed a snapshot-resolved dossier set
    // and no dossier matches the integration, downgrade to "warn-only" so
    // the keys are still surfaced (informational) but never block the build.
    const detected = detectIntegrations(STRIPE_CODE, {
      selectedDossiers: [RESEND_DOSSIER], // mismatched dossier
    });
    const stripe = detected.find((d) => d.provider === "stripe");
    expect(stripe).toBeDefined();
    for (const key of stripe?.envVars ?? []) {
      expect(stripe?.envEnforcement?.[key]).toBe("warn-only");
    }
  });

  it("downgrades to warn-only when snapshot resolves to empty selectedDossiers (slug-only chat)", () => {
    // The bug scenario from chat b71dafb3 (2026-04-24): user asks for a
    // slug page, requestedCapabilities is empty, snapshot resolves to
    // selectedDossiers: []. We still want detected integrations (e.g. an
    // orphan Stripe import) to surface as warn-only, not as build blockers.
    const detected = detectIntegrations(STRIPE_CODE, { selectedDossiers: [] });
    const stripe = detected.find((d) => d.provider === "stripe");
    expect(stripe).toBeDefined();
    for (const key of stripe?.envVars ?? []) {
      expect(stripe?.envEnforcement?.[key]).toBe("warn-only");
    }
  });

  it("legacy callers (no selectedDossiers option) keep build defaults for back-compat", () => {
    // When the caller did not resolve a snapshot at all, we cannot tell
    // whether the integration is wanted or not — fall back to the
    // pre-plan-12 conservative "build" default. This branch keeps the
    // detect-integrations contract stable for tests/consumers that have
    // not migrated to the snapshot resolver.
    const detected = detectIntegrations(STRIPE_CODE);
    const stripe = detected.find((d) => d.provider === "stripe");
    expect(stripe).toBeDefined();
    expect(stripe?.envEnforcement).toBeUndefined();
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

describe("isEmailRecipientEnvKey", () => {
  it("matches recipient/sender-shaped email keys", () => {
    for (const key of [
      "BOOKING_TO_EMAIL",
      "BOOKING_FROM_EMAIL",
      "CONTACT_EMAIL_TO",
      "EMAIL_FROM",
      "EMAIL_TO",
      "SUPPORT_EMAIL",
      "ADMIN_EMAIL",
      "NOTIFY_EMAIL",
      "ORDER_EMAIL_TO",
      "REPLY_TO_EMAIL",
    ]) {
      expect(isEmailRecipientEnvKey(key), key).toBe(true);
    }
  });

  it("does not match vendor API keys or non-role email keys", () => {
    for (const key of [
      "MAILCHIMP_API_KEY", // no exact MAIL/EMAIL token
      "NEXT_PUBLIC_EMAILJS_KEY", // EMAILJS !== EMAIL, no role token
      "SENDGRID_API_KEY",
      "RESEND_API_KEY",
      "STRIPE_SECRET_KEY",
      "DATABASE_URL",
      "EMAIL_SERVICE_ID", // has EMAIL token but no routing/role token
    ]) {
      expect(isEmailRecipientEnvKey(key), key).toBe(false);
    }
  });
});

describe("detectIntegrations custom email-recipient env keys", () => {
  const BOOKING_CODE = `
    export async function sendBooking() {
      const to = process.env.BOOKING_TO_EMAIL;
      const from = process.env.BOOKING_FROM_EMAIL;
      const misc = process.env.MY_RANDOM_KEY;
      return { to, from, misc };
    }
  `;

  it("groups email-recipient keys under a dedicated custom-email group, not Miljövariabler", () => {
    const detected = detectIntegrations(BOOKING_CODE);
    const email = detected.find((d) => d.key === "custom-email");
    const custom = detected.find((d) => d.key === "custom-env");
    expect(email).toBeDefined();
    expect(email?.provider).toBe("email");
    expect(email?.envVars).toEqual(
      expect.arrayContaining(["BOOKING_TO_EMAIL", "BOOKING_FROM_EMAIL"]),
    );
    // Non-email custom keys stay in the generic bucket.
    expect(custom?.envVars).toContain("MY_RANDOM_KEY");
    expect(custom?.envVars).not.toContain("BOOKING_TO_EMAIL");
  });

  it("classifies custom-email keys as feature-runtime (never build-blocking) with selectedDossiers", () => {
    const detected = detectIntegrations(BOOKING_CODE, { selectedDossiers: [] });
    const email = detected.find((d) => d.key === "custom-email");
    expect(email?.envEnforcement?.BOOKING_TO_EMAIL).toBe("feature-runtime");
    expect(email?.envEnforcement?.BOOKING_FROM_EMAIL).toBe("feature-runtime");
    // Generic custom-env spillover still defaults to build.
    const custom = detected.find((d) => d.key === "custom-env");
    expect(custom?.envEnforcement?.MY_RANDOM_KEY).toBe("build");
  });

  it("stays feature-runtime even when a mismatched dossier is selected", () => {
    const detected = detectIntegrations(BOOKING_CODE, {
      selectedDossiers: [STRIPE_DOSSIER],
    });
    const email = detected.find((d) => d.key === "custom-email");
    expect(email?.envEnforcement?.BOOKING_TO_EMAIL).toBe("feature-runtime");
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

// ── P2 F3-loop (åtgärd 2): stub placeholders are NOT integration evidence ──
// Prod chat fa6515bc: a landing page with zero payment code "detected"
// Stripe purely from tier-3 boot stubs in .env.local/env.example, which fed
// the F3 build plan and drove unsolicited Stripe proposals.
describe("detectIntegrationsFromVersionFiles + env stub filter", () => {
  const STUB_ENV_LOCAL = [
    "# TIER-3 STUB (preview boot only)",
    "STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real",
    "STRIPE_WEBHOOK_SECRET=whsec_placeholder_preview",
    "RESEND_API_KEY=re_placeholder_preview_not_a_real_key",
    "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
  ].join("\n");

  const PLAIN_PAGE = `export default function Page() { return <main>Video landing</main>; }`;

  it("does NOT detect integrations from stub-only env artifacts", () => {
    const detected = detectIntegrationsFromVersionFiles([
      { name: "app/page.tsx", content: PLAIN_PAGE },
      { name: ".env.local", content: STUB_ENV_LOCAL },
      { name: "env.example", content: "STRIPE_SECRET_KEY=\nSTRIPE_PRICE_ID=" },
    ]);
    expect(detected.find((d) => d.provider === "stripe")).toBeUndefined();
    expect(detected.find((d) => d.provider === "resend")).toBeUndefined();
  });

  it("still detects from a REAL user-provided env value (genuine intent)", () => {
    const detected = detectIntegrationsFromVersionFiles([
      { name: "app/page.tsx", content: PLAIN_PAGE },
      { name: ".env.local", content: "STRIPE_SECRET_KEY=sk_test_51H8f2jKl9dPqRs7T" },
    ]);
    expect(detected.find((d) => d.provider === "stripe")).toBeDefined();
  });

  it("still detects from real code surfaces regardless of env stubs", () => {
    const detected = detectIntegrationsFromVersionFiles([
      {
        name: "app/api/checkout/route.ts",
        content: `import Stripe from "stripe";\nexport async function POST() { const s = new Stripe(process.env.STRIPE_SECRET_KEY!); }`,
      },
      { name: ".env.local", content: STUB_ENV_LOCAL },
    ]);
    expect(detected.find((d) => d.provider === "stripe")).toBeDefined();
  });

  it("never rewrites code files even if they mention placeholder", () => {
    const detected = detectIntegrationsFromVersionFiles([
      {
        name: "lib/stripe.ts",
        content: `// placeholder note\nimport Stripe from "stripe";`,
      },
    ]);
    expect(detected.find((d) => d.provider === "stripe")).toBeDefined();
  });
});

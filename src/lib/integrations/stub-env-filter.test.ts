import { describe, expect, it } from "vitest";
import {
  STUB_ENV_CONTEXT_NOTE,
  filterStubEnvLines,
  isEnvArtifactPath,
  isLikelyStubEnvValue,
  maskStubEnvContentForContext,
  stripEnvCommentsForScan,
} from "./stub-env-filter";

// "Riktiga" nyckel-fixturer byggs med join så att inga sammanhängande
// secret-mönster finns i källfilen — GitGuardians Stripe/Resend-detektorer
// flaggar annars PR-diffen (falskt positivt på testdata). Värdena är påhittade.
const REAL_LOOKING_STRIPE_TEST_KEY = ["sk", "test", "51H8f2jKl9dPqRs7T"].join("_");
const REAL_LOOKING_STRIPE_LIVE_KEY = ["sk", "live", "abc123def456"].join("_");
const REAL_LOOKING_RESEND_KEY = ["re", "8f3kD92mQx", "7Yp2LqWv4z"].join("_");

describe("isEnvArtifactPath", () => {
  it("matches the env artifact conventions generated projects use", () => {
    expect(isEnvArtifactPath(".env.local")).toBe(true);
    expect(isEnvArtifactPath(".env")).toBe(true);
    expect(isEnvArtifactPath(".env.example")).toBe(true);
    expect(isEnvArtifactPath("env.example")).toBe(true);
    expect(isEnvArtifactPath(".env.production")).toBe(true);
    expect(isEnvArtifactPath("some/dir/.env.local")).toBe(true);
  });

  it("does not match code files or lookalikes", () => {
    expect(isEnvArtifactPath("app/page.tsx")).toBe(false);
    expect(isEnvArtifactPath("lib/env.ts")).toBe(false);
    expect(isEnvArtifactPath("config/environment.json")).toBe(false);
    expect(isEnvArtifactPath("")).toBe(false);
  });
});

describe("isLikelyStubEnvValue", () => {
  it("flags every provider-triggering value from the tier-3 stub layer (41-file)", () => {
    // Representative values from config/ai_models/41-tier3-stub-placeholders.env.txt.
    for (const value of [
      "sk_test_placeholder_preview_not_real",
      "whsec_placeholder_preview",
      "https://placeholder.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.preview_placeholder",
      "sk_test_placeholder_preview",
      "placeholder.apps.googleusercontent.com",
      "sk-placeholder-preview-not-real",
      "vercel_blob_rw_placeholder_preview",
      "https://placeholder.upstash.io",
      "mongodb+srv://preview:preview@placeholder.mongodb.net/preview",
      "skSanityPlaceholderTokenForPreviewOnly",
      "re_placeholder_preview_not_a_real_key",
      "",
    ]) {
      expect(isLikelyStubEnvValue(value), `expected stub: ${value}`).toBe(true);
    }
  });

  it("flags harmless-layer stubs that drive provider regexes (40-file)", () => {
    for (const value of [
      "pk_test_placeholder_000000000000000000000000",
      "preview_auth_secret_min_32_chars_long_dummy_value",
      "http://localhost:3000",
      "https://placeholder.meili.local",
      "preview.local",
    ]) {
      expect(isLikelyStubEnvValue(value), `expected stub: ${value}`).toBe(true);
    }
  });

  it("treats real-looking values as real (user intent must survive)", () => {
    for (const value of [
      REAL_LOOKING_STRIPE_TEST_KEY,
      REAL_LOOKING_STRIPE_LIVE_KEY,
      REAL_LOOKING_RESEND_KEY,
      "https://myproject.supabase.co",
      "G-ABC123XYZ",
    ]) {
      expect(isLikelyStubEnvValue(value), `expected real: ${value}`).toBe(false);
    }
  });
});

describe("filterStubEnvLines", () => {
  const envExample = [
    "# Payments",
    "STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real",
    "STRIPE_WEBHOOK_SECRET=whsec_placeholder_preview",
    "NEXT_PUBLIC_SITE_URL=https://example.com",
    "",
    "RESEND_API_KEY=",
  ].join("\n");

  it("drops stub/empty-value lines and reports the removed keys", () => {
    const { filtered, removedKeys } = filterStubEnvLines(envExample);
    expect(removedKeys).toEqual([
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_API_KEY",
    ]);
    expect(filtered).not.toContain("STRIPE_SECRET_KEY");
    expect(filtered).not.toContain("RESEND_API_KEY");
    // Comments, blanks and real values survive.
    expect(filtered).toContain("# Payments");
    expect(filtered).toContain("NEXT_PUBLIC_SITE_URL=https://example.com");
  });

  it("keeps lines with real user-provided values", () => {
    const { filtered, removedKeys } = filterStubEnvLines(
      `STRIPE_SECRET_KEY=${REAL_LOOKING_STRIPE_TEST_KEY}\n`,
    );
    expect(removedKeys).toEqual([]);
    expect(filtered).toContain(`STRIPE_SECRET_KEY=${REAL_LOOKING_STRIPE_TEST_KEY}`);
  });

  it("handles empty content gracefully", () => {
    expect(filterStubEnvLines("")).toEqual({ filtered: "", removedKeys: [] });
  });
});

describe("stripEnvCommentsForScan", () => {
  it("drops provider-naming comment lines but keeps assignments (Codex P2 PR #383)", () => {
    const content = [
      "# Stripe - secret key + webhook secret",
      "NEXT_PUBLIC_SITE_URL=https://example.com",
      "  # Email - Resend",
      "G_ID=G-ABC123XYZ",
    ].join("\n");
    const stripped = stripEnvCommentsForScan(content);
    expect(stripped).not.toContain("Stripe");
    expect(stripped).not.toContain("Resend");
    expect(stripped).toContain("NEXT_PUBLIC_SITE_URL=https://example.com");
    expect(stripped).toContain("G_ID=G-ABC123XYZ");
  });

  it("handles empty content", () => {
    expect(stripEnvCommentsForScan("")).toBe("");
  });
});

describe("maskStubEnvContentForContext", () => {
  it("prepends the explanatory note only when something was removed", () => {
    const masked = maskStubEnvContentForContext(
      "STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real\nNEXT_PUBLIC_SITE_URL=https://example.com",
    );
    expect(masked.startsWith(STUB_ENV_CONTEXT_NOTE)).toBe(true);
    expect(masked).not.toContain("STRIPE_SECRET_KEY");

    const untouched = "NEXT_PUBLIC_SITE_URL=https://example.com";
    expect(maskStubEnvContentForContext(untouched)).toBe(untouched);
  });
});

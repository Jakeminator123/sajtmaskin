import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerEnv, resetServerEnvCacheForTests, stripeProductionKeyIssues } from "./env";

afterEach(() => {
  resetServerEnvCacheForTests();
  vi.unstubAllEnvs();
});

describe("stripeProductionKeyIssues", () => {
  it("allows test keys outside Vercel production", () => {
    expect(
      stripeProductionKeyIssues({
        VERCEL_ENV: "preview",
        STRIPE_SECRET_KEY: "sk_test_x",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x",
      }),
    ).toEqual([]);
  });

  it("allows unset Stripe keys in production", () => {
    expect(stripeProductionKeyIssues({ VERCEL_ENV: "production" })).toEqual([]);
  });

  it("rejects test prefixes in production at runtime", () => {
    expect(
      stripeProductionKeyIssues({
        VERCEL_ENV: "production",
        STRIPE_SECRET_KEY: "sk_test_x",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x",
      }),
    ).toEqual([
      "STRIPE_SECRET_KEY must start with sk_live_ when VERCEL_ENV=production",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must start with pk_live_ when VERCEL_ENV=production",
    ]);
  });

  it("does not fail Next's production-build phase", () => {
    expect(
      stripeProductionKeyIssues({
        VERCEL_ENV: "production",
        NEXT_PHASE: "phase-production-build",
        STRIPE_SECRET_KEY: "sk_test_x",
      }),
    ).toEqual([]);
  });
});

describe("getServerEnv Stripe production guard", () => {
  it("throws when production is given a test secret", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_should_not_charge");
    expect(() => getServerEnv()).toThrow("Invalid server environment variables");
  });

  it("accepts a live secret in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_ok");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_ok");
    expect(getServerEnv().STRIPE_SECRET_KEY).toBe("sk_live_ok");
  });
});

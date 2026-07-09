/**
 * Per-env-key classification: is a placeholder value harmless to ship even
 * in F3 (full integrations build), or does the project need a real value
 * before deploy/integrations actually function?
 *
 * Classification is per env-KEY (not per integration) because the same key
 * (e.g. `STRIPE_SECRET_KEY`) is dangerous regardless of which integration
 * happens to use it. Keys are partitioned into:
 *
 *  - **Harmless:** test/publishable/secret-min-length keys that are safe
 *    to leave as fake values in any preview lane. Stripe publishable test
 *    keys, NextAuth `AUTH_SECRET` (any 32-char string works), GA/GTM IDs,
 *    public posthog/plausible keys, etc.
 *
 *  - **Tier-3:** keys that *must* be real before F3 ("Bygg integrationer")
 *    can succeed at runtime: Stripe secret, Supabase URL+anon, Clerk
 *    secret, Redis URL, database URLs, Upstash tokens, OpenAI key,
 *    Resend, etc. Used by `tier3-build-spec.ts` and the F3 readiness gate.
 *
 * Source of truth: this file. The placeholder env files
 * (`config/ai_models/40-harmless-placeholders.env.txt` and
 * `41-tier3-stub-placeholders.env.txt`) are organized to match this set
 * and are validated against it by tests.
 */
export const PLACEHOLDER_HARMLESS_ENV_KEYS: ReadonlySet<string> = new Set([
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_GA_ID",
  "NEXT_PUBLIC_GTM_ID",
  "NEXT_PUBLIC_PLAUSIBLE_DOMAIN",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "BASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "AUTH0_SECRET",
  "AUTH0_BASE_URL",
  "HEADLESS_SECRET",
  "INSERT_RANDOM_SECRET_KEY",
  "PAYLOAD_SECRET",
  "CRON_SECRET",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_ALGOLIA_APPLICATION_ID",
  "NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY",
  "NEXT_PUBLIC_MEILISEARCH_HOST",
  "NEXT_PUBLIC_MEILISEARCH_SEARCH_API_KEY",
  "NEXT_PUBLIC_TYPESENSE_HOST",
  "NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY",
  "NEXT_PUBLIC_ELASTICSEARCH_NODE_URL",
  "NEXT_PUBLIC_ELASTICSEARCH_SEARCH_API_KEY",
  "NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN",
  "NEXT_PUBLIC_SANITY_PROJECT_ID",
  "NEXT_PUBLIC_SANITY_DATASET",
]);

export function isPlaceholderHarmless(envKey: string): boolean {
  return PLACEHOLDER_HARMLESS_ENV_KEYS.has(envKey);
}

export function partitionEnvKeysByTier(keys: readonly string[]): {
  harmless: string[];
  tier3: string[];
} {
  const harmless: string[] = [];
  const tier3: string[] = [];
  for (const key of keys) {
    if (isPlaceholderHarmless(key)) {
      harmless.push(key);
    } else {
      tier3.push(key);
    }
  }
  return { harmless, tier3 };
}

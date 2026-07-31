/**
 * Relevance scan for the preview `.env.local` placeholder catalogs.
 *
 * Historically every preview VM booted with the FULL harmless + tier-3 stub
 * catalog (~55 keys) regardless of what the site actually used — a plain
 * landing page shipped Stripe/Supabase/Mongo/Redis stubs it never read.
 * This module answers "which catalog keys are plausibly used by THIS
 * project?" so `resolvePreviewEnvLayers` can drop the rest.
 *
 * A catalog key counts as relevant when either:
 *  1. its name appears anywhere in a project file (covers explicit
 *     `process.env.X` reads and direct references in code/config), or
 *  2. a package whose SDK reads the key INTERNALLY — without the key name
 *     ever appearing in user code — is imported or declared in
 *     `package.json` (see {@link IMPLICIT_ENV_KEY_RULES}).
 *
 * Env artifact files (`.env*`, `env.example`) are excluded from the scan:
 * they are generated FROM the catalogs, so scanning them would match every
 * catalog key and make the filter a no-op.
 *
 * Deliberately fail-open at the call site: callers that cannot supply files
 * skip the scan entirely and keep the full catalogs, and a key missed here
 * degrades to the same behaviour as any key the catalog never covered.
 * User-stored values, model-emitted env and selected-dossier keys are never
 * filtered by this scan (they are separate layers / an explicit union).
 */

import { isEnvArtifactPath } from "@/lib/integrations/stub-env-filter";

export type RelevanceScanFile = { name: string; content: string };

type ImplicitEnvKeyRule = {
  /** Matches an import/require of the package, or its `package.json` entry. */
  pattern: RegExp;
  /** Env keys the package's SDK reads internally. */
  keys: readonly string[];
};

/**
 * Packages whose SDKs read env keys internally, so the key name never has
 * to appear in generated code. Patterns match both import specifiers and
 * `"dep": "version"` lines in `package.json` (belt and braces: a dependency
 * that is declared but only imported dynamically still keeps its boot stub —
 * module-scope clients crashing `next dev` on empty env is the failure mode
 * the tier-3 stubs exist to prevent).
 */
const IMPLICIT_ENV_KEY_RULES: readonly ImplicitEnvKeyRule[] = [
  {
    pattern: /@vercel\/postgres/,
    keys: ["POSTGRES_URL"],
  },
  {
    pattern: /@vercel\/kv/,
    keys: ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  },
  {
    pattern: /@vercel\/blob/,
    keys: ["BLOB_READ_WRITE_TOKEN"],
  },
  {
    pattern: /@clerk\//,
    keys: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
  },
  {
    // next-auth / Auth.js read AUTH_SECRET + NEXTAUTH_URL internally.
    pattern: /(?:["']next-auth|@auth\/)/,
    keys: ["AUTH_SECRET", "NEXTAUTH_URL"],
  },
  {
    pattern: /@auth0\//,
    keys: [
      "AUTH0_SECRET",
      "AUTH0_BASE_URL",
      "AUTH0_ISSUER_BASE_URL",
      "AUTH0_CLIENT_ID",
      "AUTH0_CLIENT_SECRET",
    ],
  },
  {
    pattern: /@upstash\//,
    keys: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  },
  {
    // ioredis / node-redis clients — REDIS_URL by convention at module scope.
    pattern: /["'](?:ioredis|redis)["']/,
    keys: ["REDIS_URL"],
  },
  {
    // Postgres clients + ORMs that conventionally read DATABASE_URL /
    // POSTGRES_URL from a module-scope connection helper.
    pattern: /(?:["'](?:pg|postgres)["']|@prisma\/client|drizzle-orm)/,
    keys: ["DATABASE_URL", "POSTGRES_URL"],
  },
  {
    pattern: /["'](?:mongoose|mongodb)["']/,
    keys: ["MONGODB_URI"],
  },
  {
    pattern: /@sentry\//,
    keys: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
  },
  {
    pattern: /@supabase\//,
    keys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  },
  {
    // `new OpenAI()` reads OPENAI_API_KEY internally and THROWS at
    // construction when it is missing — module-scope clients crash the boot.
    pattern: /["']openai["']/,
    keys: ["OPENAI_API_KEY"],
  },
  {
    // `new Resend()` falls back to RESEND_API_KEY and throws when absent.
    pattern: /["']resend["']/,
    keys: ["RESEND_API_KEY"],
  },
  {
    // stripe-node requires an explicit key argument (usually written as
    // `process.env.STRIPE_SECRET_KEY`, which the name scan catches), but the
    // stubs are kept whenever the SDK is present as a cheap crash guard for
    // indirect key plumbing the scan cannot see.
    pattern: /(?:["']stripe["']|@stripe\/)/,
    keys: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
  },
];

/**
 * Return the subset of `catalogKeys` that is relevant for the given project
 * files (plus any implicit-rule keys, which callers intersect with the
 * catalogs by construction — the result is only used as a keep-set).
 */
export function collectRelevantPreviewEnvKeys(params: {
  files: ReadonlyArray<RelevanceScanFile>;
  catalogKeys: ReadonlyArray<string>;
}): Set<string> {
  const combined = params.files
    .filter(
      (file) =>
        typeof file?.name === "string" &&
        typeof file?.content === "string" &&
        !isEnvArtifactPath(file.name),
    )
    .map((file) => file.content)
    .join("\n");

  const relevant = new Set<string>();
  for (const key of params.catalogKeys) {
    if (key && combined.includes(key)) relevant.add(key);
  }
  for (const rule of IMPLICIT_ENV_KEY_RULES) {
    if (!rule.pattern.test(combined)) continue;
    for (const key of rule.keys) relevant.add(key);
  }
  return relevant;
}

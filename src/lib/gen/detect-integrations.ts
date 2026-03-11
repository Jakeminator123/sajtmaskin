/**
 * Detect integration requirements from generated code.
 *
 * Scans generated source for env var references, known SDK imports,
 * and common integration patterns.  Returns signals that the client
 * renders as integration cards and env-var prompts.
 */

export type DetectedIntegration = {
  key: string;
  name: string;
  provider?: string;
  intent: "env_vars" | "install" | "connect" | "configure";
  envVars: string[];
  status: string;
};

const ENV_VAR_PATTERN = /process\.env\.([A-Z][A-Z0-9_]{2,})/g;

const KNOWN_INTEGRATIONS: Array<{
  pattern: RegExp;
  name: string;
  provider: string;
  envVars: string[];
}> = [
  {
    pattern: /(?:@supabase\/|createClient.*supabase|SUPABASE_)/i,
    name: "Supabase",
    provider: "supabase",
    envVars: ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
  },
  {
    pattern: /(?:stripe|STRIPE_)/i,
    name: "Stripe",
    provider: "stripe",
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"],
  },
  {
    pattern: /(?:@clerk\/|CLERK_)/i,
    name: "Clerk",
    provider: "clerk",
    envVars: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
  },
  {
    pattern: /(?:@auth\/|AUTH_SECRET|NEXTAUTH_)/i,
    name: "NextAuth / Auth.js",
    provider: "next-auth",
    envVars: ["AUTH_SECRET", "NEXTAUTH_URL"],
  },
  {
    pattern: /(?:resend|RESEND_)/i,
    name: "Resend",
    provider: "resend",
    envVars: ["RESEND_API_KEY"],
  },
  {
    pattern: /(?:@upstash\/|UPSTASH_)/i,
    name: "Upstash",
    provider: "upstash",
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  },
  {
    pattern: /(?:@prisma\/|prisma\.)/i,
    name: "Prisma",
    provider: "prisma",
    envVars: ["DATABASE_URL"],
  },
  {
    pattern: /(?:openai|OPENAI_API_KEY)/i,
    name: "OpenAI",
    provider: "openai",
    envVars: ["OPENAI_API_KEY"],
  },
  {
    pattern: /(?:@vercel\/blob|BLOB_)/i,
    name: "Vercel Blob",
    provider: "vercel-blob",
    envVars: ["BLOB_READ_WRITE_TOKEN"],
  },
  {
    pattern: /(?:@vercel\/kv|KV_REST_API_)/i,
    name: "Vercel KV",
    provider: "vercel-kv",
    envVars: ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  },
  {
    pattern: /(?:googleapis|GOOGLE_)/i,
    name: "Google APIs",
    provider: "google",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
];

const WELL_KNOWN_PUBLIC_VARS = new Set([
  "NODE_ENV",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_BASE_URL",
  "VERCEL_URL",
  "VERCEL_ENV",
  "PORT",
]);

export function detectIntegrations(code: string): DetectedIntegration[] {
  const results: DetectedIntegration[] = [];
  const seenKeys = new Set<string>();

  for (const integration of KNOWN_INTEGRATIONS) {
    if (integration.pattern.test(code) && !seenKeys.has(integration.provider)) {
      seenKeys.add(integration.provider);
      results.push({
        key: integration.provider,
        name: integration.name,
        provider: integration.provider,
        intent: "env_vars",
        envVars: integration.envVars,
        status: "Kräver konfiguration",
      });
    }
  }

  const envMatches = new Set<string>();
  let match: RegExpExecArray | null;
  ENV_VAR_PATTERN.lastIndex = 0;
  while ((match = ENV_VAR_PATTERN.exec(code)) !== null) {
    const varName = match[1];
    if (!WELL_KNOWN_PUBLIC_VARS.has(varName)) {
      envMatches.add(varName);
    }
  }

  const coveredVars = new Set(results.flatMap((r) => r.envVars));
  const uncovered = [...envMatches].filter((v) => !coveredVars.has(v));

  if (uncovered.length > 0) {
    results.push({
      key: "custom-env",
      name: "Miljövariabler",
      intent: "env_vars",
      envVars: uncovered,
      status: "Kräver konfiguration",
    });
  }

  return results;
}

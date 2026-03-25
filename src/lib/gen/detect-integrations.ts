/**
 * Detect integration requirements from generated code.
 *
 * Scans generated source for env var references, known SDK imports,
 * and common integration patterns.  Returns signals that the client
 * renders as integration cards and env-var prompts.
 *
 * Display metadata for registry-backed providers comes from
 * `integrationRegistry` (`src/lib/integrations/registry.ts`); this file
 * only supplies detection patterns and inline-only integrations.
 */

import { integrationRegistry } from "@/lib/integrations/registry";

export type DetectedIntegration = {
  key: string;
  name: string;
  provider?: string;
  intent: "env_vars" | "install" | "connect" | "configure";
  envVars: string[];
  status: string;
  setupGuide?: string;
};

const ENV_VAR_PATTERN = /process\.env\.([A-Z][A-Z0-9_]{2,})/g;

const REGISTRY_BY_PROVIDER = new Map(
  integrationRegistry.map((d) => [d.provider ?? d.key, d] as const),
);

type DetectionRule =
  | { source: "registry"; pattern: RegExp; registryProvider: string }
  | {
      source: "inline";
      pattern: RegExp;
      name: string;
      provider: string;
      envVars: string[];
      setupGuide: string;
    };

/**
 * Ordered detection rules: registry-backed rows pull name/envVars/setupGuide
 * from `integrationRegistry`; inline rows keep local metadata (patterns only
 * in this module).
 */
export const DETECTION_PIPELINE: DetectionRule[] = [
  {
    source: "registry",
    pattern: /(?:@supabase\/|createClient.*supabase|SUPABASE_)/i,
    registryProvider: "supabase",
  },
  {
    source: "registry",
    pattern: /(?:stripe|STRIPE_)/i,
    registryProvider: "stripe",
  },
  {
    source: "registry",
    pattern: /(?:@clerk\/|CLERK_)/i,
    registryProvider: "clerk",
  },
  {
    source: "registry",
    pattern: /(?:@auth\/|AUTH_SECRET|NEXTAUTH_)/i,
    registryProvider: "next-auth",
  },
  {
    source: "registry",
    pattern: /(?:resend|RESEND_)/i,
    registryProvider: "resend",
  },
  {
    source: "registry",
    pattern: /(?:@upstash\/|UPSTASH_)/i,
    registryProvider: "upstash",
  },
  {
    source: "inline",
    pattern: /(?:@prisma\/|prisma\.)/i,
    name: "Prisma",
    provider: "prisma",
    envVars: [],
    setupGuide:
      "Prisma är ett ORM-lager i den genererade koden — inte en separat Sajtmaskin-integration. Sätt DATABASE_URL i ditt Vercel-projekt när du kopplar en riktig databas (t.ex. Postgres). För lokal preview räcker ofta SQLite (file:./…) utan att denna panel ska lysa rött.",
  },
  {
    source: "inline",
    pattern: /(?:better-sqlite3|sqlite|drizzle-orm\/sqlite|file:\.\/.*\.db)/i,
    name: "SQLite",
    provider: "other",
    envVars: ["DATABASE_URL"],
    setupGuide:
      "SQLite passar lokalt eller i enklare demos. Använd t.ex. DATABASE_URL=file:./dev.db. För Vercel-deployad datahantering är en hostad databas ofta bättre.",
  },
  {
    source: "registry",
    pattern: /(?:openai|OPENAI_API_KEY)/i,
    registryProvider: "openai",
  },
  {
    source: "registry",
    pattern: /(?:@vercel\/blob|BLOB_)/i,
    registryProvider: "vercel-blob",
  },
  {
    source: "registry",
    pattern: /(?:@vercel\/kv|KV_REST_API_)/i,
    registryProvider: "vercel-kv",
  },
  {
    source: "registry",
    pattern: /(?:googleapis|GOOGLE_)/i,
    registryProvider: "google",
  },
  {
    source: "registry",
    pattern: /(?:gtag\(|google-analytics|GA_MEASUREMENT_ID|NEXT_PUBLIC_GA_ID)/i,
    registryProvider: "google-analytics",
  },
  {
    source: "registry",
    pattern: /(?:googletagmanager|dataLayer|NEXT_PUBLIC_GTM_ID|GTM-[A-Z0-9]+)/i,
    registryProvider: "gtm",
  },
  {
    source: "registry",
    pattern: /(?:@vercel\/analytics|<Analytics\b|from\s+["']@vercel\/analytics)/i,
    registryProvider: "vercel-analytics",
  },
  {
    source: "registry",
    pattern: /(?:plausible|NEXT_PUBLIC_PLAUSIBLE_DOMAIN)/i,
    registryProvider: "plausible",
  },
  {
    source: "registry",
    pattern: /(?:posthog|NEXT_PUBLIC_POSTHOG_KEY|NEXT_PUBLIC_POSTHOG_HOST)/i,
    registryProvider: "posthog",
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
  const seenProviders = new Set<string>();

  for (const rule of DETECTION_PIPELINE) {
    if (!rule.pattern.test(code)) continue;

    if (rule.source === "registry") {
      const def = REGISTRY_BY_PROVIDER.get(rule.registryProvider);
      if (!def) {
        throw new Error(
          `detect-integrations: missing integrationRegistry entry for "${rule.registryProvider}"`,
        );
      }
      const providerId = def.provider ?? def.key;
      if (seenProviders.has(providerId)) continue;
      seenProviders.add(providerId);
      results.push({
        key: def.key,
        name: def.name,
        provider: providerId,
        intent: "env_vars",
        envVars: def.envVars,
        status: "Kräver konfiguration",
        setupGuide: def.setupGuide,
      });
      continue;
    }

    if (seenProviders.has(rule.provider)) continue;
    seenProviders.add(rule.provider);
    results.push({
      key: rule.provider,
      name: rule.name,
      provider: rule.provider,
      intent: "env_vars",
      envVars: rule.envVars,
      status: "Kräver konfiguration",
      setupGuide: rule.setupGuide,
    });
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

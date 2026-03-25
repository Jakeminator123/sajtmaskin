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
    source: "inline",
    pattern: /(?:@clerk\/|CLERK_)/i,
    name: "Clerk",
    provider: "clerk",
    envVars: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    setupGuide:
      "Skapa en applikation på clerk.com. Kopiera Secret key och Publishable key från API Keys.",
  },
  {
    source: "inline",
    pattern: /(?:@auth\/|AUTH_SECRET|NEXTAUTH_)/i,
    name: "NextAuth / Auth.js",
    provider: "next-auth",
    envVars: ["AUTH_SECRET", "NEXTAUTH_URL"],
    setupGuide:
      "Generera AUTH_SECRET med: npx auth secret. Sätt NEXTAUTH_URL till din site-URL (t.ex. http://localhost:3000).",
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
      "SQLite passar lokalt eller i enklare demos. Anvand t.ex. DATABASE_URL=file:./dev.db. For Vercel-deployad datahantering ar en hostad databas ofta battre.",
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
    source: "inline",
    pattern: /(?:@vercel\/kv|KV_REST_API_)/i,
    name: "Vercel KV",
    provider: "vercel-kv",
    envVars: ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    setupGuide:
      "Lägg till KV Store i ditt Vercel-projekt via Storage-fliken. Variabler skapas automatiskt.",
  },
  {
    source: "inline",
    pattern: /(?:googleapis|GOOGLE_)/i,
    name: "Google APIs",
    provider: "google",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    setupGuide:
      "Skapa OAuth-klient i Google Cloud Console > APIs & Services > Credentials.",
  },
  {
    source: "inline",
    pattern: /(?:gtag\(|google-analytics|GA_MEASUREMENT_ID|NEXT_PUBLIC_GA_ID)/i,
    name: "Google Analytics 4",
    provider: "google-analytics",
    envVars: ["NEXT_PUBLIC_GA_ID"],
    setupGuide:
      "Skapa en GA4 property i Google Analytics och sätt measurement ID som NEXT_PUBLIC_GA_ID.",
  },
  {
    source: "inline",
    pattern: /(?:googletagmanager|dataLayer|NEXT_PUBLIC_GTM_ID|GTM-[A-Z0-9]+)/i,
    name: "Google Tag Manager",
    provider: "gtm",
    envVars: ["NEXT_PUBLIC_GTM_ID"],
    setupGuide: "Skapa en GTM-container och sätt container-ID som NEXT_PUBLIC_GTM_ID.",
  },
  {
    source: "inline",
    pattern: /(?:@vercel\/analytics|<Analytics\b|from\s+["']@vercel\/analytics)/i,
    name: "Vercel Analytics",
    provider: "vercel-analytics",
    envVars: [],
    setupGuide:
      "Aktivera Vercel Analytics i projektet och behåll Analytics-komponenten i layouten.",
  },
  {
    source: "inline",
    pattern: /(?:plausible|NEXT_PUBLIC_PLAUSIBLE_DOMAIN)/i,
    name: "Plausible",
    provider: "plausible",
    envVars: ["NEXT_PUBLIC_PLAUSIBLE_DOMAIN"],
    setupGuide:
      "Skapa sajt i Plausible och sätt domänen som NEXT_PUBLIC_PLAUSIBLE_DOMAIN.",
  },
  {
    source: "inline",
    pattern: /(?:posthog|NEXT_PUBLIC_POSTHOG_KEY|NEXT_PUBLIC_POSTHOG_HOST)/i,
    name: "PostHog",
    provider: "posthog",
    envVars: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
    setupGuide:
      "Skapa project i PostHog och sätt API key + host i NEXT_PUBLIC_POSTHOG_KEY och NEXT_PUBLIC_POSTHOG_HOST.",
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

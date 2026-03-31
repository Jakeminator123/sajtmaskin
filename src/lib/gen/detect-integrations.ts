/**
 * Detect integration requirements from generated code.
 *
 * When `sajtmaskin.integration-manifest.json` is present and valid,
 * `detectIntegrationsFromVersionFiles` uses it as the primary catalog and
 * only runs regex heuristics for extra `process.env.*` keys (custom-env bucket).
 *
 * Display metadata for registry-backed providers comes from
 * `integrationRegistry` (`src/lib/integrations/registry.ts`); this file
 * only supplies detection patterns and inline-only integrations.
 */

import { integrationRegistry } from "@/lib/integrations/registry";
import {
  detectedIntegrationsFromManifest,
  isIntegrationManifestPath,
  tryParseIntegrationManifest,
} from "@/lib/integrations/integration-manifest";

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
const DETECTION_PIPELINE: DetectionRule[] = [
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
    pattern:
      /(?:algoliasearch|@algolia\/|instantsearch\.js|react-instantsearch|NEXT_PUBLIC_ALGOLIA_APPLICATION_ID\b|NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY\b)/i,
    registryProvider: "algolia",
  },
  {
    source: "registry",
    pattern:
      /(?:meilisearch|@meilisearch\/|NEXT_PUBLIC_MEILISEARCH_HOST\b|NEXT_PUBLIC_MEILISEARCH_SEARCH_API_KEY\b)/i,
    registryProvider: "meilisearch",
  },
  {
    source: "registry",
    pattern:
      /(?:typesense(?:-instantsearch-adapter|-js)?|from\s+["']typesense["']|@typesense\/|NEXT_PUBLIC_TYPESENSE_HOST\b|NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY\b)/i,
    registryProvider: "typesense",
  },
  {
    source: "registry",
    pattern:
      /(?:@elastic\/elasticsearch|from\s+["']@elastic\/elasticsearch["']|NEXT_PUBLIC_ELASTICSEARCH_NODE_URL\b|NEXT_PUBLIC_ELASTICSEARCH_SEARCH_API_KEY\b|ELASTICSEARCH_NODE_URL\b)/i,
    registryProvider: "elasticsearch",
  },
  {
    source: "registry",
    pattern: /(?:@sentry\/|SENTRY_DSN\b)/i,
    registryProvider: "sentry",
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
  {
    source: "registry",
    pattern:
      /(?:from\s+["']mongoose["']|require\(\s*["']mongoose["']\s*\)|\bmongoose\.connect\b|mongodb\+srv:|MONGODB_URI\b)/i,
    registryProvider: "mongodb",
  },
  {
    source: "registry",
    pattern: /(?:@sanity\/|next-sanity|NEXT_PUBLIC_SANITY_PROJECT_ID\b|NEXT_PUBLIC_SANITY_DATASET\b)/i,
    registryProvider: "sanity",
  },
  {
    source: "registry",
    pattern: /(?:@contentful\/|contentful\.createClient|CONTENTFUL_SPACE_ID\b|CONTENTFUL_ACCESS_TOKEN\b)/i,
    registryProvider: "contentful",
  },
  {
    source: "registry",
    pattern:
      /(?:@storyblok\/(?:react)?|storyblok-js|NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN\b|STORYBLOK_ACCESS_TOKEN\b)/i,
    registryProvider: "storyblok",
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

function runDetectionPipeline(code: string): DetectedIntegration[] {
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

  return results;
}

function appendCustomEnvIntegrations(
  code: string,
  results: DetectedIntegration[],
): DetectedIntegration[] {
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

  if (uncovered.length === 0) {
    return results;
  }

  return [
    ...results,
    {
      key: "custom-env",
      name: "Miljövariabler",
      intent: "env_vars",
      envVars: uncovered,
      status: "Kräver konfiguration",
    },
  ];
}

export function detectIntegrations(code: string): DetectedIntegration[] {
  return appendCustomEnvIntegrations(code, runDetectionPipeline(code));
}

/**
 * Prefer `sajtmaskin.integration-manifest.json` when valid; otherwise full heuristic scan.
 * @param files — use `path` as `name` when wiring from version rows.
 */
export function detectIntegrationsFromVersionFiles(
  files: Array<{ name: string; content: string }>,
): DetectedIntegration[] {
  const manifestEntry = files.find((f) => isIntegrationManifestPath(f.name));
  const manifestParsed = manifestEntry
    ? tryParseIntegrationManifest(manifestEntry.content)
    : null;

  const withoutManifest = manifestEntry
    ? files.filter((f) => f.name !== manifestEntry.name)
    : files;

  const codeForScan = withoutManifest
    .map((f) => `// File: ${f.name}\n${f.content}`)
    .join("\n\n");

  if (manifestParsed) {
    const fromManifest = detectedIntegrationsFromManifest(manifestParsed);
    return appendCustomEnvIntegrations(codeForScan, fromManifest);
  }

  const combined = files.map((f) => `// File: ${f.name}\n${f.content}`).join("\n\n");
  return detectIntegrations(combined);
}

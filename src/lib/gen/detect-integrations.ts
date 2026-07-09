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
  filterStubEnvLines,
  isEnvArtifactPath,
  stripEnvCommentsForScan,
} from "@/lib/integrations/stub-env-filter";
import {
  detectedIntegrationsFromManifest,
  isIntegrationManifestPath,
  tryParseIntegrationManifest,
} from "@/lib/integrations/integration-manifest";
import type { PreviewLifecycleStage } from "@/lib/gen/preview/env-local";
import type {
  DossierEnvVarEnforcement,
  SelectedDossier,
} from "@/lib/gen/dossiers/types";

export type DetectedIntegration = {
  key: string;
  name: string;
  provider?: string;
  intent: "env_vars" | "install" | "connect" | "configure";
  envVars: string[];
  /**
   * Per-key enforcement classification overlaid from selected-dossier
   * metadata. Keys absent from this map default to `"build"` (the
   * conservative pre-Phase-3 behaviour). Always populated when
   * `detectIntegrationsFromVersionFiles` was given a `selectedDossiers`
   * argument; may be empty otherwise.
   */
  envEnforcement?: Record<string, DossierEnvVarEnforcement>;
  status: string;
  setupGuide?: string;
};

export type DetectIntegrationsOptions = {
  /**
   * F2 (`design`) suppresses the regex `process.env.X` custom-env scan
   * so a hotell-landing that happens to import a dossier example doesn't
   * flood the user with 36 fake env-keys. The registry/manifest-based
   * detection still runs (those are explicit), but custom-env spillover
   * is parked silently. F3 (`integrations`) runs the full pipeline.
   */
  lifecycleStage?: PreviewLifecycleStage;
  /**
   * Dossiers selected for the active build. When provided, every detected
   * integration whose `provider`/`key` matches a selected dossier's
   * `capability` or `id` inherits the dossier's per-envVar
   * `enforcement` tag. Integrations without a matching selected dossier
   * default to `"build"` enforcement (safe). Custom-env spillover always
   * defaults to `"build"`.
   */
  selectedDossiers?: SelectedDossier[];
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
      "Prisma är ett ORM-lager i den genererade koden — inte en separat Sajtmaskin-integration. Sätt DATABASE_URL i ditt hosting-projekt när du kopplar en riktig databas (t.ex. Postgres). För lokal preview räcker ofta SQLite (file:./…) utan att denna panel ska lysa rött.",
  },
  {
    source: "inline",
    pattern: /(?:better-sqlite3|sqlite|drizzle-orm\/sqlite|file:\.\/.*\.db)/i,
    name: "SQLite",
    provider: "other",
    envVars: ["DATABASE_URL"],
    setupGuide:
      "SQLite passar lokalt eller i enklare demos. Använd t.ex. DATABASE_URL=file:./dev.db. För en publicerad sajts datahantering är en hostad databas ofta bättre.",
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
  "HOSTNAME",
  "SAJTMASKIN_PREVIEW_BASE_PATH",
  "SAJTMASKIN_APP_PROJECT_ID",
  "NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID",
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

/**
 * Email recipient/sender config keys (e.g. `BOOKING_TO_EMAIL`,
 * `CONTACT_EMAIL_TO`, `EMAIL_FROM`, `SUPPORT_EMAIL`). The model frequently
 * invents project-specific names for a contact/booking-form email instead of
 * the canonical `resend-contact-form` dossier keys (`RESEND_API_KEY` /
 * `EMAIL_FROM` / `CONTACT_EMAIL_TO`). Those invented names miss every registry
 * pattern and used to land in the anonymous `custom-env` ("Miljövariabler")
 * bucket, which defaults to build-BLOCKING enforcement — a false F3 blocker,
 * since a missing recipient only disables the mail feature (the dossier route
 * returns 503) and never crashes the build. We recognise them by shape and
 * classify them as `feature-runtime` under a dedicated email group instead.
 *
 * Shape = the key mentions e-mail (`EMAIL`/`MAIL`) AND a routing/role token
 * (`TO`/`FROM`/`CONTACT`/`BOOKING`/…). Split on non-alphanumerics so tokens are
 * matched exactly — avoids false positives like `MAILCHIMP_API_KEY` (no `MAIL`
 * token) or `NEXT_PUBLIC_EMAILJS_KEY` (no role token).
 */
export function isEmailRecipientEnvKey(key: string): boolean {
  const tokens = key.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (!tokens.some((t) => t === "EMAIL" || t === "EMAILS" || t === "MAIL")) {
    return false;
  }
  const ROLE_TOKENS = new Set([
    "TO",
    "FROM",
    "CONTACT",
    "RECIPIENT",
    "RECIPIENTS",
    "SENDER",
    "NOTIFY",
    "NOTIFICATION",
    "NOTIFICATIONS",
    "REPLY",
    "REPLYTO",
    "BOOKING",
    "INBOX",
    "DEST",
    "DESTINATION",
    "SUPPORT",
    "ADMIN",
    "OWNER",
    "ORDER",
    "ENQUIRY",
    "INQUIRY",
  ]);
  return tokens.some((t) => ROLE_TOKENS.has(t));
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

  const emailKeys = uncovered.filter(isEmailRecipientEnvKey);
  const otherKeys = uncovered.filter((v) => !isEmailRecipientEnvKey(v));

  const extra: DetectedIntegration[] = [];
  if (emailKeys.length > 0) {
    // Grouped + labelled as email config so the env.example doc and the F3 env
    // panel present these under a clear heading instead of "Miljövariabler".
    // Enforcement is classified as `feature-runtime` in `applyEnforcementOverlay`.
    extra.push({
      key: "custom-email",
      name: "E-post (kontakt-/bokningsformulär)",
      provider: "email",
      intent: "env_vars",
      envVars: emailKeys,
      status: "Kräver konfiguration",
    });
  }
  if (otherKeys.length > 0) {
    extra.push({
      key: "custom-env",
      name: "Miljövariabler",
      intent: "env_vars",
      envVars: otherKeys,
      status: "Kräver konfiguration",
    });
  }

  return [...results, ...extra];
}

type DossierEnforcementCluster = {
  enforcementByKey: Map<string, DossierEnvVarEnforcement>;
  /** All env keys this cluster owns — used to merge into matching integrations. */
  allKeys: Set<string>;
};

/**
 * Build per-dossier clusters of env-key enforcement. Each cluster represents
 * one selected dossier's full env surface. We then merge clusters into
 * detected integrations by env-key overlap (any-overlap = same vendor).
 *
 * Indexed per cluster (not flat per env-key) so we can ENRICH a detected
 * integration's `envVars` with sibling keys the dossier knows about but
 * the registry/regex did not surface (e.g. resend dossier ships
 * `EMAIL_FROM`/`CONTACT_EMAIL_TO`, registry only knows `RESEND_API_KEY`).
 */
function buildEnvEnforcementClusters(
  selectedDossiers: SelectedDossier[] | undefined,
): DossierEnforcementCluster[] {
  if (!selectedDossiers || selectedDossiers.length === 0) return [];
  const clusters: DossierEnforcementCluster[] = [];
  for (const selected of selectedDossiers) {
    const envVars = selected.entry.envVars ?? [];
    if (envVars.length === 0) continue;
    const enforcementByKey = new Map<string, DossierEnvVarEnforcement>();
    const allKeys = new Set<string>();
    for (const env of envVars) {
      enforcementByKey.set(env.key, env.enforcement ?? "build");
      allKeys.add(env.key);
    }
    clusters.push({ enforcementByKey, allKeys });
  }
  return clusters;
}

/**
 * Pick the dossier cluster with the MOST env-key overlap with the given
 * integration's envVars. First-match was the original behaviour; that
 * misclassifies when two dossiers share a generic env name (e.g.
 * `DATABASE_URL` belongs to both Supabase and Prisma dossiers, and the
 * registry's Supabase entry would silently inherit Prisma's enforcement
 * map). Best-match by overlap count is deterministic and isolates
 * cross-vendor name collisions to the single shared key.
 *
 * Ties (two clusters with equal overlap) keep the first cluster — that
 * matches the original behaviour and is fine in practice because the
 * caller's selectedDossiers ordering is stable per build.
 */
function findMatchingCluster(
  envVars: string[],
  clusters: DossierEnforcementCluster[],
): DossierEnforcementCluster | undefined {
  let bestCluster: DossierEnforcementCluster | undefined;
  let bestOverlap = 0;
  for (const cluster of clusters) {
    let overlap = 0;
    for (const key of envVars) {
      if (cluster.allKeys.has(key)) overlap += 1;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestCluster = cluster;
    }
  }
  return bestCluster;
}

function applyEnforcementOverlay(
  integrations: DetectedIntegration[],
  clusters: DossierEnforcementCluster[],
  selectedDossiersProvided: boolean,
): DetectedIntegration[] {
  if (!selectedDossiersProvided && integrations.every((i) => !i.envEnforcement)) {
    return integrations;
  }
  return integrations.map((integration) => {
    const cluster = findMatchingCluster(integration.envVars, clusters);

    // Union of registry-detected env keys and dossier-extra env keys (when
    // a dossier matched). Dossier wins on enforcement.
    const seen = new Set(integration.envVars);
    const mergedEnvVars = [...integration.envVars];
    if (cluster) {
      for (const key of cluster.allKeys) {
        if (!seen.has(key)) {
          mergedEnvVars.push(key);
          seen.add(key);
        }
      }
    }

    // Plan-12 fix (#15): when the caller supplied a snapshot-resolved
    // dossier set AND no dossier matches this detected integration, the
    // user did not actually request the integration via a capability.
    // Defaulting unmatched keys to "build" caused F2 readiness + F3
    // finalize-design to falsely block on STRIPE_SECRET_KEY / CLERK_SECRET_KEY
    // for slug-only landing pages (chat b71dafb3, 2026-04-24). Downgrade
    // to "warn-only" so the keys are still surfaced (informational) but
    // never block the build. Custom-env spillover keeps "build" because
    // it represents the user's own process.env.* references that we have
    // no way to classify. Cluster-matched siblings without an explicit
    // enforcement entry still default to "build" — the dossier accepts
    // responsibility for keys it ships.
    // `custom-email` holds email recipient/sender config the model invented
    // (BOOKING_TO_EMAIL, CONTACT_EMAIL_TO, …). A missing value only disables the
    // mail feature (the contact-form route returns 503) — it never crashes the
    // build — so it must never be build-blocking. Mirror the resend-contact-form
    // dossier, which marks its own email keys `feature-runtime`.
    const isCustomEmail = integration.key === "custom-email";
    const integrationHasNoBacking =
      selectedDossiersProvided &&
      !cluster &&
      integration.key !== "custom-env" &&
      !isCustomEmail;
    const unbackedFallback: DossierEnvVarEnforcement = isCustomEmail
      ? "feature-runtime"
      : integrationHasNoBacking
        ? "warn-only"
        : "build";

    const envEnforcement: Record<string, DossierEnvVarEnforcement> = {
      ...(integration.envEnforcement ?? {}),
    };
    for (const envKey of mergedEnvVars) {
      if (envEnforcement[envKey]) continue; // existing override wins
      envEnforcement[envKey] =
        cluster?.enforcementByKey.get(envKey) ?? unbackedFallback;
    }
    return { ...integration, envVars: mergedEnvVars, envEnforcement };
  });
}

export function detectIntegrations(
  code: string,
  options: DetectIntegrationsOptions = {},
): DetectedIntegration[] {
  const base = runDetectionPipeline(code);
  const withCustomEnv =
    options.lifecycleStage === "design" ? base : appendCustomEnvIntegrations(code, base);
  const clusters = buildEnvEnforcementClusters(options.selectedDossiers);
  // Plan-12 fix (#15): treat "snapshot resolved with empty selections"
  // (selectedDossiers: []) the same as "snapshot resolved with N selections"
  // for the purpose of the warn-only downgrade. The previous truthiness
  // check (`length > 0`) collapsed both into the legacy "default to build"
  // branch, leaving slug-only chats with the same false-positive blockers.
  return applyEnforcementOverlay(
    withCustomEnv,
    clusters,
    options.selectedDossiers !== undefined,
  );
}

/**
 * Prefer `sajtmaskin.integration-manifest.json` when valid; otherwise full heuristic scan.
 * @param files — use `path` as `name` when wiring from version rows.
 * @param options — pass `lifecycleStage: "design"` from F2 callers to
 *   suppress regex custom-env spillover (manifest/registry detection
 *   still runs, since those are explicit). Pass `selectedDossiers` to
 *   inherit per-envVar `enforcement` tags from the active dossier set
 *   (Phase 3 of the F3-readiness rework).
 */
export function detectIntegrationsFromVersionFiles(
  files: Array<{ name: string; content: string }>,
  options: DetectIntegrationsOptions = {},
): DetectedIntegration[] {
  // P2 F3-loop (åtgärd 2): tier-3 STUB placeholders in env artifacts
  // (`.env.local` / `env.example` boot stubs like
  // `STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real`) are NOT
  // integration evidence. The provider regexes match on KEY names, so a
  // landing page with zero payment code used to "detect" Stripe purely
  // from F2 boilerplate (prod chat fa6515bc) — which fed the F3 build plan
  // and drove the model to propose integrations the user never asked for.
  // Strip stub/empty-value lines from env files before scanning; lines
  // with real, user-provided values still count (genuine intent), and
  // actual code files are never touched. Comments are stripped too (Codex
  // P2, PR #383): `# Stripe`-style provider comments would otherwise keep
  // matching the detection regexes after the stub assignments are gone.
  const scanFiles = files.map((f) =>
    isEnvArtifactPath(f.name)
      ? {
          name: f.name,
          content: stripEnvCommentsForScan(filterStubEnvLines(f.content).filtered),
        }
      : f,
  );

  const manifestEntry = scanFiles.find((f) => isIntegrationManifestPath(f.name));
  const manifestParsed = manifestEntry
    ? tryParseIntegrationManifest(manifestEntry.content)
    : null;

  const withoutManifest = manifestEntry
    ? scanFiles.filter((f) => f.name !== manifestEntry.name)
    : scanFiles;

  const codeForScan = withoutManifest
    .map((f) => `// File: ${f.name}\n${f.content}`)
    .join("\n\n");

  const clusters = buildEnvEnforcementClusters(options.selectedDossiers);
  // See note in `detectIntegrations` — `!== undefined` distinguishes
  // "snapshot resolved" (even if empty) from "no snapshot info available".
  const selectedDossiersProvided = options.selectedDossiers !== undefined;

  if (manifestParsed) {
    const fromManifest = detectedIntegrationsFromManifest(manifestParsed);
    const merged =
      options.lifecycleStage === "design"
        ? fromManifest
        : appendCustomEnvIntegrations(codeForScan, fromManifest);
    return applyEnforcementOverlay(merged, clusters, selectedDossiersProvided);
  }

  const combined = scanFiles.map((f) => `// File: ${f.name}\n${f.content}`).join("\n\n");
  return detectIntegrations(combined, options);
}

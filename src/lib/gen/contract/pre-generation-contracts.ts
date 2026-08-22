/**
 * Integration env names and codegen contracts for the builder.
 *
 * Central registry for **models, workloads, and preview placeholders** lives under
 * `config/ai_models/` (`manifest.json` + `40-harmless-placeholders.env.txt`
 * + `41-tier3-stub-placeholders.env.txt`). Contract provider metadata now
 * comes from `config/ai_models/manifest.json` so dashboard + runtime can
 * stay in sync.
 */
import { getPreGenerationContractsConfigFromManifest } from "@/lib/ai-models/load-manifest";
import type { BuildIntent } from "@/lib/builder/build-intent";
import {
  hasNegatedAuthIntent,
  hasNegatedBackendIntent,
  hasNegatedIntegrationIntent,
  hasNegatedPaymentIntent,
  isPromptMatchNegated,
  isTermFullyNegated,
  isVisualOnlyFollowUpPrompt,
} from "@/lib/builder/prompt-negation";
import type { InferredCapabilities } from "../capability-inference";
import type {
  PlanContracts,
  PlanEnvVarContract,
  PlanIntegrationContract,
} from "../plan/schema";

type ContractDecisionKind = "database" | "auth" | "payment" | "integration" | "env";

export interface PreGenerationContractContext {
  contracts: PlanContracts;
  unresolvedDecisions: Array<{
    kind: ContractDecisionKind;
    reason: string;
  }>;
  databaseSelection?: {
    provider: string;
    dossierProviderId: string | null;
    replacesPrimary: boolean;
    targetGuardVetoed: boolean;
  };
}

type ProviderRule = {
  kind: "database" | "auth" | "payment" | "integration";
  provider: string;
  name: string;
  dossierProviderId: string | null;
  providerAliases: string[];
  envVars: string[];
  patterns: RegExp[];
  requiresCapabilities: string[];
  requiresDossierCapabilities: string[];
  status?: "chosen" | "optional";
  reason: string;
};

const preGenerationContractsConfig = getPreGenerationContractsConfigFromManifest();

const PROVIDER_RULES: ProviderRule[] = preGenerationContractsConfig.providerRules.map(
  (rule) => ({
    kind: rule.kind,
    provider: rule.provider,
    name: rule.name,
    dossierProviderId: rule.dossierProviderId ?? null,
    providerAliases: rule.providerAliases ?? [],
    envVars: rule.envVars,
    patterns: rule.matchPatterns.map((pattern) => new RegExp(pattern, "i")),
    requiresCapabilities: rule.requiresCapabilities ?? [],
    requiresDossierCapabilities: rule.requiresDossierCapabilities ?? [],
    status: rule.status,
    reason: rule.reason,
  }),
);

const CONTRACT_DEFAULTS = preGenerationContractsConfig.defaults;

function normalizeProviderIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const DATABASE_PROVIDER_IDENTITY_KEYS = new Set(
  PROVIDER_RULES.filter((rule) => rule.kind === "database").flatMap((rule) =>
    [rule.provider, rule.name, rule.dossierProviderId, ...rule.providerAliases]
      .filter((value): value is string => Boolean(value))
      .map(normalizeProviderIdentity),
  ),
);

/** Drop every database-provider identity owned by the manifest. */
export function filterManifestDatabaseProviderIdentities(
  providers: readonly string[],
): string[] {
  return providers.filter(
    (provider) =>
      !DATABASE_PROVIDER_IDENTITY_KEYS.has(normalizeProviderIdentity(provider)),
  );
}

function findProviderRule(
  provider: string,
  kind?: ProviderRule["kind"],
): ProviderRule | undefined {
  return PROVIDER_RULES.find(
    (rule) => rule.provider === provider && (!kind || rule.kind === kind),
  );
}

const DATABASE_SOURCE_BEFORE_RE =
  /(?:\b(?:from|från)|\b(?:import|migrat(?:e|ed|ing)|copy|transfer|importera|migrera|kopiera|överför)\s+(?:from|från)|\b(?:imported|exported|importerad|exporterad))(?:\s+(?:using|med\s+(?:att\s+)?använd\w*))?\s*$/i;
const DATABASE_SOURCE_AFTER_RE =
  /^\s+(?:(?:as|som)\s+(?:the\s+)?(?:source|källa)|data|records?|poster|documents?|dokument|source|källa)\b/i;
const DATABASE_STRONG_TARGET_BEFORE_RE =
  /\b(?:to|into|use|using|till|använd|använda|använder)(?:\s+(?:a|an|the|en|ett|den|det))?\s*$/i;
const DATABASE_WEAK_TARGET_BEFORE_RE =
  /\b(?:in|on|via|with|i|på|med|mot)(?:\s+(?:a|an|the|en|ett|den|det))?\s*$/i;
const DATABASE_TARGET_AFTER_RE =
  /^\s+(?:(?:as|som)\s+(?:the\s+)?(?:target|mål)|(?:as|som)?\s*(?:database|db|databas))\b|^\s+(?:for|för)\s+(?:storage|persistence|lagring|persistens)\b/i;
const DATABASE_KEEP_PROVIDER_BEFORE_RE =
  /\b(?:keep|keeping|retain|retaining|preserve|preserving|behåll|behålla|behåller|bevara|fortsätt(?:a)?\s+(?:med\s+)?(?:att\s+)?använda)\s*$/i;
const DATABASE_KEEP_PROVIDER_SCORE = 240;
const DATABASE_PRIMARY_REPLACEMENT_RE =
  /\b(?:primary|main|primär|huvud)\s+(?:database|db|databas)|\b(?:as|som)\s+(?:the\s+)?(?:database|db|databas)|\b(?:for|för)\s+(?:storage|persistence|lagring|persistens)|\b(?:use|using|använd|använda)[\s\S]{0,40}\b(?:database|db|databas)\b|\b(?:migrate|move|switch|replace|migrera|flytta|byt|ersätt)[\s\S]{0,80}\b(?:to|into|with|till|med|mot)\b/i;

function findPatternRanges(corpus: string, pattern: RegExp): Array<{ start: number; end: number }> {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return Array.from(corpus.matchAll(new RegExp(pattern.source, flags)), (match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

/**
 * Rank an explicit database provider as a target or source without encoding
 * provider names in application code. Provider identities stay in the
 * manifest; these language cues only resolve direction when multiple
 * manifest database rules match the same prompt.
 */
function databaseTargetScore(corpus: string, rule: ProviderRule): number {
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const pattern of rule.patterns) {
    if (isTermFullyNegated(corpus, pattern)) continue;
    for (const range of findPatternRanges(corpus, pattern)) {
      if (isPromptMatchNegated(corpus, range.start)) continue;
      const before = corpus.slice(Math.max(0, range.start - 96), range.start);
      const after = corpus.slice(range.end, range.end + 96);
      if (DATABASE_KEEP_PROVIDER_BEFORE_RE.test(before)) {
        // An explicit keep/behåll provider is the retained primary identity;
        // another provider mentioned as an export/import target is secondary.
        bestScore = Math.max(bestScore, DATABASE_KEEP_PROVIDER_SCORE);
        continue;
      }
      const isSource =
        DATABASE_SOURCE_BEFORE_RE.test(before) || DATABASE_SOURCE_AFTER_RE.test(after);
      if (isSource) {
        bestScore = Math.max(bestScore, -100);
        continue;
      }
      let score = 0;
      if (DATABASE_STRONG_TARGET_BEFORE_RE.test(before)) score += 120;
      else if (DATABASE_WEAK_TARGET_BEFORE_RE.test(before)) score += 80;
      if (DATABASE_TARGET_AFTER_RE.test(after)) score += 50;
      bestScore = Math.max(bestScore, score);
    }
  }
  return bestScore;
}

function selectDatabaseProviderRule(
  corpus: string,
  rules: readonly ProviderRule[],
): { rule: ProviderRule; score: number } | null {
  let selected: ProviderRule | null = null;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (const rule of rules) {
    const score = databaseTargetScore(corpus, rule);
    // Stable manifest order is the deterministic tie-breaker.
    if (!selected || score > selectedScore) {
      selected = rule;
      selectedScore = score;
    }
  }
  return selected ? { rule: selected, score: selectedScore } : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => asString(entry)).filter(Boolean)
    : [];
}

function getPromptCorpus(prompt: string, brief?: Record<string, unknown> | null): string {
  const pages = Array.isArray(brief?.pages)
    ? brief.pages
        .map((page) => {
          if (!page || typeof page !== "object") return "";
          const entry = page as Record<string, unknown>;
          return [
            asString(entry.name),
            asString(entry.path),
            asString(entry.purpose),
          ].filter(Boolean).join(" ");
        })
        .filter(Boolean)
    : [];
  return [
    prompt,
    asString(brief?.projectTitle),
    asString(brief?.brandName),
    asString(brief?.oneSentencePitch),
    asString(brief?.tagline),
    asString(brief?.targetAudience),
    ...asStringArray(brief?.mustHave),
    ...asStringArray(brief?.avoid),
    ...pages,
  ]
    .filter(Boolean)
    .join("\n");
}

function pushEnvVars(target: PlanEnvVarContract[], nextVars: string[], reason: string, required = true): void {
  for (const key of nextVars) {
    if (!key) continue;
    const existing = target.find((entry) => entry.key === key);
    if (existing) {
      if (required) {
        existing.required = true;
        if (reason) existing.reason = reason;
      }
      continue;
    }
    target.push({ key, reason, required });
  }
}

function pushIntegration(target: PlanIntegrationContract[], nextIntegration: PlanIntegrationContract): void {
  const existing = target.find((entry) => entry.provider.toLowerCase() === nextIntegration.provider.toLowerCase());
  if (existing) return;
  target.push(nextIntegration);
}

function mentionsDataPersistence(corpus: string, capabilities: InferredCapabilities): boolean {
  // Do not treat `needsEcommerce` alone as persistence — storefront prompts often
  // lack real DB intent; SQLite default belongs on explicit persistence signals.
  if (capabilities.needsDatabase || capabilities.needsAuth) return true;
  if (/\b(database|databas|save|persist|storage|crm|member area|portal)\b/i.test(corpus)) return true;
  if (/\b(booking|calendar|submission|submissions|konto)\b/i.test(corpus)) {
    const hasExplicitBackendIntent = /\b(database|databas|backend|server|api route|persist|save to|store in)\b/i.test(corpus);
    const mentionsMock = /\b(mock|mocked|demo|placeholder|utan backend|no backend|ingen riktig backend)\b/i.test(corpus);
    if (mentionsMock || !hasExplicitBackendIntent) return false;
    return true;
  }
  return false;
}

function mentionsMockData(corpus: string): boolean {
  return /\b(mock|mocked|demo data|placeholder data|static data|utan backend|no backend)\b/i.test(corpus);
}

/**
 * When the prompt implies persistence but no concrete DB was inferred from keywords,
 * default to **SQLite in the repo** (e.g. `file:./dev.db`) instead of blocking on a
 * clarifying modal. Env is non-blocking so preview/VM runtime can use placeholders.
 */
function applyDefaultSqliteWhenPersistenceNeedsProvider(
  corpus: string,
  capabilities: InferredCapabilities,
  contracts: PlanContracts,
  integrations: PlanIntegrationContract[],
  envVars: PlanEnvVarContract[],
): void {
  if (!mentionsDataPersistence(corpus, capabilities) || contracts.databaseProvider) {
    return;
  }
  const sqliteRule = findProviderRule(
    CONTRACT_DEFAULTS.fallbackDatabaseProvider,
    "database",
  );
  if (!sqliteRule) return;
  contracts.databaseProvider = sqliteRule.provider;
  pushIntegration(integrations, {
    provider: sqliteRule.provider,
    name: sqliteRule.name,
    reason:
      "Automatiskt standardval: lokal SQLite i projektet när persistence behövs men ingen databas nämns — undviker blockerande fråga.",
    status: "chosen",
    envVars: sqliteRule.envVars,
  });
  pushEnvVars(
    envVars,
    sqliteRule.envVars,
    "SQLite: använd t.ex. `file:./dev.db` (Prisma/Drizzle); ingen extern DB krävs för första preview.",
    false,
  );
}

/**
 * When the prompt implies login but no Clerk/NextAuth/Auth0 was inferred, default to
 * **NextAuth/Auth.js with Credentials (lösenord)** — not OAuth consent flows. Env keys are
 * non-blocking; preview uses placeholders from generated-site policy (e.g. AUTH_SECRET).
 */
function applyDefaultCredentialsAuthWhenNeeded(
  capabilities: InferredCapabilities,
  contracts: PlanContracts,
  integrations: PlanIntegrationContract[],
  envVars: PlanEnvVarContract[],
): void {
  if (!capabilities.needsAuth || contracts.authProvider) {
    return;
  }
  const nextAuthRule = findProviderRule(
    CONTRACT_DEFAULTS.fallbackAuthProvider,
    "auth",
  );
  if (!nextAuthRule) return;
  contracts.authProvider = nextAuthRule.provider;
  pushIntegration(integrations, {
    provider: nextAuthRule.provider,
    name: nextAuthRule.name,
    reason:
      "Automatiskt standardval: inloggning med **lösenord** (Auth.js Credentials), inga OAuth-appar. Placeholders för AUTH_SECRET/NEXTAUTH_URL i preview.",
    status: "chosen",
    envVars: nextAuthRule.envVars,
  });
  pushEnvVars(envVars, nextAuthRule.envVars, nextAuthRule.reason, false);
}

/**
 * Checkout/betalning utan vald provider → Stripe med **test-placeholders** (pk_/sk_test…),
 * ingen blockerande fråga. LLM kan bygga UI mot Stripe test mode.
 */
function applyDefaultStripePlaceholderWhenPaymentNeeded(
  corpus: string,
  capabilities: InferredCapabilities,
  contracts: PlanContracts,
  integrations: PlanIntegrationContract[],
  envVars: PlanEnvVarContract[],
): void {
  const needsPayment =
    capabilities.needsPayments === true ||
    /\b(payment|checkout|billing|subscription|betalning|kassa)\b/i.test(corpus);
  if (!needsPayment || contracts.paymentProvider) {
    return;
  }
  const stripeRule = findProviderRule(
    CONTRACT_DEFAULTS.fallbackPaymentProvider,
    "payment",
  );
  if (!stripeRule) return;
  contracts.paymentProvider = stripeRule.provider;
  pushIntegration(integrations, {
    provider: stripeRule.provider,
    name: stripeRule.name,
    reason:
      "Automatiskt standardval: Stripe test-nycklar som placeholders — ingen koppling till riktig kassa förrän du byter env.",
    status: "chosen",
    envVars: stripeRule.envVars,
  });
  pushEnvVars(envVars, stripeRule.envVars, stripeRule.reason, false);
}

function inferDataMode(
  buildIntent: BuildIntent,
  corpus: string,
  capabilities: InferredCapabilities,
): PlanContracts["dataMode"] {
  const wantsPersistence = mentionsDataPersistence(corpus, capabilities);
  const wantsMock = mentionsMockData(corpus);
  if (wantsPersistence && wantsMock) return "mixed";
  if (wantsPersistence) return "persisted";
  if (wantsMock) return "mocked";
  if (buildIntent === "app") return "mocked";
  return "none";
}

/**
 * Infer pre-generation contracts from prompt, brief, and capabilities.
 *
 * **Invariant (preview-first):** `unresolvedDecisions` is always returned empty
 * for the default flow — defaults (SQLite, NextAuth Credentials, Stripe test)
 * are applied automatically. First generation never blocks on missing env.
 */
export function inferPreGenerationContracts(params: {
  prompt: string;
  buildIntent: BuildIntent;
  brief?: Record<string, unknown> | null;
  capabilities: InferredCapabilities;
  requestedDossierCapabilities?: readonly string[];
}): PreGenerationContractContext {
  const {
    prompt,
    buildIntent,
    brief = null,
    capabilities,
    requestedDossierCapabilities = [],
  } = params;
  const corpus = getPromptCorpus(prompt, brief);
  const promptDatabaseCorpus = String(prompt ?? "");
  const hasPositivePromptDatabaseProvider = PROVIDER_RULES.some(
    (rule) =>
      rule.kind === "database" &&
      rule.patterns.some(
        (pattern) =>
          pattern.test(promptDatabaseCorpus) &&
          !isTermFullyNegated(promptDatabaseCorpus, pattern),
      ),
  );
  // The current turn owns database direction. A persisted brief is fallback
  // context only when the user did not mention any positive DB provider now.
  const databaseSelectionCorpus = hasPositivePromptDatabaseProvider
    ? promptDatabaseCorpus
    : corpus;
  const visualOnly = isVisualOnlyFollowUpPrompt(corpus);
  const suppressAuth = visualOnly || hasNegatedAuthIntent(corpus);
  const suppressPayment = visualOnly || hasNegatedPaymentIntent(corpus);
  const suppressBackend = visualOnly || hasNegatedBackendIntent(corpus);
  const suppressIntegration = visualOnly || hasNegatedIntegrationIntent(corpus);
  const effectiveCapabilities: InferredCapabilities = {
    ...capabilities,
    needsAuth: suppressAuth ? false : capabilities.needsAuth,
    needsPayments: suppressPayment ? false : capabilities.needsPayments,
    needsDatabase: suppressBackend ? false : capabilities.needsDatabase,
    needsDataUI: suppressBackend ? false : capabilities.needsDataUI,
  };
  const integrations: PlanIntegrationContract[] = [];
  const envVars: PlanEnvVarContract[] = [];
  const unresolvedDecisions: PreGenerationContractContext["unresolvedDecisions"] = [];
  let guardedDatabaseProviderMention = false;
  const dossierCapabilitySet = new Set(
    requestedDossierCapabilities
      .filter((capability): capability is string => typeof capability === "string")
      .map((capability) => capability.trim().toLowerCase())
      .filter(Boolean),
  );

  const contracts: PlanContracts = {
    dataMode: suppressBackend ? "none" : inferDataMode(buildIntent, corpus, effectiveCapabilities),
    integrations,
    envVars,
  };

  const eligibleProviderRules: ProviderRule[] = [];
  const matchedDatabaseProviderRules: ProviderRule[] = [];
  for (const rule of PROVIDER_RULES) {
    if (rule.kind === "auth" && suppressAuth) continue;
    if (rule.kind === "payment" && suppressPayment) continue;
    if (rule.kind === "database" && suppressBackend) continue;
    if (rule.kind === "integration" && suppressIntegration) continue;
    // Manifest-owned provider guards. `requiresDossierCapabilities` is fed by
    // the caller's capability detector; never infer it again from this prompt.
    // This matters for parked provider brands: Mongo selects the live database
    // dossier, while Mongoose explicitly vetoes that dossier even if generic
    // capability inference happens to set `needsDatabase`.
    const providerCorpus =
      rule.kind === "database" ? databaseSelectionCorpus : corpus;
    const matchesCorpus = rule.patterns.some(
      (pattern) =>
        pattern.test(providerCorpus) &&
        !isTermFullyNegated(providerCorpus, pattern),
    );
    if (!matchesCorpus) continue;
    if (rule.kind === "database") {
      // Direction needs every positively mentioned provider, including source
      // providers whose dossier guard intentionally makes them ineligible as
      // a target (for example MongoDB when Supabase is the explicit target).
      matchedDatabaseProviderRules.push(rule);
    }
    const missesInferredCapabilityGuard =
      rule.requiresCapabilities.some(
        (flag) => effectiveCapabilities[flag as keyof InferredCapabilities] !== true,
      );
    const missesDossierCapabilityGuard =
      rule.requiresDossierCapabilities.some(
        (capability) => !dossierCapabilitySet.has(capability.trim().toLowerCase()),
      );
    if (missesInferredCapabilityGuard || missesDossierCapabilityGuard) {
      // A manifest-recognized database brand with an unmet dossier guard is a
      // deliberate veto, not an invitation to fall through to generic SQLite.
      // Otherwise `Mongoose + database` would manufacture DATABASE_URL after
      // the dossier detector intentionally rejected the database capability.
      if (rule.kind === "database" && missesDossierCapabilityGuard) {
        guardedDatabaseProviderMention = true;
      }
      continue;
    }
    eligibleProviderRules.push(rule);
  }

  const intendedDatabaseRule = selectDatabaseProviderRule(
    databaseSelectionCorpus,
    matchedDatabaseProviderRules,
  );
  const selectedDatabaseRule =
    intendedDatabaseRule && eligibleProviderRules.includes(intendedDatabaseRule.rule)
      ? intendedDatabaseRule
      : null;
  const hasExplicitDatabaseSource = matchedDatabaseProviderRules.some(
    (rule) =>
      rule !== selectedDatabaseRule?.rule &&
      databaseTargetScore(databaseSelectionCorpus, rule) < 0,
  );
  const selectedProviderIsExplicitlyKept =
    selectedDatabaseRule?.score === DATABASE_KEEP_PROVIDER_SCORE;
  const hasPrimaryReplacementCue =
    DATABASE_PRIMARY_REPLACEMENT_RE.test(databaseSelectionCorpus) &&
    !isTermFullyNegated(
      databaseSelectionCorpus,
      DATABASE_PRIMARY_REPLACEMENT_RE,
    );
  for (const rule of eligibleProviderRules) {
    // PlanContracts has one database identity. When source and target
    // providers are both mentioned, only the directionally selected target
    // may reach contracts/integrations/env; historical manifest order remains
    // the stable tie-breaker for prompts without direction cues.
    if (rule.kind === "database" && rule !== selectedDatabaseRule?.rule) continue;

    if (rule.kind === "database" && !contracts.databaseProvider) {
      contracts.databaseProvider = rule.provider;
    }
    if (rule.kind === "auth" && !contracts.authProvider) {
      contracts.authProvider = rule.provider;
    }
    if (rule.kind === "payment" && !contracts.paymentProvider) {
      contracts.paymentProvider = rule.provider;
    }

    pushIntegration(integrations, {
      provider: rule.provider,
      name: rule.name,
      reason: rule.reason,
      status: rule.status ?? "chosen",
      envVars: rule.envVars,
    });
    // Inferred keyword matches are preview-first: never mark env as blocking — the
    // merged `.env.local` placeholders cover both layers
    // (`40-harmless-placeholders.env.txt` + `41-tier3-stub-placeholders.env.txt`).
    pushEnvVars(envVars, rule.envVars, rule.reason, false);
  }

  if (!suppressAuth) {
    applyDefaultCredentialsAuthWhenNeeded(effectiveCapabilities, contracts, integrations, envVars);
  }

  if (!suppressPayment) {
    applyDefaultStripePlaceholderWhenPaymentNeeded(
      corpus,
      effectiveCapabilities,
      contracts,
      integrations,
      envVars,
    );
  }

  if (!suppressBackend && !guardedDatabaseProviderMention) {
    applyDefaultSqliteWhenPersistenceNeedsProvider(
      corpus,
      effectiveCapabilities,
      contracts,
      integrations,
      envVars,
    );
  }

  // Vague "integration" hints no longer block the stream — codegen stubs or uses placeholders.
  // (Previously `oauth` in this regex caused spurious blocking modals.)

  // Preview is the first delivery target: keep env requirements visible in
  // `contracts.envVars`, but never stop first generation on missing keys. Placeholder
  // `.env.local` + project env UI handles the handoff to production-grade config later.

  return {
    contracts,
    unresolvedDecisions,
    databaseSelection: intendedDatabaseRule
      ? {
          provider: intendedDatabaseRule.rule.provider,
          dossierProviderId: selectedDatabaseRule?.rule.dossierProviderId ?? null,
          replacesPrimary:
            selectedDatabaseRule !== null &&
            selectedDatabaseRule.score > 0 &&
            !selectedProviderIsExplicitlyKept &&
            (hasExplicitDatabaseSource || hasPrimaryReplacementCue),
          targetGuardVetoed: !selectedDatabaseRule,
        }
      : undefined,
  };
}

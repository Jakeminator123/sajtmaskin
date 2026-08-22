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
}

type ProviderRule = {
  kind: "database" | "auth" | "payment" | "integration";
  provider: string;
  name: string;
  envVars: string[];
  patterns: RegExp[];
  status?: "chosen" | "optional";
  reason: string;
};

const preGenerationContractsConfig = getPreGenerationContractsConfigFromManifest();

const PROVIDER_RULES: ProviderRule[] = preGenerationContractsConfig.providerRules.map(
  (rule) => ({
    kind: rule.kind,
    provider: rule.provider,
    name: rule.name,
    envVars: rule.envVars,
    patterns: rule.matchPatterns.map((pattern) => new RegExp(pattern, "i")),
    status: rule.status,
    reason: rule.reason,
  }),
);

const CONTRACT_DEFAULTS = preGenerationContractsConfig.defaults;

function findProviderRule(
  provider: string,
  kind?: ProviderRule["kind"],
): ProviderRule | undefined {
  return PROVIDER_RULES.find(
    (rule) => rule.provider === provider && (!kind || rule.kind === kind),
  );
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
  capabilities: InferredCapabilities,
  contracts: PlanContracts,
  integrations: PlanIntegrationContract[],
  envVars: PlanEnvVarContract[],
): void {
  if (!capabilities.needsPayments || contracts.paymentProvider) {
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
}): PreGenerationContractContext {
  const { prompt, buildIntent, brief = null, capabilities } = params;
  const corpus = getPromptCorpus(prompt, brief);
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

  const contracts: PlanContracts = {
    dataMode: suppressBackend ? "none" : inferDataMode(buildIntent, corpus, effectiveCapabilities),
    integrations,
    envVars,
  };

  for (const rule of PROVIDER_RULES) {
    if (rule.kind === "auth" && suppressAuth) continue;
    if (rule.kind === "payment" && suppressPayment) continue;
    if (rule.kind === "database" && suppressBackend) continue;
    if (rule.kind === "integration" && suppressIntegration) continue;
    if (!rule.patterns.some((pattern) => pattern.test(corpus))) continue;

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
      effectiveCapabilities,
      contracts,
      integrations,
      envVars,
    );
  }

  if (!suppressBackend) {
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
  };
}

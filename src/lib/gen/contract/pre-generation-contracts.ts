/**
 * Integration env names and codegen contracts for the builder.
 *
 * Central registry for **models, workloads, and preview placeholders** lives under
 * `config/ai_models/` (`manifest.json` + `40-generated-site-integration-placeholders.env.txt`).
 * Contract provider metadata now comes from `config/ai_models/manifest.json`
 * so dashboard + runtime can stay in sync.
 */
import { getPreGenerationContractsConfigFromManifest } from "@/lib/ai-models/load-manifest";
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { InferredCapabilities } from "../capability-inference";
import type {
  PlanContracts,
  PlanEnvVarContract,
  PlanIntegrationContract,
} from "../plan/schema";

type ContractDecisionKind = "database" | "auth" | "payment" | "integration" | "env";

export interface ConfirmedContractAnswer {
  kind: "integration" | "env" | "database" | "auth" | "payment" | "unclear" | "scope";
  question: string;
  answer: string;
  options?: string[];
  blocking?: boolean;
  reason?: string;
}

export interface PreGenerationContractContext {
  contracts: PlanContracts;
  unresolvedDecisions: Array<{
    kind: ContractDecisionKind;
    reason: string;
  }>;
  confirmedAnswers: ConfirmedContractAnswer[];
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
  if (capabilities.needsDatabase || capabilities.needsAuth || capabilities.needsEcommerce) return true;
  return /\b(database|databas|save|persist|storage|crm|booking|calendar|submission|submissions|member area|portal|konto)\b/i.test(corpus);
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
    capabilities.needsEcommerce || /\b(payment|checkout|billing|subscription|betalning|kassa)\b/i.test(corpus);
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

function removeUnresolved(
  unresolvedDecisions: PreGenerationContractContext["unresolvedDecisions"],
  kind: ContractDecisionKind,
) {
  const index = unresolvedDecisions.findIndex((entry) => entry.kind === kind);
  if (index !== -1) {
    unresolvedDecisions.splice(index, 1);
  }
}

function normalizedAnswer(answer: string): string {
  return answer
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function answerMentions(answer: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(answer));
}

function applyAuthAnswer(
  answer: string,
  contracts: PlanContracts,
  unresolvedDecisions: PreGenerationContractContext["unresolvedDecisions"],
) {
  const normalized = normalizedAnswer(answer);
  if (/\b(ingen auth|ingen autentisering|utan auth|utan autentisering|no auth|placeholder)\b/i.test(normalized)) {
    contracts.authProvider = "ingen";
    removeUnresolved(unresolvedDecisions, "auth");
    return;
  }
  for (const rule of PROVIDER_RULES.filter((entry) => entry.kind === "auth")) {
    if (!answerMentions(normalized, rule.patterns)) continue;
    contracts.authProvider = rule.provider;
    pushIntegration(contracts.integrations, {
      provider: rule.provider,
      name: rule.name,
      reason: "Bekräftat av användarens svar på auth-frågan.",
      status: "chosen",
      envVars: rule.envVars,
    });
    pushEnvVars(contracts.envVars, rule.envVars, "Bekräftat auth-val.", true);
    removeUnresolved(unresolvedDecisions, "auth");
    return;
  }
  // UI option "Annat / vet inte än" — ship without auth for now.
  if (
    /\bannat\b/i.test(normalized) ||
    /\bvet inte\b/i.test(normalized) ||
    /\b(osäker|osaker)\b/i.test(normalized)
  ) {
    contracts.authProvider = "ingen";
    removeUnresolved(unresolvedDecisions, "auth");
  }
}

function applyPaymentAnswer(
  answer: string,
  contracts: PlanContracts,
  unresolvedDecisions: PreGenerationContractContext["unresolvedDecisions"],
) {
  const normalized = normalizedAnswer(answer);
  if (/\b(ingen|utan betalning|utan payment|placeholder|senare)\b/i.test(normalized)) {
    contracts.paymentProvider = "ingen";
    removeUnresolved(unresolvedDecisions, "payment");
    return;
  }
  for (const rule of PROVIDER_RULES.filter((entry) => entry.kind === "payment")) {
    if (!answerMentions(normalized, rule.patterns)) continue;
    contracts.paymentProvider = rule.provider;
    pushIntegration(contracts.integrations, {
      provider: rule.provider,
      name: rule.name,
      reason: "Bekräftat av användarens svar på payment-frågan.",
      status: "chosen",
      envVars: rule.envVars,
    });
    pushEnvVars(contracts.envVars, rule.envVars, "Bekräftat payment-val.", true);
    removeUnresolved(unresolvedDecisions, "payment");
    return;
  }
  // UI option "Annat / vet inte än" — no payment flow yet.
  if (
    /\bannat\b/i.test(normalized) ||
    /\bvet inte\b/i.test(normalized) ||
    /\b(osäker|osaker)\b/i.test(normalized)
  ) {
    contracts.paymentProvider = "ingen";
    removeUnresolved(unresolvedDecisions, "payment");
  }
}

function applyDatabaseAnswer(
  answer: string,
  contracts: PlanContracts,
  unresolvedDecisions: PreGenerationContractContext["unresolvedDecisions"],
) {
  const normalized = normalizedAnswer(answer);
  if (/\b(mock|mockad|mockat|demo data|placeholder)\b/i.test(normalized)) {
    contracts.databaseProvider = "mock data";
    contracts.dataMode = "mocked";
    removeUnresolved(unresolvedDecisions, "database");
    return;
  }
  for (const rule of PROVIDER_RULES.filter((entry) => entry.kind === "database")) {
    if (!answerMentions(normalized, rule.patterns)) continue;
    contracts.databaseProvider = rule.provider;
    contracts.dataMode = "persisted";
    pushIntegration(contracts.integrations, {
      provider: rule.provider,
      name: rule.name,
      reason: "Bekräftat av användarens svar på databas-frågan.",
      status: "chosen",
      envVars: rule.envVars,
    });
    pushEnvVars(contracts.envVars, rule.envVars, "Bekräftat databasval.", true);
    removeUnresolved(unresolvedDecisions, "database");
    return;
  }
  // UI option "Annat / vet inte än" — proceed with mock data first (defers real DB).
  if (
    /\bannat\b/i.test(normalized) ||
    /\bvet inte\b/i.test(normalized) ||
    /\b(osäker|osaker)\b/i.test(normalized)
  ) {
    contracts.databaseProvider = "mock data";
    contracts.dataMode = "mocked";
    removeUnresolved(unresolvedDecisions, "database");
  }
}

function applyIntegrationAnswer(
  answer: string,
  contracts: PlanContracts,
  unresolvedDecisions: PreGenerationContractContext["unresolvedDecisions"],
) {
  const normalized = normalizedAnswer(answer);
  if (/\b(mock|mockad|mockat|senare|placeholder)\b/i.test(normalized)) {
    if (contracts.dataMode === "none") {
      contracts.dataMode = "mocked";
    } else if (contracts.dataMode === "persisted") {
      contracts.dataMode = "mixed";
    }
    removeUnresolved(unresolvedDecisions, "integration");
    return;
  }
  if (
    /\b(osäker|osaker|vet inte|annat|unsure)\b/i.test(normalized) ||
    /behöver välja senare/i.test(normalized)
  ) {
    if (contracts.dataMode === "none") {
      contracts.dataMode = "mocked";
    } else if (contracts.dataMode === "persisted") {
      contracts.dataMode = "mixed";
    }
    removeUnresolved(unresolvedDecisions, "integration");
    return;
  }

  for (const rule of PROVIDER_RULES.filter((entry) => entry.kind === "integration")) {
    if (!answerMentions(normalized, rule.patterns)) continue;
    pushIntegration(contracts.integrations, {
      provider: rule.provider,
      name: rule.name,
      reason: "Bekräftat av användarens svar på integrations-frågan.",
      status: "chosen",
      envVars: rule.envVars,
    });
    pushEnvVars(contracts.envVars, rule.envVars, "Bekräftat integrationsval.", true);
    removeUnresolved(unresolvedDecisions, "integration");
    return;
  }
}

function applyConfirmedAnswers(
  confirmedAnswers: ConfirmedContractAnswer[],
  contracts: PlanContracts,
  unresolvedDecisions: PreGenerationContractContext["unresolvedDecisions"],
) {
  for (const confirmed of confirmedAnswers) {
    const answer = asString(confirmed.answer);
    if (!answer) continue;
    switch (confirmed.kind) {
      case "auth":
        applyAuthAnswer(answer, contracts, unresolvedDecisions);
        break;
      case "payment":
        applyPaymentAnswer(answer, contracts, unresolvedDecisions);
        break;
      case "database":
        applyDatabaseAnswer(answer, contracts, unresolvedDecisions);
        break;
      case "integration":
        applyIntegrationAnswer(answer, contracts, unresolvedDecisions);
        break;
      case "env":
        removeUnresolved(unresolvedDecisions, "env");
        break;
      default:
        break;
    }
  }
}

/**
 * Infer pre-generation contracts from prompt, brief, and capabilities.
 *
 * **Invariant (preview-first):** `unresolvedDecisions` is always returned empty
 * for the default flow — defaults (SQLite, NextAuth Credentials, Stripe test)
 * are applied automatically.  `buildContractClarificationQuestion` guards the
 * gate with `previewFirst` so first generation never blocks on missing env.
 */
export function inferPreGenerationContracts(params: {
  prompt: string;
  buildIntent: BuildIntent;
  brief?: Record<string, unknown> | null;
  capabilities: InferredCapabilities;
  contractAnswers?: ConfirmedContractAnswer[];
}): PreGenerationContractContext {
  const { prompt, buildIntent, brief = null, capabilities, contractAnswers = [] } = params;
  const corpus = getPromptCorpus(prompt, brief);
  const integrations: PlanIntegrationContract[] = [];
  const envVars: PlanEnvVarContract[] = [];
  const unresolvedDecisions: PreGenerationContractContext["unresolvedDecisions"] = [];

  const contracts: PlanContracts = {
    dataMode: inferDataMode(buildIntent, corpus, capabilities),
    integrations,
    envVars,
  };

  for (const rule of PROVIDER_RULES) {
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
    // merged `.env.local` placeholders (`config/ai_models/40-generated-site-integration-placeholders.env.txt`).
    pushEnvVars(envVars, rule.envVars, rule.reason, false);
  }

  applyDefaultCredentialsAuthWhenNeeded(capabilities, contracts, integrations, envVars);

  applyDefaultStripePlaceholderWhenPaymentNeeded(
    corpus,
    capabilities,
    contracts,
    integrations,
    envVars,
  );

  applyDefaultSqliteWhenPersistenceNeedsProvider(
    corpus,
    capabilities,
    contracts,
    integrations,
    envVars,
  );

  // Vague "integration" hints no longer block the stream — codegen stubs or uses placeholders.
  // (Previously `oauth` in this regex caused spurious blocking modals.)

  applyConfirmedAnswers(contractAnswers, contracts, unresolvedDecisions);

  // Preview is the first delivery target: keep env requirements visible in
  // `contracts.envVars`, but never stop first generation on missing keys. Placeholder
  // `.env.local` + project env UI handles the handoff to production-grade config later.

  return {
    contracts,
    unresolvedDecisions,
    confirmedAnswers: contractAnswers,
  };
}

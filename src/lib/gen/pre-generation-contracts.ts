/**
 * Integration env names and codegen contracts for the builder.
 *
 * Central registry for **models, workloads, and preview placeholders** lives under
 * `config/ai_models/` (`manifest.json` + `40-generated-site-integration-placeholders.env.txt`).
 * This file stays the source for `PROVIDER_RULES` until a future refactor imports
 * structured provider metadata from the manifest.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { InferredCapabilities } from "./capability-inference";
import type {
  PlanContracts,
  PlanEnvVarContract,
  PlanIntegrationContract,
} from "./plan-schema";

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

const PROVIDER_RULES: ProviderRule[] = [
  {
    kind: "database",
    provider: "Supabase",
    name: "Supabase",
    envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    patterns: [/\bsupabase\b/i],
    reason: "Prompten nämner Supabase eller ett tydligt Supabase-flöde.",
  },
  {
    kind: "database",
    provider: "Prisma",
    name: "Prisma",
    envVars: ["DATABASE_URL"],
    patterns: [/\bprisma\b/i],
    reason: "Prompten nämner Prisma uttryckligen.",
  },
  {
    kind: "database",
    provider: "Drizzle",
    name: "Drizzle",
    envVars: ["DATABASE_URL"],
    patterns: [/\bdrizzle\b/i],
    reason: "Prompten nämner Drizzle uttryckligen.",
  },
  {
    kind: "database",
    provider: "SQLite",
    name: "SQLite",
    envVars: ["DATABASE_URL"],
    patterns: [/\bsqlite\b|\bbetter-sqlite3\b/i],
    reason: "Prompten nämner SQLite uttryckligen.",
  },
  {
    kind: "auth",
    provider: "Clerk",
    name: "Clerk",
    envVars: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    patterns: [/\bclerk\b/i],
    reason: "Prompten nämner Clerk uttryckligen.",
  },
  {
    kind: "auth",
    provider: "NextAuth / Auth.js",
    name: "NextAuth / Auth.js",
    envVars: ["AUTH_SECRET", "NEXTAUTH_URL"],
    patterns: [/\bnextauth\b|\bauth\.js\b|\bnext-auth\b/i],
    reason: "Prompten nämner NextAuth / Auth.js uttryckligen.",
  },
  {
    kind: "auth",
    provider: "Auth0",
    name: "Auth0",
    envVars: ["AUTH0_SECRET", "AUTH0_BASE_URL", "AUTH0_ISSUER_BASE_URL", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET"],
    patterns: [/\bauth0\b/i],
    reason: "Prompten nämner Auth0 uttryckligen.",
  },
  {
    kind: "payment",
    provider: "Stripe",
    name: "Stripe",
    envVars: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
    patterns: [/\bstripe\b|\bcheckout\b|\bsubscription\b|\bbilling\b/i],
    reason: "Prompten pekar på checkout, subscription eller Stripe.",
  },
  {
    kind: "integration",
    provider: "Resend",
    name: "Resend",
    envVars: ["RESEND_API_KEY"],
    patterns: [/\bresend\b/i],
    reason: "Prompten nämner Resend uttryckligen.",
  },
  {
    kind: "integration",
    provider: "OpenAI",
    name: "OpenAI",
    envVars: ["OPENAI_API_KEY"],
    patterns: [/\bopenai\b|\bgpt-?\d|\bai assistant\b|\bchatbot\b/i],
    reason: "Prompten verkar kräva AI-funktionalitet eller nämner OpenAI.",
  },
  {
    kind: "integration",
    provider: "Vercel Blob",
    name: "Vercel Blob",
    envVars: ["BLOB_READ_WRITE_TOKEN"],
    patterns: [/\bvercel blob\b|\bblob storage\b/i],
    reason: "Prompten nämner blob storage eller Vercel Blob uttryckligen.",
  },
  {
    kind: "integration",
    provider: "Upstash",
    name: "Upstash",
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    patterns: [/\bupstash\b|\bredis\b/i],
    reason: "Prompten nämner Redis eller Upstash uttryckligen.",
  },
  {
    kind: "integration",
    provider: "Google Analytics 4",
    name: "Google Analytics 4",
    envVars: ["NEXT_PUBLIC_GA_ID"],
    patterns: [/\bgoogle analytics\b|\bga4\b|\bgtag\b/i],
    reason: "Prompten nämner Google Analytics / GA4 uttryckligen.",
  },
  {
    kind: "integration",
    provider: "Google Tag Manager",
    name: "Google Tag Manager",
    envVars: ["NEXT_PUBLIC_GTM_ID"],
    patterns: [/\bgoogle tag manager\b|\bgtm\b|\btag manager\b/i],
    reason: "Prompten nämner tag manager / GTM uttryckligen.",
  },
  {
    kind: "integration",
    provider: "Plausible",
    name: "Plausible",
    envVars: ["NEXT_PUBLIC_PLAUSIBLE_DOMAIN"],
    patterns: [/\bplausible\b/i],
    reason: "Prompten nämner Plausible uttryckligen.",
  },
  {
    kind: "integration",
    provider: "PostHog",
    name: "PostHog",
    envVars: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
    patterns: [/\bposthog\b/i],
    reason: "Prompten nämner PostHog uttryckligen.",
  },
  {
    kind: "integration",
    provider: "Vercel Analytics",
    name: "Vercel Analytics",
    envVars: [],
    patterns: [/\bvercel analytics\b/i],
    status: "optional",
    reason: "Prompten nämner Vercel Analytics som möjlig tracking-baseline.",
  },
];

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
 * clarifying modal. Env is non-blocking so preview/sandbox can use placeholders.
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
  contracts.databaseProvider = "SQLite";
  pushIntegration(integrations, {
    provider: "SQLite",
    name: "SQLite",
    reason:
      "Automatiskt standardval: lokal SQLite i projektet när persistence behövs men ingen databas nämns — undviker blockerande fråga.",
    status: "chosen",
    envVars: ["DATABASE_URL"],
  });
  pushEnvVars(
    envVars,
    ["DATABASE_URL"],
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
  const nextAuthRule = PROVIDER_RULES.find((r) => r.kind === "auth" && r.provider === "NextAuth / Auth.js");
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
  const stripeRule = PROVIDER_RULES.find((r) => r.kind === "payment" && r.provider === "Stripe");
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
  const clerkRule = PROVIDER_RULES.find((rule) => rule.provider === "Clerk");
  const nextAuthRule = PROVIDER_RULES.find((rule) => rule.provider === "NextAuth / Auth.js");
  const auth0Rule = PROVIDER_RULES.find((rule) => rule.provider === "Auth0");
  if (clerkRule && answerMentions(normalized, [/\bclerk\b/i])) {
    contracts.authProvider = clerkRule.provider;
    pushIntegration(contracts.integrations, {
      provider: clerkRule.provider,
      name: clerkRule.name,
      reason: "Bekräftat av användarens svar på auth-frågan.",
      status: "chosen",
      envVars: clerkRule.envVars,
    });
    pushEnvVars(contracts.envVars, clerkRule.envVars, "Bekräftat auth-val.", true);
    removeUnresolved(unresolvedDecisions, "auth");
    return;
  }
  if (nextAuthRule && answerMentions(normalized, [/\bnextauth\b|\bauth\.js\b|\bnext-auth\b/i])) {
    contracts.authProvider = nextAuthRule.provider;
    pushIntegration(contracts.integrations, {
      provider: nextAuthRule.provider,
      name: nextAuthRule.name,
      reason: "Bekräftat av användarens svar på auth-frågan.",
      status: "chosen",
      envVars: nextAuthRule.envVars,
    });
    pushEnvVars(contracts.envVars, nextAuthRule.envVars, "Bekräftat auth-val.", true);
    removeUnresolved(unresolvedDecisions, "auth");
    return;
  }
  if (auth0Rule && answerMentions(normalized, [/\bauth0\b/i])) {
    contracts.authProvider = auth0Rule.provider;
    pushIntegration(contracts.integrations, {
      provider: auth0Rule.provider,
      name: auth0Rule.name,
      reason: "Bekräftat av användarens svar på auth-frågan.",
      status: "chosen",
      envVars: auth0Rule.envVars,
    });
    pushEnvVars(contracts.envVars, auth0Rule.envVars, "Bekräftat auth-val.", true);
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
  const stripeRule = PROVIDER_RULES.find((rule) => rule.provider === "Stripe");
  if (stripeRule && answerMentions(normalized, [/\bstripe\b/i])) {
    contracts.paymentProvider = stripeRule.provider;
    pushIntegration(contracts.integrations, {
      provider: stripeRule.provider,
      name: stripeRule.name,
      reason: "Bekräftat av användarens svar på payment-frågan.",
      status: "chosen",
      envVars: stripeRule.envVars,
    });
    pushEnvVars(contracts.envVars, stripeRule.envVars, "Bekräftat payment-val.", true);
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
  if (/\bsupabase\b/i.test(normalized)) {
    contracts.databaseProvider = "Supabase";
    contracts.dataMode = "persisted";
    pushIntegration(contracts.integrations, {
      provider: "Supabase",
      name: "Supabase",
      reason: "Bekräftat av användarens svar på databas-frågan.",
      status: "chosen",
      envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    });
    pushEnvVars(
      contracts.envVars,
      ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      "Bekräftat databasval.",
      true,
    );
    removeUnresolved(unresolvedDecisions, "database");
    return;
  }
  if (/\b(postgres|database_url|postgresql)\b/i.test(normalized)) {
    contracts.databaseProvider = "Postgres / DATABASE_URL";
    contracts.dataMode = "persisted";
    pushEnvVars(contracts.envVars, ["DATABASE_URL"], "Bekräftat databasval.", true);
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
    // Inferred keyword matches are preview-first: never mark env as blocking — sandbox uses
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

  // Preview/sandbox is the first delivery target: keep env requirements visible in
  // `contracts.envVars`, but never stop first generation on missing keys. Placeholder
  // `.env.local` + project env UI handles the handoff to production-grade config later.

  return {
    contracts,
    unresolvedDecisions,
    confirmedAnswers: contractAnswers,
  };
}

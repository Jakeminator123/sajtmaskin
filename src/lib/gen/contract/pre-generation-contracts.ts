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
  hasNegatedPaymentIntent,
  isTermFullyNegated,
  isVisualOnlyFollowUpPrompt,
} from "@/lib/builder/prompt-negation";
import type { InferredCapabilities } from "../capability-inference";
import type {
  PlanContracts,
  PlanEnvVarContract,
  PlanIntegrationContract,
} from "../plan/schema";
import type { ProjectProviderEvidence } from "./project-provider-evidence";

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
  providerKey: string;
  dossierCapability?: string;
  methodOnly?: boolean;
  packageRoots?: string[];
  provider: string;
  name: string;
  envVars: string[];
  patterns: RegExp[];
  status?: "chosen" | "unresolved" | "optional";
  reason: string;
};

const preGenerationContractsConfig = getPreGenerationContractsConfigFromManifest();

const PROVIDER_RULES: ProviderRule[] = preGenerationContractsConfig.providerRules.map(
  (rule) => ({
    kind: rule.kind,
    providerKey: rule.providerKey,
    dossierCapability: rule.dossierCapability,
    methodOnly: rule.methodOnly,
    packageRoots: rule.packageRoots,
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
  const existing = target.find(
    (entry) => {
      const sameCapability =
        entry.dossierCapability?.toLowerCase() ===
        nextIntegration.dossierCapability?.toLowerCase();
      if (entry.providerKey && nextIntegration.providerKey) {
        return (
          entry.providerKey.toLowerCase() === nextIntegration.providerKey.toLowerCase() &&
          entry.kind === nextIntegration.kind &&
          sameCapability
        );
      }
      return (
        entry.provider.toLowerCase() === nextIntegration.provider.toLowerCase() && sameCapability
      );
    },
  );
  if (existing) return;
  target.push(nextIntegration);
}

function mentionsDataPersistence(corpus: string, capabilities: InferredCapabilities): boolean {
  // Do not treat `needsEcommerce` alone as persistence — storefront prompts often
  // lack real DB intent; database defaults belong on explicit persistence signals.
  if (capabilities.needsDatabase) return true;
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
  inheritedIntegrations?: readonly PlanIntegrationContract[];
  projectProviderEvidence?: readonly ProjectProviderEvidence[];
}): PreGenerationContractContext {
  const {
    prompt,
    buildIntent,
    brief = null,
    capabilities,
    inheritedIntegrations = [],
    projectProviderEvidence = [],
  } = params;
  const corpus = getPromptCorpus(prompt, brief);
  const briefCorpus = getPromptCorpus("", brief);
  const visualOnly = isVisualOnlyFollowUpPrompt(corpus);
  const suppressAuth = visualOnly || hasNegatedAuthIntent(corpus);
  const suppressPayment = visualOnly || hasNegatedPaymentIntent(corpus);
  const suppressBackend = visualOnly || hasNegatedBackendIntent(corpus);
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

  const capabilityForRule = (rule: ProviderRule): string | undefined =>
    rule.methodOnly
      ? undefined
      : rule.dossierCapability ??
        (rule.kind === "payment" ? "payments" : rule.kind === "auth" ? "auth" : undefined);

  type SupabasePairDecision = "positive" | "negative";
  const getSupabasePairDecisions = (source: string): Map<string, SupabasePairDecision> => {
    const decisions = new Map<string, SupabasePairDecision>();
    const segments = source
      .split(/[;,!?.\n]+|\b(?:but|men)\b/iu)
      .map((segment) => segment.trim())
      .filter(Boolean);
    for (const segment of segments) {
      if (!/\bsupabase\b/iu.test(segment)) continue;
      const decision: SupabasePairDecision = isTermFullyNegated(
        segment,
        /\bsupabase\b/iu,
      )
        ? "negative"
        : "positive";
      const hasAuthCue =
        /\b(?:auth|authentication|login|inloggning|sign[-\s]?in|logga\s+in)\b/iu.test(segment);
      const hasDatabaseCue = /\b(?:database|databas|db|storage|lagring)\b/iu.test(segment);
      if (hasAuthCue) decisions.set("auth", decision);
      if (hasDatabaseCue) decisions.set("database", decision);
      if (!hasAuthCue && !hasDatabaseCue) {
        if (decision === "negative") {
          decisions.set("auth", decision);
          decisions.set("database", decision);
        } else {
          decisions.set("database", decision);
        }
      }
    }
    return decisions;
  };
  const promptSupabaseDecisions = getSupabasePairDecisions(prompt);
  const briefSupabaseDecisions = getSupabasePairDecisions(briefCorpus);
  const isSupabasePairRule = (rule: ProviderRule): boolean =>
    rule.providerKey === "supabase" &&
    (capabilityForRule(rule) === "auth" || capabilityForRule(rule) === "database");
  type RuleDecision = "positive" | "negative";
  const isMethodRule = (rule: ProviderRule): boolean =>
    Boolean(rule.methodOnly) ||
    (!capabilityForRule(rule) && rule.kind === "database");
  const ruleScope = (rule: ProviderRule): string => {
    const capability = capabilityForRule(rule);
    if (capability) return `capability:${capability}`;
    if (isMethodRule(rule)) return `method:${rule.kind}`;
    return `provider:${rule.providerKey}`;
  };
  const ruleForContract = (
    contract: PlanIntegrationContract,
  ): ProviderRule | undefined =>
    contract.providerKey
      ? PROVIDER_RULES.find((rule) => {
          if (
            rule.providerKey !== contract.providerKey ||
            (contract.kind && rule.kind !== contract.kind)
          ) {
            return false;
          }
          const capability = capabilityForRule(rule);
          return contract.dossierCapability
            ? capability === contract.dossierCapability
            : !capability;
        })
      : undefined;
  const contractScope = (contract: PlanIntegrationContract): string => {
    if (contract.dossierCapability) {
      return `capability:${contract.dossierCapability}`;
    }
    const rule = ruleForContract(contract);
    if (rule) return ruleScope(rule);
    return `provider:${contract.providerKey ?? contract.provider}`;
  };
  const ruleDecisionInSource = (
    rule: ProviderRule,
    source: string,
    supabaseDecisions: ReadonlyMap<string, SupabasePairDecision>,
  ): RuleDecision | undefined => {
    if (isSupabasePairRule(rule)) {
      return supabaseDecisions.get(capabilityForRule(rule)!);
    }
    let positive = false;
    let negative = false;
    const sourceClauses = source
      .split(/[,;!?\n]+/u)
      .map((clause) => clause.trim())
      .filter(Boolean);
    for (const clause of sourceClauses) {
      const matching = rule.patterns.filter((pattern) => pattern.test(clause));
      if (matching.length === 0) continue;
      if (matching.every((pattern) => isTermFullyNegated(clause, pattern))) {
        negative = true;
      } else {
        positive = true;
      }
    }
    if (positive) return "positive";
    if (negative) return "negative";
    return undefined;
  };
  const promptRuleDecisions = new Map(
    PROVIDER_RULES.map((rule) => [
      rule,
      ruleDecisionInSource(rule, prompt, promptSupabaseDecisions),
    ] as const),
  );
  const briefRuleDecisions = new Map(
    PROVIDER_RULES.map((rule) => [
      rule,
      ruleDecisionInSource(rule, briefCorpus, briefSupabaseDecisions),
    ] as const),
  );
  const promptDecisionScopes = new Set(
    PROVIDER_RULES.filter((rule) => promptRuleDecisions.get(rule)).map(ruleScope),
  );
  const promptPositiveScopes = new Set(
    PROVIDER_RULES.filter((rule) => promptRuleDecisions.get(rule) === "positive").map(
      ruleScope,
    ),
  );
  const inheritedExplicitScopes = new Set(
    inheritedIntegrations
      .filter((integration) => integration.selectionSource === "explicit")
      .map(contractScope),
  );
  const decisionForRule = (rule: ProviderRule): RuleDecision | undefined =>
    promptDecisionScopes.has(ruleScope(rule))
      ? promptRuleDecisions.get(rule)
      : inheritedExplicitScopes.has(ruleScope(rule))
        ? undefined
        : briefRuleDecisions.get(rule);
  const matchedPositiveRules = PROVIDER_RULES.filter(
    (rule) => decisionForRule(rule) === "positive",
  );
  const switchTarget = (source: string): string | undefined =>
    source.match(
      /(?:\bfrom\b|\bfrån\b)[\s\S]{0,80}?\b(?:to|till)\b([\s\S]{1,80})/iu,
    )?.[1];
  const promptSwitchTarget = switchTarget(prompt);
  const briefSwitchTarget = switchTarget(briefCorpus);
  const targetRules = matchedPositiveRules.filter((rule) => {
    const target = promptDecisionScopes.has(ruleScope(rule))
      ? promptSwitchTarget
      : briefSwitchTarget;
    return Boolean(
      target && rule.patterns.some((pattern) => pattern.test(target)),
    );
  });
  const targetScopes = new Set(targetRules.map(ruleScope));
  const unresolvedProviderKeys = new Set(
    matchedPositiveRules
      .filter((rule) => rule.status === "unresolved" && capabilityForRule(rule))
      .map((rule) => rule.providerKey),
  );
  const positiveRules = matchedPositiveRules.filter((rule) => {
    if (
      rule.status !== "unresolved" &&
      unresolvedProviderKeys.has(rule.providerKey)
    ) {
      return false;
    }
    if (targetScopes.has(ruleScope(rule))) return targetRules.includes(rule);
    return true;
  });
  const negatedRules = PROVIDER_RULES.filter(
    (rule) => decisionForRule(rule) === "negative",
  );

  const integrationForRule = (
    rule: ProviderRule,
    selectionSource?: NonNullable<PlanIntegrationContract["selectionSource"]>,
  ): PlanIntegrationContract => {
    const status = rule.status ?? "chosen";
    return {
      kind: rule.kind,
      ...(status === "unresolved" ? {} : { providerKey: rule.providerKey }),
      dossierCapability: capabilityForRule(rule),
      ...(selectionSource ? { selectionSource } : {}),
      provider: rule.provider,
      name: rule.name,
      reason: rule.reason,
      status,
      ...(status === "unresolved" ? {} : { envVars: rule.envVars }),
    };
  };
  const capabilityHasContract = (capability: string): boolean =>
    integrations.some((entry) => entry.dossierCapability === capability);
  const applyTopLevelProvider = (integration: PlanIntegrationContract): void => {
    if (integration.status !== "chosen") return;
    if (integration.dossierCapability === "database") {
      contracts.databaseProvider = integration.name || integration.provider;
    }
    if (integration.dossierCapability === "auth") {
      contracts.authProvider = integration.name || integration.provider;
    }
    if (integration.dossierCapability === "payments") {
      contracts.paymentProvider = integration.name || integration.provider;
    }
  };
  const resolveLegacyIntegrations = (
    inherited: PlanIntegrationContract,
  ): PlanIntegrationContract[] => {
    if (inherited.status !== "chosen") return [];
    if (
      inherited.selectionSource === "legacy-preserved" &&
      inherited.providerKey &&
      inherited.dossierCapability
    ) {
      return [{ ...inherited }];
    }
    if (inherited.selectionSource) return [];
    if (inherited.providerKey && inherited.dossierCapability) {
      return [{ ...inherited, selectionSource: "legacy-preserved" }];
    }
    const label = `${inherited.provider} ${inherited.name}`.trim();
    const compact = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const compactLabels = new Set(
      [inherited.provider, inherited.name].map(compact).filter(Boolean),
    );
    const specificMatches = PROVIDER_RULES.filter(
      (rule) =>
        Boolean(capabilityForRule(rule)) &&
        compact(rule.name) !== compact(rule.provider) &&
        compactLabels.has(compact(rule.name)),
    );
    if (specificMatches.length === 1) {
      const [rule] = specificMatches;
      return [
        {
          ...integrationForRule(rule, "legacy-preserved"),
          reason: inherited.reason || `Preserved unambiguous legacy choice ${rule.name}.`,
        },
      ];
    }
    const directlyMatchedProviderKeys = new Set(
      PROVIDER_RULES.filter(
        (rule) =>
          Boolean(capabilityForRule(rule)) &&
          (compactLabels.has(compact(rule.providerKey)) ||
            compactLabels.has(compact(rule.provider)) ||
            compactLabels.has(compact(rule.name)) ||
            rule.patterns.some((pattern) => pattern.test(label))),
      ).map((rule) => rule.providerKey),
    );
    if (directlyMatchedProviderKeys.size !== 1) return [];
    const matches = PROVIDER_RULES.filter(
      (rule) =>
        Boolean(capabilityForRule(rule)) &&
        directlyMatchedProviderKeys.has(rule.providerKey),
    );
    const unique = new Map(
      matches.map((rule) => [`${rule.providerKey}:${capabilityForRule(rule)}`, rule]),
    );
    if (unique.size === 1) {
      const [rule] = unique.values();
      return [
        {
          ...integrationForRule(rule, "legacy-preserved"),
          reason: inherited.reason || `Preserved unambiguous legacy choice ${rule.name}.`,
        },
      ];
    }
    const requestedCapabilities = new Set<string>();
    if (capabilities.needsAuth) requestedCapabilities.add("auth");
    if (capabilities.needsDatabase) requestedCapabilities.add("database");
    if (capabilities.needsPayments) requestedCapabilities.add("payments");
    return Array.from(unique.values())
      .filter((rule) => {
        const capability = capabilityForRule(rule);
        return Boolean(capability && requestedCapabilities.has(capability));
      })
      .map((rule) => {
        const capability = capabilityForRule(rule)!;
        return {
          kind: rule.kind,
          dossierCapability: capability,
          provider: `${capability} provider not selected`,
          name: `${capability} provider not selected`,
          reason: `${inherited.provider} is ambiguous across multiple capabilities; choose the intended provider.`,
          status: "unresolved" as const,
        };
      });
  };
  const isContractNegated = (contract: PlanIntegrationContract): boolean =>
    Boolean(
      contract.providerKey &&
        negatedRules.some((rule) => {
          if (rule.providerKey !== contract.providerKey) return false;
          const ruleCapability = capabilityForRule(rule);
          if (contract.dossierCapability) {
            return ruleCapability === contract.dossierCapability;
          }
          return !ruleCapability && (!contract.kind || rule.kind === contract.kind);
        }),
    );
  const unresolvedAfterNegation = (
    inherited: PlanIntegrationContract,
  ): PlanIntegrationContract => ({
    kind: inherited.kind,
    dossierCapability: inherited.dossierCapability,
    selectionSource: "explicit",
    provider: `${inherited.kind ?? inherited.dossierCapability ?? "Integration"} provider not selected`,
    name: `${inherited.kind ?? inherited.dossierCapability ?? "Integration"} provider not selected`,
    reason: `${inherited.provider} was explicitly rejected; choose another provider.`,
    status: "unresolved",
  });

  // Current positive choices own their capability and replace inherited state.
  const currentRules = positiveRules.filter((rule) => !capabilityForRule(rule));
  const positiveByCapability = new Map<string, ProviderRule[]>();
  for (const rule of positiveRules) {
    const capability = capabilityForRule(rule);
    if (!capability) continue;
    const bucket = positiveByCapability.get(capability) ?? [];
    bucket.push(rule);
    positiveByCapability.set(capability, bucket);
  }
  for (const [capability, rules] of positiveByCapability) {
    const providerKeys = new Set(rules.map((rule) => rule.providerKey));
    if (providerKeys.size > 1) {
      integrations.push({
        dossierCapability: capability,
        selectionSource: "explicit",
        provider: `${capability} provider not selected`,
        name: `${capability} provider not selected`,
        reason: "The prompt names multiple providers; choose the intended provider.",
        status: "unresolved",
      });
      continue;
    }
    currentRules.push(rules[0]);
  }
  for (const rule of currentRules) {
    const capability = capabilityForRule(rule);
    const integration = integrationForRule(rule, "explicit");
    pushIntegration(integrations, integration);

    if (integration.status === "chosen" && rule.kind === "database" && capability === "database" && !contracts.databaseProvider) {
      contracts.databaseProvider = rule.provider;
    }
    if (integration.status === "chosen" && rule.kind === "auth" && !contracts.authProvider) {
      contracts.authProvider = rule.provider;
    }
    if (integration.status === "chosen" && rule.kind === "payment" && !contracts.paymentProvider) {
      contracts.paymentProvider = rule.provider;
    }

    // Inferred keyword matches are preview-first: never mark env as blocking — the
    // merged `.env.local` placeholders cover both layers
    // (`40-harmless-placeholders.env.txt` + `41-tier3-stub-placeholders.env.txt`).
    if (integration.status === "chosen") {
      pushEnvVars(envVars, rule.envVars, rule.reason, false);
    }
  }

  // Explicit/unresolved snapshot choices survive neutral follow-ups unless
  // this round replaced or negated that provider/capability. Older chosen
  // contracts without provenance are held until after current project proof,
  // then preserved only when their provider/capability is unambiguous.
  const legacyCandidates: PlanIntegrationContract[] = [];
  for (const inherited of inheritedIntegrations) {
    if (promptPositiveScopes.has(contractScope(inherited))) continue;
    if (inherited.selectionSource === "explicit") {
      const capability = inherited.dossierCapability;
      if (capability && capabilityHasContract(capability)) continue;
      const projected = isContractNegated(inherited)
        ? unresolvedAfterNegation(inherited)
        : { ...inherited };
      integrations.push(projected);
      if (projected.status === "chosen") {
        pushEnvVars(envVars, projected.envVars ?? [], projected.reason, false);
        applyTopLevelProvider(projected);
      }
      continue;
    }
    if (inherited.status === "unresolved") {
      const capability = inherited.dossierCapability;
      if (
        capability &&
        negatedRules.some((rule) => capabilityForRule(rule) === capability)
      ) {
        continue;
      }
      legacyCandidates.push({ ...inherited });
      continue;
    }
    for (const legacy of resolveLegacyIntegrations(inherited)) {
      const capability = legacy.dossierCapability;
      if (capability && capabilityHasContract(capability)) continue;
      if (isContractNegated(legacy)) {
        integrations.push(unresolvedAfterNegation(legacy));
      } else {
        legacyCandidates.push(legacy);
      }
    }
  }

  const evidenceByCapability = new Map<string, ProjectProviderEvidence[]>();
  for (const evidence of projectProviderEvidence) {
    if (!evidence.dossierCapability) {
      const rule = PROVIDER_RULES.find(
        (candidate) => candidate.providerKey === evidence.providerKey && !capabilityForRule(candidate),
      );
      if (rule) {
        const integration = {
          ...integrationForRule(rule),
          reason: `Existing project dependency and runtime import prove ${rule.name}.`,
        };
        if (!isContractNegated(integration)) {
          pushIntegration(integrations, integration);
        }
      }
      continue;
    }
    const capability = evidence.dossierCapability.toLowerCase();
    const rule = PROVIDER_RULES.find(
      (candidate) =>
        candidate.providerKey === evidence.providerKey &&
        capabilityForRule(candidate) === capability,
    );
    if (rule && isContractNegated(integrationForRule(rule))) continue;
    const bucket = evidenceByCapability.get(capability) ?? [];
    bucket.push(evidence);
    evidenceByCapability.set(capability, bucket);
  }
  for (const [capability, evidence] of evidenceByCapability) {
    if (capabilityHasContract(capability)) continue;
    const providerKeys = Array.from(new Set(evidence.map((item) => item.providerKey)));
    if (providerKeys.length > 1) {
      integrations.push({
        dossierCapability: capability,
        provider: `${capability} provider not selected`,
        name: `${capability} provider not selected`,
        reason: "The project contains runtime proof for multiple providers; choose the intended provider.",
        status: "unresolved",
      });
      continue;
    }
    const rule = PROVIDER_RULES.find(
      (candidate) =>
        candidate.providerKey === providerKeys[0] && capabilityForRule(candidate) === capability,
    );
    if (!rule) continue;
    pushIntegration(integrations, {
      ...integrationForRule(rule),
      reason: `Existing project dependency and runtime import prove ${rule.name}.`,
    });
  }

  for (const legacy of legacyCandidates) {
    const capability = legacy.dossierCapability;
    if (!capability || capabilityHasContract(capability)) continue;
    integrations.push(legacy);
    pushEnvVars(envVars, legacy.envVars ?? [], legacy.reason, false);
    applyTopLevelProvider(legacy);
  }

  const addDefault = (capability: string, provider: string, kind: ProviderRule["kind"]): void => {
    if (capabilityHasContract(capability)) return;
    if (negatedRules.some((rule) => capabilityForRule(rule) === capability)) {
      integrations.push({
        kind,
        dossierCapability: capability,
        selectionSource: "explicit",
        provider: `${kind} provider not selected`,
        name: `${kind} provider not selected`,
        reason: "The previously proposed provider was rejected; choose an alternative.",
        status: "unresolved",
      });
      return;
    }
    const rule = findProviderRule(provider, kind);
    if (!rule) return;
    const integration = integrationForRule(rule, "dossier-default");
    integrations.push(integration);
    pushEnvVars(envVars, rule.envVars, rule.reason, false);
    if (kind === "database") contracts.databaseProvider = rule.name;
    if (kind === "auth") contracts.authProvider = rule.name;
    if (kind === "payment") contracts.paymentProvider = rule.name;
  };

  if (
    (effectiveCapabilities.needsAuth ||
      (capabilities.needsAuth &&
        negatedRules.some((rule) => capabilityForRule(rule) === "auth"))) &&
    (!suppressAuth || negatedRules.some((rule) => capabilityForRule(rule) === "auth"))
  ) {
    addDefault("auth", CONTRACT_DEFAULTS.fallbackAuthProvider, "auth");
  }

  if (
    (effectiveCapabilities.needsPayments ||
      (capabilities.needsPayments &&
        negatedRules.some((rule) => capabilityForRule(rule) === "payments"))) &&
    (!suppressPayment || negatedRules.some((rule) => capabilityForRule(rule) === "payments"))
  ) {
    addDefault("payments", CONTRACT_DEFAULTS.fallbackPaymentProvider, "payment");
  }

  if (
    (mentionsDataPersistence(corpus, effectiveCapabilities) ||
      (capabilities.needsDatabase &&
        negatedRules.some((rule) => capabilityForRule(rule) === "database"))) &&
    (!suppressBackend || negatedRules.some((rule) => capabilityForRule(rule) === "database"))
  ) {
    addDefault("database", CONTRACT_DEFAULTS.fallbackDatabaseProvider, "database");
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

/**
 * Tier-3 ("tredje gradens") build specification.
 *
 * The structured contract that drives F3 ("bygg integrationer"):
 * which integrations need to be wired up, exactly which env keys must
 * have real values before the F3 build can succeed at runtime, and a
 * compact list of build instructions per integration that becomes a
 * dynamic-context block for the F3 LLM.
 *
 * Derivation pipeline:
 *
 *   provider approval -> manifest provider projection
 *     - exactly one dossier: manifest env enforcement/files/exports own F3
 *     - zero or several dossiers: generic registry fallback; no dossier pick
 *
 * `PLACEHOLDER_HARMLESS_ENV_KEYS` is consulted only by the generic fallback.
 * On an exact dossier path the manifest enforcement always wins.
 *
 * Used by:
 *  - `POST /api/engine/chats/[chatId]/finalize-design` — calls
 *    `validateTier3Readiness()` and refuses to start F3 generation
 *    when required real env keys are missing.
 *  - F3 dynamic context — `## Tier-3 Integration Build Plan` block
 *    rendering `requirements[].buildInstructions`.
 *  - F3 placeholder merge — tier-3 stub layer is dropped via
 *    `resolvePreviewEnvLayers({ lifecycleStage: "integrations" })`.
 */
import type { PlanContracts, PlanIntegrationContract } from "@/lib/gen/plan/schema";
import {
  integrationRegistry,
  integrationRegistryByKey,
  type IntegrationDefinition,
} from "@/lib/integrations/registry";
import { partitionEnvKeysByTier } from "@/lib/integrations/placeholder-harmless";
import { getAllDossiers, resolveDossierProvider } from "@/lib/gen/dossiers/registry";
import type { DossierEntry } from "@/lib/gen/dossiers/types";

export interface Tier3IntegrationRequirement {
  /** Integration key, matches `IntegrationDefinition.key`. */
  key: string;
  /** Human-readable name. */
  name: string;
  /** Provider id (often equal to key; from `IntegrationDefinition.provider`). */
  provider: string;
  /**
   * Env keys that MUST have real values before F3 can succeed.
   * For an exact dossier, derived solely from required manifest env vars with
   * `enforcement: "build"`. Generic fallbacks never hard-block F3.
   */
  requiredRealEnvKeys: string[];
  /**
   * Env keys that may keep their placeholder value even in F3.
   * Generic-fallback env keys matching `PLACEHOLDER_HARMLESS_ENV_KEYS`.
   * Always empty on an exact dossier path because manifest enforcement owns
   * every declared key there.
   */
  placeholderOkEnvKeys: string[];
  /**
   * Env keys whose dossier marks them `feature-runtime` — the SDK is
   * imported but the dossier's UI shows a configuration banner / popup
   * when the value is missing. F3 reports these as informational warnings.
   * Empty when no dossier metadata is available (legacy callers).
   */
  featureRuntimeEnvKeys: string[];
  /**
   * Env keys whose dossier marks them `warn-only` — the dossier code
   * self-disables on empty value. Surfaced only as info; never blocks.
   * Empty when no dossier metadata is available.
   */
  warnOnlyEnvKeys: string[];
  /** 4-8 concrete build steps for the F3 LLM. */
  buildInstructions: string[];
  /** Vendor setup guide from the dossier manifest or generic registry fallback. */
  setupGuide: string;
  /**
   * True when a backing dossier ships `components/integration-config-notice.tsx`
   * (the calm not-configured fallback UI). Drives the per-integration graceful-
   * fallback instruction in `renderTier3BuildPlanBlock` — the instruction must
   * NOT be emitted for integrations whose dossier does not provide the
   * component, or the model may import a file that never lands in the project.
   */
  hasConfigNoticeComponent: boolean;
}

export interface Tier3BuildSpec {
  /** Required tier-3 integrations, sorted alphabetically by key for stable output. */
  requirements: Tier3IntegrationRequirement[];
}

/**
 * Whether F3 has any real integration work that requires the general LLM
 * build round. This is intentionally based only on per-key `build`
 * enforcement. A selected hard/soft dossier with feature-runtime or warn-only
 * keys keeps its existing F2 visual fallback; dossier/requirement presence is
 * not itself permission to start codegen.
 */
export function hasRequiredRealBuildKeys(spec: Tier3BuildSpec): boolean {
  return spec.requirements.some((requirement) => requirement.requiredRealEnvKeys.length > 0);
}

export interface Tier3ReadinessReport {
  /** True when every required real env key has a non-empty value. */
  ready: boolean;
  /** Per-integration breakdown of missing keys. Empty array when ready. */
  missingByIntegration: Array<{
    key: string;
    name: string;
    missing: string[];
  }>;
  /**
   * Per-integration breakdown of build-enforcement keys that were satisfied
   * via a placeholder rather than a real value (only populated when
   * `validateTier3Readiness` ran with `allowPlaceholdersForBuildKeys`).
   */
  placeholderUsedByIntegration?: Array<{
    key: string;
    name: string;
    placeholdered: string[];
  }>;
}

const GENERIC_BUILD_INSTRUCTIONS = (def: IntegrationDefinition): string[] => [
  "No unique dossier contract owns this provider approval; use the generic integration path and do not inject an arbitrary dossier sibling.",
  `Wire ${def.name} using its standard SDK and the env keys: ${def.envVars.join(", ") || "(none required)"}.`,
  `Initialize the client in a dedicated module (e.g. \`lib/${def.key}.ts\`) and reuse the instance.`,
  `Document required env vars in a top-of-file comment.`,
];

function uniqueProviderIntegrations(contracts: PlanContracts): PlanIntegrationContract[] {
  const seen = new Set<string>();
  const out: PlanIntegrationContract[] = [];
  for (const integration of contracts.integrations) {
    const id = integration.provider || integration.name;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(integration);
  }
  return out;
}

function findIntegrationDefinition(
  integration: PlanIntegrationContract,
): IntegrationDefinition | undefined {
  const byProviderId = integrationRegistryByKey.get(integration.provider);
  if (byProviderId) return byProviderId;
  for (const def of integrationRegistry) {
    if (def.provider === integration.provider) return def;
    if (def.name.toLowerCase() === (integration.name ?? "").toLowerCase()) {
      return def;
    }
  }
  return undefined;
}

/**
 * Any `components/**config-notice*.tsx` counts as a config-notice UI — the
 * shared `integration-config-notice.tsx` AND dossier-specific variants like
 * mongodb-atlas's `db-config-notice.tsx` (Codex P2 #445: the exact-filename
 * check made DB approvals take the "none is provided" branch and told the
 * model NOT to import the notice the dossier actually ships).
 */
const CONFIG_NOTICE_FILE_RE = /(?:^|\/)components\/(?:[\w-]*-)?config-notice\.tsx$/;

function dossierShipsConfigNotice(dossier: DossierEntry): boolean {
  return (dossier.files ?? []).some((file) => CONFIG_NOTICE_FILE_RE.test(file.path));
}

function compactProviderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function canonicalProviderKey(raw: string): string {
  const definition = findRegistryDefinitionByProviderKey(raw);
  return (definition?.provider ?? definition?.key ?? raw).trim().toLowerCase();
}

function findExactDossierInput(raw: string): DossierEntry | undefined {
  const dossierId = raw.trim().toLowerCase();
  if (!dossierId) return undefined;
  return getAllDossiers().find((dossier) => dossier.id === dossierId);
}

/**
 * A generic provider approval may select a dossier only when the manifest
 * projection resolves to exactly one dossier. Zero matches and multiple
 * matches deliberately map to nothing so F3 cannot inject an arbitrary
 * sibling (for example OpenAI chat vs tool-calling vs RAG).
 */
export function mapProviderKeysToDossierCapabilities(providerKeys: string[]): string[] {
  const capabilities = new Set<string>();
  for (const raw of providerKeys) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const exactDossier = findExactDossierInput(raw);
    if (exactDossier) {
      capabilities.add(exactDossier.capability);
      continue;
    }
    const resolution = resolveDossierProvider(canonicalProviderKey(raw));
    if (resolution.status !== "unique") continue;
    capabilities.add(resolution.capabilities[0]);
  }
  return [...capabilities].sort();
}

/**
 * DOSSIER-ID variant of {@link mapProviderKeysToDossierCapabilities}. Needed
 * where capability granularity is too coarse: version-presence comparisons
 * (Codex P1 on #503) must not treat a present SIBLING dossier
 * (`postgres-drizzle` under `database`) as satisfying a newly approved
 * provider (`mongodb` → `mongodb-atlas`).
 */
export function mapProviderKeysToBackingDossierIds(providerKeys: string[]): string[] {
  const ids = new Set<string>();
  for (const raw of providerKeys) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const exactDossier = findExactDossierInput(raw);
    if (exactDossier) {
      ids.add(exactDossier.id);
      continue;
    }
    const resolution = resolveDossierProvider(canonicalProviderKey(raw));
    if (resolution.status !== "unique") continue;
    ids.add(resolution.dossierIds[0]);
  }
  return [...ids].sort();
}

/**
 * Known provider keys that cannot safely select one dossier. Both dossierless
 * and ambiguous providers must use the generic LLM path; only a unique
 * manifest projection is eligible for deterministic dossier injection.
 */
export function providerKeysWithoutBackingDossier(providerKeys: string[]): string[] {
  const keys = new Set<string>();
  const explicitProviderKeys = new Set<string>();
  for (const raw of providerKeys) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const exactDossier = findExactDossierInput(raw);
    for (const provider of exactDossier?.providers ?? []) {
      explicitProviderKeys.add(provider.trim().toLowerCase());
    }
  }
  for (const raw of providerKeys) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (findExactDossierInput(raw)) continue;
    const def = findRegistryDefinitionByProviderKey(raw);
    const provider = canonicalProviderKey(raw);
    // An exact dossier identity is sharper than a generic provider approval,
    // including when several dossiers claim that provider. Avoid scheduling a
    // second generic LLM round for e.g. ["openai-chat", "openai"].
    if (explicitProviderKeys.has(provider)) continue;
    const resolution = resolveDossierProvider(provider);
    const known = Boolean(def) || resolution.status !== "dossierless";
    if (known && resolution.status !== "unique") {
      keys.add((def?.key ?? provider).toLowerCase());
    }
  }
  return [...keys].sort();
}

function manifestSetupGuide(entry: DossierEntry): string {
  return (entry.envVars ?? [])
    .map((env) => `${env.key}: ${env.purpose}${env.setupUrl ? ` (${env.setupUrl})` : ""}`)
    .join(" ");
}

function buildDossierRequirement(
  entry: DossierEntry,
  identity: Pick<Tier3IntegrationRequirement, "key" | "name" | "provider">,
): Tier3IntegrationRequirement {
  const requiredRealEnvKeys: string[] = [];
  const featureRuntimeEnvKeys: string[] = [];
  const warnOnlyEnvKeys: string[] = [];

  // Exact dossier paths are governed solely by manifest enforcement. Global
  // harmless-placeholder classification must never demote e.g. Clerk's public
  // build key or Sanity's public feature-runtime keys.
  for (const env of entry.envVars ?? []) {
    switch (env.enforcement ?? "build") {
      case "feature-runtime":
        featureRuntimeEnvKeys.push(env.key);
        break;
      case "warn-only":
        warnOnlyEnvKeys.push(env.key);
        break;
      default:
        if (env.required !== false) requiredRealEnvKeys.push(env.key);
        else warnOnlyEnvKeys.push(env.key);
    }
  }

  const declaredFiles = (entry.files ?? []).map((file) => `\`${file.path}\``).join(", ");
  const declaredExports = (entry.exposes ?? [])
    .map((exposed) => `\`${exposed.name}\` from \`${exposed.import}\``)
    .join(", ");

  return {
    ...identity,
    requiredRealEnvKeys,
    placeholderOkEnvKeys: [],
    featureRuntimeEnvKeys,
    warnOnlyEnvKeys,
    buildInstructions: [
      `Use the injected \`${entry.id}\` dossier as the exact implementation contract: ${entry.summary}`,
      `Materialize and wire only its declared files: ${declaredFiles || "(no shipped files)"}.`,
      `Mount its declared exports in the existing design: ${declaredExports || "(no declared exports)"}.`,
      `Preserve the dossier's \`${entry.mock ?? "none"}\` F2 fallback while activating the real provider path.`,
    ],
    setupGuide: manifestSetupGuide(entry),
    hasConfigNoticeComponent: dossierShipsConfigNotice(entry),
  };
}

function buildGenericRequirement(
  definition: IntegrationDefinition,
  integration?: PlanIntegrationContract,
): Tier3IntegrationRequirement {
  const envKeys =
    integration?.envVars && integration.envVars.length > 0
      ? integration.envVars
      : definition.envVars;
  const { harmless, tier3 } = partitionEnvKeysByTier(envKeys);
  const enforcementHint = integration?.envEnforcement;
  const featureRuntimeEnvKeys = enforcementHint
    ? tier3.filter((key) => enforcementHint[key] === "feature-runtime")
    : [];
  const hintedWarnOnly = enforcementHint
    ? tier3.filter((key) => enforcementHint[key] === "warn-only")
    : [];
  const otherwiseBuild = tier3.filter(
    (key) => !featureRuntimeEnvKeys.includes(key) && !hintedWarnOnly.includes(key),
  );

  // There is no exact manifest contract that proves a generated file consumes
  // these keys. Keep the generic path actionable without hard-blocking F3 on
  // an inferred provider requirement.
  return {
    key: definition.key,
    name: definition.name,
    provider: definition.provider ?? definition.key,
    requiredRealEnvKeys: [],
    placeholderOkEnvKeys: harmless,
    featureRuntimeEnvKeys,
    warnOnlyEnvKeys: [...new Set([...hintedWarnOnly, ...otherwiseBuild])],
    buildInstructions: GENERIC_BUILD_INSTRUCTIONS({
      ...definition,
      envVars: envKeys,
    }),
    setupGuide: definition.setupGuide,
    hasConfigNoticeComponent: false,
  };
}

function manifestOnlyGenericDefinition(
  provider: string,
  dossiers: readonly DossierEntry[] = [],
): IntegrationDefinition {
  const name = provider
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
  const envKeySets = dossiers.map(
    (dossier) => new Set((dossier.envVars ?? []).map((env) => env.key)),
  );
  const sharedEnvVars =
    envKeySets.length === 0
      ? []
      : [...envKeySets[0]].filter((key) => envKeySets.every((keys) => keys.has(key))).sort();
  return {
    key: provider,
    name: name || provider,
    category: "other",
    // Ambiguity must never select one dossier, but metadata common to every
    // claimant is still safe to surface. Postgres is the motivating case:
    // both postgres-drizzle and rag-chat require DATABASE_URL.
    envVars: sharedEnvVars,
    setupGuide:
      sharedEnvVars.length > 0
        ? `Configure the shared provider keys (${sharedEnvVars.join(", ")}), then choose the exact capability/dossier for provider-specific setup steps.`
        : "Choose the exact capability/dossier before relying on provider-specific setup steps.",
    runtime: "server",
    optional: false,
    provider,
  };
}

/** Build F3 requirements directly from explicit provider approvals. */
export function deriveTier3BuildSpecForProviderKeys(
  providerKeys: readonly string[],
): Tier3BuildSpec {
  const requirements: Tier3IntegrationRequirement[] = [];
  const seenProviders = new Set<string>();
  const seenDossierIds = new Set<string>();
  const explicitDossierIds = new Set<string>();
  const explicitProviderKeys = new Set<string>();
  for (const rawProvider of providerKeys) {
    if (typeof rawProvider !== "string" || !rawProvider.trim()) continue;
    const exactDossier = findExactDossierInput(rawProvider);
    if (!exactDossier) continue;
    explicitDossierIds.add(exactDossier.id);
    for (const provider of exactDossier.providers ?? []) {
      explicitProviderKeys.add(provider.trim().toLowerCase());
    }
  }

  for (const rawProvider of providerKeys) {
    if (typeof rawProvider !== "string" || !rawProvider.trim()) continue;
    const exactDossier = findExactDossierInput(rawProvider);
    if (exactDossier) {
      if (seenDossierIds.has(exactDossier.id)) continue;
      seenDossierIds.add(exactDossier.id);
      requirements.push(
        buildDossierRequirement(exactDossier, {
          key: exactDossier.id,
          name: exactDossier.label,
          provider: exactDossier.providers?.[0] ?? exactDossier.id,
        }),
      );
      continue;
    }
    const provider = canonicalProviderKey(rawProvider);
    if (!provider || seenProviders.has(provider)) continue;
    if (explicitProviderKeys.has(provider)) continue;
    seenProviders.add(provider);

    const definition = findRegistryDefinitionByProviderKey(rawProvider);
    const resolution = resolveDossierProvider(provider);
    if (resolution.status === "unique") {
      const entry = resolution.dossiers[0];
      // A legacy exact dossier identity is sharper than its generic provider
      // alias. Pre-scan the complete approval array so the winner is stable
      // regardless of union/insertion order in persisted snapshots.
      if (explicitDossierIds.has(entry.id)) continue;
      if (seenDossierIds.has(entry.id)) continue;
      seenDossierIds.add(entry.id);
      requirements.push(
        buildDossierRequirement(entry, {
          key: definition?.key ?? provider,
          name: definition?.name ?? entry.label,
          provider,
        }),
      );
      continue;
    }

    if (definition || resolution.status === "ambiguous") {
      requirements.push(
        buildGenericRequirement(
          definition ?? manifestOnlyGenericDefinition(provider, resolution.dossiers),
        ),
      );
    }
  }
  requirements.sort((a, b) => a.key.localeCompare(b.key));
  return { requirements };
}

/**
 * Build F3 requirements from exact provider-specific dossier ids. This is the
 * bridge used by the F2 → F3 button: planned dossiers have no file evidence
 * yet, so provider detection cannot discover them from the parent version.
 */
export function deriveTier3BuildSpecForDossierIds(dossierIds: readonly string[]): Tier3BuildSpec {
  const byId = new Map(getAllDossiers().map((entry) => [entry.id, entry]));
  const requirements: Tier3IntegrationRequirement[] = [];
  const seen = new Set<string>();

  for (const rawId of dossierIds) {
    const dossierId = typeof rawId === "string" ? rawId.trim().toLowerCase() : "";
    if (!dossierId || seen.has(dossierId)) continue;
    seen.add(dossierId);
    const entry = byId.get(dossierId);
    if (!entry) continue;

    requirements.push(
      buildDossierRequirement(entry, {
        key: entry.id,
        name: entry.label,
        provider: entry.id,
      }),
    );
  }

  requirements.sort((a, b) => a.key.localeCompare(b.key));
  return { requirements };
}

function findRegistryDefinitionByProviderKey(raw: string): IntegrationDefinition | undefined {
  const compact = compactProviderKey(raw);
  if (!compact) return undefined;
  return integrationRegistry.find(
    (d) =>
      compactProviderKey(d.key) === compact || compactProviderKey(d.provider ?? d.key) === compact,
  );
}

/** True when a uniquely resolved provider dossier ships a config notice. */
export function approvedProvidersShipConfigNotice(providerKeys: string[]): boolean {
  for (const raw of providerKeys) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const exactDossier = findExactDossierInput(raw);
    if (exactDossier) {
      if (dossierShipsConfigNotice(exactDossier)) return true;
      continue;
    }
    const resolution = resolveDossierProvider(canonicalProviderKey(raw));
    if (resolution.status === "unique" && dossierShipsConfigNotice(resolution.dossiers[0])) {
      return true;
    }
  }
  return false;
}

/**
 * Build a Tier-3 spec from the contracts the orchestrator already inferred.
 * Only `chosen` (or unresolved-but-named) integrations contribute; `optional`
 * integrations without a status are skipped because the user hasn't asked
 * for them yet.
 */
export function deriveTier3BuildSpec(contracts: PlanContracts): Tier3BuildSpec {
  const requirements: Tier3IntegrationRequirement[] = [];

  for (const integration of uniqueProviderIntegrations(contracts)) {
    if (integration.status === "optional") continue;
    const exactDossier = findExactDossierInput(integration.provider);
    if (exactDossier) {
      requirements.push(
        buildDossierRequirement(exactDossier, {
          key: exactDossier.id,
          name: exactDossier.label,
          provider: exactDossier.providers?.[0] ?? exactDossier.id,
        }),
      );
      continue;
    }

    const def = findIntegrationDefinition(integration);
    const provider = canonicalProviderKey(def?.provider ?? def?.key ?? integration.provider);
    const resolution = resolveDossierProvider(provider);
    if (resolution.status === "unique") {
      const entry = resolution.dossiers[0];
      requirements.push(
        buildDossierRequirement(entry, {
          key: def?.key ?? provider,
          name: def?.name ?? entry.label,
          provider,
        }),
      );
    } else if (def || resolution.status === "ambiguous") {
      requirements.push(
        buildGenericRequirement(
          def ?? manifestOnlyGenericDefinition(provider, resolution.dossiers),
          integration,
        ),
      );
    }
  }

  requirements.sort((a, b) => a.key.localeCompare(b.key));
  return { requirements };
}

/**
 * Validate F3 readiness against the project's stored env vars.
 * `projectEnvVars` should already be decrypted (e.g. from
 * `getStoredProjectEnvVarMap`). A key is satisfied when it has a non-empty
 * trimmed value.
 *
 * `options.allowPlaceholdersForBuildKeys` (Phase 4 toggle): when true, a
 * `build`-enforcement key counts as satisfied if it has a placeholder
 * value in `placeholderEnvKeys`. The result still records which keys were
 * placeholdered so the UI can show banners.
 */
export function validateTier3Readiness(
  spec: Tier3BuildSpec,
  projectEnvVars: Record<string, string>,
  options: {
    allowPlaceholdersForBuildKeys?: boolean;
    placeholderEnvKeys?: ReadonlySet<string>;
  } = {},
): Tier3ReadinessReport {
  const missingByIntegration: Tier3ReadinessReport["missingByIntegration"] = [];
  const placeholderUsedByIntegration: NonNullable<
    Tier3ReadinessReport["placeholderUsedByIntegration"]
  > = [];
  const allowPlaceholders = options.allowPlaceholdersForBuildKeys === true;
  const placeholderKeys = options.placeholderEnvKeys ?? new Set<string>();

  for (const req of spec.requirements) {
    const missing: string[] = [];
    const placeholdered: string[] = [];
    for (const key of req.requiredRealEnvKeys) {
      const value = projectEnvVars[key];
      const hasRealValue = typeof value === "string" && value.trim() !== "";
      if (hasRealValue) continue;

      if (allowPlaceholders && placeholderKeys.has(key)) {
        placeholdered.push(key);
        continue;
      }
      missing.push(key);
    }
    if (missing.length > 0) {
      missingByIntegration.push({ key: req.key, name: req.name, missing });
    }
    if (placeholdered.length > 0) {
      placeholderUsedByIntegration.push({
        key: req.key,
        name: req.name,
        placeholdered,
      });
    }
  }

  return {
    ready: missingByIntegration.length === 0,
    missingByIntegration,
    ...(placeholderUsedByIntegration.length > 0 ? { placeholderUsedByIntegration } : {}),
  };
}

/**
 * Render the Tier-3 build plan as a Markdown block for injection into the
 * F3 system prompt's dynamic context. Returns null when there are no
 * requirements (i.e. nothing to wire).
 */
export function renderTier3BuildPlanBlock(spec: Tier3BuildSpec): string | null {
  if (spec.requirements.length === 0) return null;
  const lines: string[] = [
    "## Tier-3 Integration Build Plan",
    "",
    'You are now in F3 ("bygg integrationer"). Wire each integration below end-to-end.',
    // The old wording ("assume real values are present at runtime") was
    // wrong for the approval-without-keys case (P2 F3-loop): keys tagged
    // `feature-runtime` may legitimately still be placeholders when the
    // build runs — the site owner fills them in later via the env panel.
    // Generated code must therefore ALWAYS use the graceful not-configured
    // pattern (#374): lazy SDK init after an env guard, calm 503 with a
    // `*-not-configured` code, config-notice UI instead of a raw error.
    "Read env keys via `process.env`, but NEVER assume they hold real values: any key may still be missing or a placeholder until the site owner fills it in. Initialize SDK clients lazily (inside the request handler, after an env guard) — never at module scope.",
    "When a key is missing or placeholder at runtime, the API route must respond with a calm 503 JSON body carrying a `*-not-configured` error code, and the UI must degrade gracefully.",
    "Never surface a raw error string, stack trace, or HTTP status code to the site visitor when an integration is not configured.",
    "",
  ];
  for (const req of spec.requirements) {
    lines.push(`### ${req.name} (\`${req.key}\`)`);
    if (req.requiredRealEnvKeys.length > 0) {
      lines.push(`Required env: \`${req.requiredRealEnvKeys.join("`, `")}\``);
    }
    if (req.featureRuntimeEnvKeys.length > 0) {
      lines.push(
        `Feature-runtime env (may be missing/placeholder at runtime — graceful fallback required): \`${req.featureRuntimeEnvKeys.join("`, `")}\``,
      );
    }
    if (req.placeholderOkEnvKeys.length > 0) {
      lines.push(`Public/placeholder-OK env: \`${req.placeholderOkEnvKeys.join("`, `")}\``);
    }
    if (req.warnOnlyEnvKeys.length > 0) {
      lines.push(
        `Optional/warn-only env (never blocks F3): \`${req.warnOnlyEnvKeys.join("`, `")}\``,
      );
    }
    // Only integrations whose backing dossier actually ships the config-notice
    // component get the graceful-fallback instruction. Emitting it globally
    // made the model import `@/components/integration-config-notice` in
    // projects where no dossier provides that file (Clerk, OpenAI, …) —
    // a guaranteed build break.
    if (req.hasConfigNoticeComponent) {
      lines.push(
        "Graceful fallback (mandatory): this integration's dossier ships `components/integration-config-notice.tsx`. Every CTA for this integration MUST handle the API route's not-configured response (HTTP 503 with an error code like `payments-not-configured` / `email-not-configured`) by rendering the `IntegrationConfigNotice` component with a disabled CTA — never a raw error.",
      );
    }
    lines.push("Steps:");
    for (const step of req.buildInstructions) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

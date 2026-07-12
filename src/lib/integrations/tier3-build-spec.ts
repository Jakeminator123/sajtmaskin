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
 *   PreGenerationContractContext  ─┐
 *                                  │  deriveTier3BuildSpec()
 *   integrationRegistry            ├──────────────────────► Tier3BuildSpec
 *                                  │
 *   PLACEHOLDER_HARMLESS_ENV_KEYS ─┘
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
import type {
  PlanContracts,
  PlanIntegrationContract,
} from "@/lib/gen/plan/schema";
import {
  integrationRegistry,
  integrationRegistryByKey,
  type IntegrationDefinition,
} from "@/lib/integrations/registry";
import { partitionEnvKeysByTier } from "@/lib/integrations/placeholder-harmless";
import { getAllDossiers } from "@/lib/gen/dossiers/registry";

export interface Tier3IntegrationRequirement {
  /** Integration key, matches `IntegrationDefinition.key`. */
  key: string;
  /** Human-readable name. */
  name: string;
  /** Provider id (often equal to key; from `IntegrationDefinition.provider`). */
  provider: string;
  /**
   * Env keys that MUST have real values before F3 can succeed.
   * Subset of `IntegrationDefinition.envVars` excluding placeholder-harmless
   * keys AND any key whose dossier metadata marked it `feature-runtime` /
   * `warn-only` (those are surfaced separately below).
   */
  requiredRealEnvKeys: string[];
  /**
   * Env keys that may keep their placeholder value even in F3.
   * Subset of `IntegrationDefinition.envVars` matching `PLACEHOLDER_HARMLESS_ENV_KEYS`.
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
  /** Vendor setup guide (re-exported from `IntegrationDefinition.setupGuide`). */
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
  return spec.requirements.some(
    (requirement) => requirement.requiredRealEnvKeys.length > 0,
  );
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

/**
 * Build instructions per integration. Conservative defaults — each list is
 * enough to wire the integration end-to-end without dictating UI choices.
 * Unknown integrations fall back to a generic "wire env vars" instruction.
 */
const BUILD_INSTRUCTIONS: Record<string, string[]> = {
  stripe: [
    "Add a `/api/checkout/route.ts` POST handler that constructs a Stripe checkout session from `STRIPE_SECRET_KEY`.",
    "Wire the primary CTA on the pricing/plans page to POST to `/api/checkout` and redirect to the returned `url`.",
    "Add a `/api/stripe/webhook/route.ts` POST handler that verifies signatures with `STRIPE_WEBHOOK_SECRET`.",
    "Add `/checkout/success` and `/checkout/cancel` pages that read the session id from the URL and render the outcome.",
    "Use `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` only in client components, never the secret key.",
    "Document the required env vars in a top-of-file comment in `/api/checkout/route.ts`.",
  ],
  supabase: [
    "Initialize a Supabase server client in `lib/supabase/server.ts` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.",
    "Initialize a Supabase browser client in `lib/supabase/browser.ts` for client components.",
    "Add a typed `Database` interface stub in `lib/supabase/types.ts` to be replaced with generated types.",
    "Wire data fetches in server components/route handlers to the server client; use the browser client only for realtime/auth.",
    "Add a top-of-file comment listing required env vars in each `lib/supabase/*.ts` file.",
  ],
  clerk: [
    "Wrap `app/layout.tsx` in `<ClerkProvider>` from `@clerk/nextjs`.",
    "Add `middleware.ts` at project root with `clerkMiddleware()` and matcher excluding static assets.",
    "Add `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx` rendering Clerk's `<SignIn />` / `<SignUp />`.",
    "Use `auth()` from `@clerk/nextjs/server` in protected route handlers and server components.",
    "Document `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in a top-of-file comment in `middleware.ts`.",
  ],
  "next-auth": [
    "Add `app/api/auth/[...nextauth]/route.ts` exporting `GET`/`POST` from `NextAuth(authOptions)`.",
    "Define `authOptions` in `lib/auth.ts` with provider list and session strategy.",
    "Use `auth()` (or `getServerSession`) in server components and route handlers to gate access.",
    "Wrap client components needing session data in `<SessionProvider>`.",
    "Document required `AUTH_SECRET` and provider env vars in a top-of-file comment in `lib/auth.ts`.",
  ],
  "vercel-blob": [
    "Add `/api/upload/route.ts` POST handler using `@vercel/blob` `put()` with `BLOB_READ_WRITE_TOKEN`.",
    "Wire upload UI to POST FormData to `/api/upload` and store returned URL.",
    "Add a top-of-file comment listing required env vars.",
  ],
  upstash: [
    "Initialize an Upstash Redis client in `lib/redis.ts` from `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.",
    "Wire rate-limit / cache helpers to use the client.",
    "Add a top-of-file comment listing required env vars.",
  ],
  mongodb: [
    "Add a `lib/mongodb.ts` that exports a singleton `MongoClient` connected via `MONGODB_URI`.",
    "Use the singleton in server components and route handlers; never expose the URI to the client.",
    "Add a top-of-file comment documenting `MONGODB_URI` and SSL/IP allowlist requirements.",
  ],
  resend: [
    "Add a `lib/email.ts` that initializes a Resend client from `RESEND_API_KEY`.",
    "Add `/api/contact/route.ts` (or similar) that calls `resend.emails.send(...)`.",
    "Document `RESEND_API_KEY` and `EMAIL_FROM` in a top-of-file comment.",
  ],
  openai: [
    "Initialize an OpenAI client in `lib/openai.ts` from `OPENAI_API_KEY`.",
    "Wire AI features to a server-side route handler; never expose the key to the client.",
    "Document `OPENAI_API_KEY` in a top-of-file comment.",
  ],
};

const FALLBACK_INSTRUCTIONS = (def: IntegrationDefinition): string[] => [
  `Wire ${def.name} using its standard SDK and the env keys: ${def.envVars.join(", ") || "(none required)"}.`,
  `Initialize the client in a dedicated module (e.g. \`lib/${def.key}.ts\`) and reuse the instance.`,
  `Document required env vars in a top-of-file comment.`,
];

function resolveBuildInstructions(def: IntegrationDefinition): string[] {
  const explicit = BUILD_INSTRUCTIONS[def.key];
  if (explicit && explicit.length > 0) return explicit;
  return FALLBACK_INSTRUCTIONS(def);
}

function uniqueProviderIntegrations(
  contracts: PlanContracts,
): PlanIntegrationContract[] {
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
 * Shape used to decide whether an integration is backed by a runtime-
 * installable dossier on disk. The F3 contract ("bygg integrationer") is
 * only actionable when a hard-class dossier exists that actually implements
 * the integration — otherwise F3 would ask the user for env keys that no
 * generated file would ever consume (e.g. CLERK_SECRET_KEY without any
 * clerk-auth dossier to wire it up).
 *
 * Backing is indicated by ANY of:
 *  - dossier id starts with `<integration.key>-` or equals `<key>`
 *    (e.g. stripe-checkout matches stripe)
 *  - dossier's capability equals integration.category
 *  - integration provider appears in the dossier's dependencies array
 */
interface DossierBackingMatcher {
  readonly matches: (def: IntegrationDefinition) => boolean;
  /**
   * Strict variant WITHOUT the `capability === integration.category`
   * fallback: only id-prefix and dependency matches count. Codex P1
   * (PR #383): the category fallback is right for env-CLAMPING ("no dossier
   * can consume this key") but wrong for dossier-INJECTION — a "next-auth"
   * approval must not pull in the clerk-auth dossier's verbatim templates
   * just because both live under the "auth" category.
   */
  readonly matchesStrict: (def: IntegrationDefinition) => boolean;
  readonly files: ReadonlyArray<{ path: string }>;
  /** Capability of the dossier behind this matcher (e.g. "payments"). */
  readonly capability: string;
  /** Id of the dossier behind this matcher (e.g. "stripe-checkout"). */
  readonly dossierId: string;
}

interface DossierBackingIndex {
  readonly matchers: ReadonlyArray<DossierBackingMatcher>;
}

function buildDossierBackingIndex(): DossierBackingIndex {
  const entries = getAllDossiers();
  const matchers: DossierBackingMatcher[] = [];
  for (const entry of entries) {
    const idLc = entry.id.toLowerCase();
    const capabilityLc = entry.capability.toLowerCase();
    const deps = (entry.dependencies ?? []).map((d) => d.toLowerCase());
    const matchesStrict = (def: IntegrationDefinition) => {
      const keyLc = def.key.toLowerCase();
      const providerLc = (def.provider ?? def.key).toLowerCase();
      if (idLc === keyLc || idLc.startsWith(`${keyLc}-`)) return true;
      if (idLc === providerLc || idLc.startsWith(`${providerLc}-`)) return true;
      if (deps.some((d) => d === keyLc || d.includes(`/${keyLc}`) || d.startsWith(`${keyLc}`))) {
        return true;
      }
      return false;
    };
    matchers.push({
      files: entry.files ?? [],
      capability: entry.capability,
      dossierId: entry.id,
      matchesStrict,
      matches: (def: IntegrationDefinition) => {
        if (matchesStrict(def)) return true;
        return capabilityLc === def.category.toLowerCase();
      },
    });
  }
  return { matchers };
}

function findBackingDossiers(
  def: IntegrationDefinition,
  index: DossierBackingIndex,
): DossierBackingMatcher[] {
  return index.matchers.filter((m) => m.matches(def));
}

/**
 * Any `components/**config-notice*.tsx` counts as a config-notice UI — the
 * shared `integration-config-notice.tsx` AND dossier-specific variants like
 * mongodb-atlas's `db-config-notice.tsx` (Codex P2 #445: the exact-filename
 * check made DB approvals take the "none is provided" branch and told the
 * model NOT to import the notice the dossier actually ships).
 */
const CONFIG_NOTICE_FILE_RE = /(?:^|\/)components\/(?:[\w-]*-)?config-notice\.tsx$/;

function backingDossierShipsConfigNotice(backing: DossierBackingMatcher[]): boolean {
  return backing.some((dossier) =>
    dossier.files.some((f) => CONFIG_NOTICE_FILE_RE.test(f.path)),
  );
}

function compactProviderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Map integration provider keys (as signaled by `suggestIntegration`, e.g.
 * "stripe") to the dossier capabilities that implement them (e.g.
 * "payments"). Used by the F3 approval round (P2 F3-loop, åtgärd 2) to get
 * the approved provider's hard dossier selected/injected into the build's
 * codegen context — the same `selectDossiersForRequest` mechanic the init
 * path uses, keyed off `integrationRegistry` + dossier matching rules.
 * Providers without a registry entry or backing dossier map to nothing
 * (the build instruction still forces codegen; the model just gets no
 * verbatim templates).
 *
 * Uses `matchesStrict` (id-prefix / dependency only — NOT
 * capability=category): a category-only match would inject a DIFFERENT
 * provider's dossier ("next-auth" approval → clerk-auth templates) whose
 * verbatim code and env keys don't implement the approved provider
 * (Codex P1, PR #383). The category fallback remains in `matches` for the
 * env-clamping use case in `deriveTier3BuildSpec`.
 *
 * Input keys are compact-matched (non-alphanumerics stripped) so both
 * identity-form ("vercelblob") and registry-slug ("vercel-blob") inputs
 * resolve.
 */
/**
 * A dossier can strict-back a generic provider purely via an infrastructure
 * dependency it shares with a different, more specific dossier — which would
 * inject the wrong capability's routes/templates on a plain provider approval
 * (Codex P1 dossier-batch):
 *  - paddle-billing lists `@supabase/*` as infra deps → strict-backs the generic
 *    "supabase" provider into the unrelated `subscriptions` capability.
 *  - rag-chat shares `@ai-sdk/openai` with ai-chat → strict-backs "openai" into
 *    `rag-chat`.
 * Both extra capabilities must inject ONLY on explicit capability selection
 * (the init/follow-up path), never off a generic provider approval in F3.
 */
function isSuppressedProviderBacking(
  providerCompact: string,
  capability: string,
): boolean {
  if (providerCompact === "supabase" && capability === "subscriptions") return true;
  if (providerCompact === "openai" && capability === "rag-chat") return true;
  // supabase-auth's id ("supabase-*") id-prefix-matches the generic "supabase"
  // DATA provider, so approving Supabase for storage/database would otherwise
  // inject auth middleware/callback/client (Codex P1 dossier-batch). Supabase
  // Auth enters only via explicit `supabase-auth` capability selection.
  if (providerCompact === "supabase" && capability === "supabase-auth") return true;
  return false;
}

export function mapProviderKeysToDossierCapabilities(
  providerKeys: string[],
): string[] {
  const capabilities = new Set<string>();
  if (providerKeys.length === 0) return [];
  const backingIndex = buildDossierBackingIndex();
  for (const raw of providerKeys) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const compact = compactProviderKey(raw);
    const def = findRegistryDefinitionByProviderKey(raw);
    if (!def) continue;
    for (const matcher of backingIndex.matchers) {
      if (
        matcher.matchesStrict(def) &&
        !isSuppressedProviderBacking(compact, matcher.capability)
      ) {
        capabilities.add(matcher.capability);
      }
    }
  }
  return Array.from(capabilities);
}

/**
 * DOSSIER-ID variant of {@link mapProviderKeysToDossierCapabilities} — same
 * strict matching + suppression, but returns the backing dossier ids. Needed
 * where capability granularity is too coarse: version-presence comparisons
 * (Codex P1 on #503) must not treat a present SIBLING dossier
 * (`postgres-drizzle` under `database`) as satisfying a newly approved
 * provider (`mongodb` → `mongodb-atlas`).
 */
export function mapProviderKeysToBackingDossierIds(
  providerKeys: string[],
): string[] {
  const ids = new Set<string>();
  if (providerKeys.length === 0) return [];
  const backingIndex = buildDossierBackingIndex();
  for (const raw of providerKeys) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const compact = compactProviderKey(raw);
    const def = findRegistryDefinitionByProviderKey(raw);
    if (!def) continue;
    for (const matcher of backingIndex.matchers) {
      if (
        matcher.matchesStrict(def) &&
        !isSuppressedProviderBacking(compact, matcher.capability)
      ) {
        ids.add(matcher.dossierId);
      }
    }
  }
  return Array.from(ids);
}

/**
 * Registry-resolvable provider keys (canonical `def.key`) that have ZERO
 * strict backing dossiers. These providers (e.g. `posthog`,
 * `google-analytics`) can be legitimately approved via `suggestIntegration`
 * but have no dossier templates to inject — an approve round must still run
 * the GENERIC LLM build path for them (coach review on #503: a deterministic
 * exact-file fork would silently ship zero integration code). Unknown keys
 * (no registry definition) are skipped — they cannot be built deterministically
 * or generically and are handled by the approval prompt's fallback contract.
 */
export function providerKeysWithoutBackingDossier(
  providerKeys: string[],
): string[] {
  const keys = new Set<string>();
  if (providerKeys.length === 0) return [];
  const backingIndex = buildDossierBackingIndex();
  for (const raw of providerKeys) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const compact = compactProviderKey(raw);
    const def = findRegistryDefinitionByProviderKey(raw);
    if (!def) continue;
    const hasBacking = backingIndex.matchers.some(
      (matcher) =>
        matcher.matchesStrict(def) &&
        !isSuppressedProviderBacking(compact, matcher.capability),
    );
    if (!hasBacking) keys.add(def.key.toLowerCase());
  }
  return Array.from(keys);
}

/** Build F3 requirements directly from explicit provider approvals. */
export function deriveTier3BuildSpecForProviderKeys(
  providerKeys: readonly string[],
): Tier3BuildSpec {
  const integrations: PlanIntegrationContract[] = [];
  const seen = new Set<string>();
  for (const providerKey of providerKeys) {
    const definition = findRegistryDefinitionByProviderKey(providerKey);
    if (!definition || seen.has(definition.key)) continue;
    seen.add(definition.key);
    integrations.push({
      provider: definition.provider ?? definition.key,
      name: definition.name,
      reason: "explicitly approved for this F3 build",
      status: "chosen",
      envVars: definition.envVars,
    });
  }
  return deriveTier3BuildSpec({
    dataMode: "none",
    integrations,
    envVars: [],
  });
}

function findRegistryDefinitionByProviderKey(
  raw: string,
): IntegrationDefinition | undefined {
  const compact = compactProviderKey(raw);
  if (!compact) return undefined;
  return integrationRegistry.find(
    (d) =>
      compactProviderKey(d.key) === compact ||
      compactProviderKey(d.provider ?? d.key) === compact,
  );
}

/**
 * True when at least one approved provider's STRICT-matched backing dossier
 * ships the shared `integration-config-notice.tsx` component (Codex P2,
 * PR #383): the F3 approval prompt may only instruct the model to render
 * "the dossier's config-notice UI" when that file actually exists in the
 * injected templates — providers like Clerk/OpenAI have hard dossiers
 * without it, and the instruction would make the model import a component
 * that is never emitted (build break).
 */
export function approvedProvidersShipConfigNotice(providerKeys: string[]): boolean {
  if (providerKeys.length === 0) return false;
  const backingIndex = buildDossierBackingIndex();
  for (const raw of providerKeys) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const compact = compactProviderKey(raw);
    const def = findRegistryDefinitionByProviderKey(raw);
    if (!def) continue;
    // Same suppression as mapProviderKeysToDossierCapabilities: a capability
    // that only strict-backs the provider via a shared infra dep is NOT
    // injected, so its config-notice file must not be advertised here either
    // (otherwise the F3 prompt tells the model to render a component that was
    // never emitted → build break).
    const strictBacking = backingIndex.matchers.filter(
      (m) => m.matchesStrict(def) && !isSuppressedProviderBacking(compact, m.capability),
    );
    if (backingDossierShipsConfigNotice(strictBacking)) return true;
  }
  return false;
}

/**
 * Build a Tier-3 spec from the contracts the orchestrator already inferred.
 * Only `chosen` (or unresolved-but-named) integrations contribute; `optional`
 * integrations without a status are skipped because the user hasn't asked
 * for them yet.
 */
export function deriveTier3BuildSpec(
  contracts: PlanContracts,
): Tier3BuildSpec {
  const requirements: Tier3IntegrationRequirement[] = [];
  const backingIndex = buildDossierBackingIndex();

  for (const integration of uniqueProviderIntegrations(contracts)) {
    if (integration.status === "optional") continue;
    const def = findIntegrationDefinition(integration);
    if (!def) continue;

    const envKeys = integration.envVars && integration.envVars.length > 0
      ? integration.envVars
      : def.envVars;
    const { harmless, tier3 } = partitionEnvKeysByTier(envKeys);

    // PlanContracts may carry per-key enforcement (added to the schema in
    // P31). When absent (older callers / legacy snapshots) every tier-3
    // key falls back to `"build"` — the conservative pre-P31 default.
    const enforcementHint = integration.envEnforcement;
    const featureRuntimeEnvKeys = enforcementHint
      ? tier3.filter((k) => enforcementHint[k] === "feature-runtime")
      : [];
    const warnOnlyEnvKeys = enforcementHint
      ? tier3.filter((k) => enforcementHint[k] === "warn-only")
      : [];
    let buildEnforcedTier3 = tier3.filter(
      (k) => !featureRuntimeEnvKeys.includes(k) && !warnOnlyEnvKeys.includes(k),
    );
    let effectiveWarnOnly = warnOnlyEnvKeys;

    // Clamp against dossier-backing: if no hard-/soft-dossier implements this
    // integration, we cannot generate code that consumes its env keys. F3
    // asking for a real CLERK_SECRET_KEY when no clerk-auth dossier exists
    // would block the build on a value no generated file would ever use.
    // Downgrade to warn-only so the UI still surfaces the expected vars but
    // F3 validation doesn't refuse to start.
    const backingDossiers = findBackingDossiers(def, backingIndex);
    if (backingDossiers.length === 0 && buildEnforcedTier3.length > 0) {
      effectiveWarnOnly = [...warnOnlyEnvKeys, ...buildEnforcedTier3];
      buildEnforcedTier3 = [];
    }

    // Config-notice advertisement must exclude backing that only exists via a
    // suppressed capability (e.g. paddle-billing strict-backs the generic
    // "supabase" provider through its `@supabase/*` infra deps, shipping
    // `subscription-config-notice.tsx`). That dossier is NOT injected on a
    // plain provider approval, so advertising its config-notice would tell the
    // F3 model to render a component that was never emitted → build break.
    // Mirrors the suppression in `approvedProvidersShipConfigNotice`; the
    // env-clamping use of `backingDossiers` above stays unsuppressed since a
    // suppressed dossier still legitimately "backs nothing" for that clamp.
    const defProviderCompact = compactProviderKey(def.provider ?? def.key);
    const defKeyCompact = compactProviderKey(def.key);
    // STRICT match required (Codex P1 on #506): `backingDossiers` uses the
    // category fallback (right for the env-clamp above), but config-notice
    // advertisement must mirror INJECTION semantics — a category sibling
    // (contentful → sanity-cms under "cms") is never injected on a provider
    // approval, so advertising its notice file would make the model import a
    // component that was never emitted (build break).
    const configNoticeBacking = backingDossiers.filter(
      (m) =>
        m.matchesStrict(def) &&
        !isSuppressedProviderBacking(defProviderCompact, m.capability) &&
        !isSuppressedProviderBacking(defKeyCompact, m.capability),
    );

    requirements.push({
      key: def.key,
      name: def.name,
      provider: def.provider ?? def.key,
      requiredRealEnvKeys: buildEnforcedTier3,
      placeholderOkEnvKeys: harmless,
      featureRuntimeEnvKeys,
      warnOnlyEnvKeys: effectiveWarnOnly,
      buildInstructions: resolveBuildInstructions(def),
      setupGuide: def.setupGuide,
      hasConfigNoticeComponent: backingDossierShipsConfigNotice(configNoticeBacking),
    });
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
    ...(placeholderUsedByIntegration.length > 0
      ? { placeholderUsedByIntegration }
      : {}),
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
    "You are now in F3 (\"bygg integrationer\"). Wire each integration below end-to-end.",
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

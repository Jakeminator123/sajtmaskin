/**
 * Deterministic dossier selection.
 *
 * Algorithm:
 *   1. Read `requestedCapabilities` (from explicit option or `brief.requestedCapabilities`).
 *   2. For each capability, find matching dossiers via `getDossiersByCapability`.
 *   3. If multiple match: an explicit `relevanceKeywords` hit in `promptText`
 *      (when provided) overrides the default — e.g. "MongoDB" picks
 *      mongodb-atlas even though postgres-drizzle is the `database` default.
 *      Otherwise pick the one with `defaultForCapability=true`, else the
 *      first by id-sort.
 *   4. For hard dossiers, check `process.env` for required envVars
 *      → mark `configured: true|false`. Hard+unconfigured still injects code,
 *      the system prompt instructs the codegen LLM to render an
 *      "unconfigured" placeholder UI.
 *   5. Eagerly load `instructions.md` for selected dossiers (small files).
 *
 * No embeddings. No fuzzy match. No domain-veto. No caps. No boost.
 * What the brief asks for is what gets injected. The keyword override is a
 * deterministic string match, not a ranking — callers that cannot supply the
 * prompt (dep-completer backstop, snapshot re-selection) simply get the
 * capability default.
 */
import {
  getAllDossiers,
  getDossierInstructions,
  getDossiersByCapability,
} from "./registry";
import type { DossierEntry, DossierSelectionResult, SelectedDossier } from "./types";

export interface SelectDossiersOptions {
  /** Explicit capability list (preferred). */
  requestedCapabilities?: string[];
  /** Fallback: read `requestedCapabilities` off the brief object. */
  brief?: Record<string, unknown> | null;
  /**
   * Optional raw prompt text used ONLY to disambiguate sibling dossiers that
   * share a capability, via their manifest `relevanceKeywords` (e.g. an
   * explicit "MongoDB" ask picks mongodb-atlas over the postgres-drizzle
   * default under `database`). Absent → the `defaultForCapability` pick.
   */
  promptText?: string | null;
  /**
   * Env keys the CURRENT PROJECT has stored a real value for (from
   * `getStoredProjectEnvVarMap`). Drives the `configured` flag: a hard
   * dossier is `configured` only when all its required env keys are in this
   * set. Callers with a projectId must resolve this in the caller (the map is
   * async; `select.ts` stays sync) and pass it in.
   *
   * When omitted, `configured` falls back to reading the PLATFORM'S
   * `process.env` — a deprecated fallback kept only for callers that cannot
   * supply a project env map (e.g. dep-completer backstop). That fallback is
   * wrong for user projects (Sajtmaskin's own keys leak in), which is exactly
   * the bug `configuredEnvKeys` fixes; prefer always passing it.
   */
  configuredEnvKeys?: ReadonlySet<string>;
  /**
   * F3 capability-scope (review round 2): when the caller COMPUTED
   * `requestedCapabilities` (the scoped F3 set) an EMPTY list is an
   * intentional answer — "nothing should be wired this round". The legacy
   * brief fallback would resurrect every speculative brief capability in
   * exactly the case the scope exists to prevent, turning the whole
   * inflation fix into a no-op. Set `true` to disable the fallback; default
   * `false` keeps legacy behavior for callers whose empty list means
   * "unknown, read the brief".
   */
  disableBriefFallback?: boolean;
}

/**
 * Legacy capability aliases. Old persisted snapshots/briefs (and older
 * follow-up vocabulary hits) can still carry these ids; they normalize to the
 * current capability so selection keeps resolving instead of silently
 * skipping. Taxonomy 2026-07-22: `supabase-auth` merged into `auth` (one
 * capability, two provider dossiers — clerk-auth default, supabase-auth via
 * keyword/pin), and `command-search` renamed to `command-palette`.
 */
export const CAPABILITY_ALIASES: Readonly<Record<string, string>> = {
  "supabase-auth": "auth",
  "command-search": "command-palette",
};

/**
 * Dossier pins for aliased capabilities: a legacy `supabase-auth` request
 * meant the Supabase dossier SPECIFICALLY, so after normalizing to `auth` the
 * pick must stay `supabase-auth` (not the clerk-auth capability default).
 */
const ALIAS_DOSSIER_PINS: Readonly<Record<string, string>> = {
  "supabase-auth": "supabase-auth",
};

/**
 * Dependent capabilities: selecting the KEY capability only produces a working
 * feature if the VALUE capabilities ship alongside it. Applied by BOTH
 * selection (`selectDossiersForRequest`) and the prompt-capability filter
 * (`filterDossierCapabilitiesForPrompt` in orchestrate.ts) so every selection
 * path — init, follow-up, snapshot re-selection, dep-completer — pulls the
 * full stack.
 *
 * `subscriptions` ⇒ `auth` PINNED to the `supabase-auth` dossier (Codex P1
 * #475, re-expressed after the auth-capability merge): paddle-billing's
 * customer-portal route requires a signed-in Supabase user; without the
 * supabase-auth dossier the generated app has no middleware/callback/sign-in
 * surface, so the portal path is unreachable (always 401). The pin overrides
 * both the capability default (clerk-auth) and prompt keywords — a
 * subscriptions round must never ship Clerk. Collision-free by construction:
 * paddle-billing ships no root middleware and namespaces its Supabase helpers
 * under `lib/paddle/`.
 */
const DEPENDENT_CAPABILITIES: Record<
  string,
  readonly { capability: string; pinDossierId?: string }[]
> = {
  subscriptions: [{ capability: "auth", pinDossierId: "supabase-auth" }],
};

/**
 * Returns `capabilities` plus any dependent capabilities (deduped, input order
 * preserved, dependencies appended), with overlapping picks resolved.
 * Callers should alias-normalize first (`normalizeCapabilityId`); this
 * function also normalizes defensively so raw callers with legacy ids get the
 * same result.
 */
export function expandDependentCapabilities(capabilities: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const cap of capabilities.map(normalizeCapabilityId)) {
    if (seen.has(cap)) continue;
    seen.add(cap);
    normalized.push(cap);
  }
  const out = [...normalized];
  for (const cap of normalized) {
    for (const dep of DEPENDENT_CAPABILITIES[cap] ?? []) {
      if (!seen.has(dep.capability)) {
        seen.add(dep.capability);
        out.push(dep.capability);
      }
    }
  }
  let result = out;
  // `ai-tool-calling` (an AI assistant that calls server-side tools) and
  // `ai-chat` (a generic chatbot) are overlapping chat surfaces — the brief LLM
  // routinely nominates both for a single "AI assistant" ask, which injects two
  // competing chat routes/components (ai-tool-calling-chat's `/api/assistant` +
  // openai-chat's `/api/chat`) and doubles the env/scope. The more specific
  // `ai-tool-calling` wins; generic `ai-chat` is dropped. (The former
  // supabase-auth vs auth dedup is obsolete: both dossiers now share the
  // `auth` capability, so selection picks exactly one — never two colliding
  // root middlewares.)
  if (seen.has("ai-tool-calling") && seen.has("ai-chat")) {
    result = result.filter((cap) => cap !== "ai-chat");
  }
  return result;
}

/** Normalize a capability id through the legacy alias map (lowercased). */
export function normalizeCapabilityId(capability: string): string {
  const cap = String(capability).trim().toLowerCase();
  return CAPABILITY_ALIASES[cap] ?? cap;
}

/**
 * Dossier pins for the given (already alias-normalized) capability set:
 * capability → dossier id that MUST win selection. Sources: legacy alias pins
 * (`supabase-auth` → auth pinned to the Supabase dossier) and dependency pins
 * (`subscriptions` ⇒ auth pinned to supabase-auth). Later sources never
 * overwrite an earlier pin for the same capability.
 */
function resolveDossierPins(rawCapabilities: string[]): Map<string, string> {
  const pins = new Map<string, string>();
  for (const raw of rawCapabilities) {
    const cap = String(raw).trim().toLowerCase();
    const pin = ALIAS_DOSSIER_PINS[cap];
    if (pin) {
      const normalized = normalizeCapabilityId(cap);
      if (!pins.has(normalized)) pins.set(normalized, pin);
    }
  }
  for (const raw of rawCapabilities.map(normalizeCapabilityId)) {
    for (const dep of DEPENDENT_CAPABILITIES[raw] ?? []) {
      if (dep.pinDossierId && !pins.has(dep.capability)) {
        pins.set(dep.capability, dep.pinDossierId);
      }
    }
  }
  return pins;
}

/**
 * Public wrapper around the internal `configured` computation so other
 * selection sources that build {@link SelectedDossier} objects directly (e.g.
 * `version-presence.ts`, which resolves dossiers from a version's actual files
 * rather than by capability) compute the `configured` prompt signal exactly
 * the same way `selectDossiersForRequest` does — no duplicated logic.
 */
export function isDossierConfigured(
  entry: DossierEntry,
  configuredEnvKeys?: ReadonlySet<string>,
): boolean {
  return isConfigured(entry, configuredEnvKeys);
}

function isConfigured(
  entry: DossierEntry,
  configuredEnvKeys?: ReadonlySet<string>,
): boolean {
  if (!entry.envVars || entry.envVars.length === 0) return true;
  for (const ev of entry.envVars) {
    if (!ev.required) continue;
    if (configuredEnvKeys) {
      // Project-scoped source of truth: the key has a real stored value.
      if (!configuredEnvKeys.has(ev.key)) return false;
      continue;
    }
    // Deprecated fallback: platform process.env (wrong for user projects).
    const value = process.env[ev.key];
    if (!value || value.trim().length === 0) return false;
  }
  return true;
}

function normalizeCapabilities(opts: SelectDossiersOptions): string[] {
  const fromArg = (opts.requestedCapabilities ?? [])
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);
  if (fromArg.length > 0) return Array.from(new Set(fromArg));
  // Caller-computed capability set (F3 scope): an empty list is the answer,
  // not a missing value — never resurrect the brief's speculative set.
  if (opts.disableBriefFallback) return [];
  const briefCaps =
    opts.brief && typeof opts.brief === "object"
      ? (opts.brief as { requestedCapabilities?: unknown }).requestedCapabilities
      : null;
  if (Array.isArray(briefCaps)) {
    return Array.from(
      new Set(briefCaps.map((s) => String(s).trim().toLowerCase()).filter(Boolean)),
    );
  }
  return [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when the prompt contains one of the dossier's `relevanceKeywords` as a
 * standalone word/phrase. Unicode-aware boundaries; the hyphen is treated as
 * part of the word on purpose so a compound like "neon-skylt" (neon sign)
 * does NOT hit the bare "neon" keyword, while "Neon Postgres", "neon.tech"
 * and "använd Neon" still do. Spaces inside a multi-word keyword match
 * space-or-hyphen so hyphenated provider forms ("mongodb-atlas",
 * "neon-postgres") hit the same keyword as the spaced form (Codex P2 on
 * PR #445). Precision over recall — a miss falls back to the capability
 * default, which is always a working implementation.
 *
 * The dossier's own `id` counts as an implicit keyword (Bugbot on #482): the
 * Byggblock catalog sends `Lägg till byggblocket "<label>" (id: <id>)`, and
 * an explicitly picked SIBLING (e.g. `plausible-analytics` when
 * `vercel-analytics` is the capability default) must win over the default
 * even when its manifest keywords don't appear in the label. Ids are unique
 * slugs, so a verbatim id in the prompt is always explicit intent.
 */
function matchesRelevanceKeyword(entry: DossierEntry, promptText: string): boolean {
  for (const keyword of [entry.id, ...(entry.relevanceKeywords ?? [])]) {
    const source = escapeRegExp(keyword.trim()).replace(/ +/g, "[\\s-]+");
    if (!source) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}_-])${source}(?![\\p{L}\\p{N}_-])`, "iu");
    if (re.test(promptText)) return true;
  }
  return false;
}

function pickForCapability(
  cap: string,
  promptText: string | null,
  pinnedDossierId?: string,
): {
  entry: DossierEntry;
  reason: SelectedDossier["reason"];
} | null {
  const candidates = getDossiersByCapability(cap);
  if (candidates.length === 0) return null;
  // Sort first so both the default-search and the fallback are deterministic
  // even if two dossiers accidentally have defaultForCapability=true (last-
  // touched-wins in dirent iteration is undesirable cross-machine).
  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  // A dependency/alias pin beats everything — the dependent feature only
  // works with this specific sibling (e.g. subscriptions ⇒ supabase-auth),
  // so neither the capability default nor a prompt keyword may override it.
  if (pinnedDossierId) {
    const pinned = sorted.find((c) => c.id === pinnedDossierId);
    if (pinned) return { entry: pinned, reason: "dependency-pin" };
  }
  // Explicit provider intent beats the capability default: when the prompt
  // hits a sibling's relevanceKeywords ("MongoDB", "Neon"), that sibling is
  // what the user asked for. Deterministic on multi-hit: prefer the default
  // if it also matched, else the first match by id-sort.
  if (promptText && sorted.length > 1) {
    const keywordMatches = sorted.filter((c) => matchesRelevanceKeyword(c, promptText));
    if (keywordMatches.length > 0) {
      const matchedDefault = keywordMatches.find((c) => c.defaultForCapability);
      return { entry: matchedDefault ?? keywordMatches[0], reason: "relevance-keyword" };
    }
  }
  const defaults = sorted.filter((c) => c.defaultForCapability);
  if (defaults.length > 1) {
    console.warn(
      `[dossiers] capability '${cap}' has ${defaults.length} dossiers with defaultForCapability=true: ${defaults
        .map((d) => d.id)
        .join(", ")}. Picking '${defaults[0].id}' deterministically.`,
    );
  }
  if (defaults[0]) return { entry: defaults[0], reason: "capability-match" };
  return { entry: sorted[0], reason: "default-fallback" };
}

export function selectDossiersForRequest(
  opts: SelectDossiersOptions,
): DossierSelectionResult {
  const all = getAllDossiers();
  const rawCapabilities = normalizeCapabilities(opts);
  const pins = resolveDossierPins(rawCapabilities);
  const capabilities = expandDependentCapabilities(rawCapabilities);
  const promptText =
    typeof opts.promptText === "string" && opts.promptText.trim().length > 0
      ? opts.promptText
      : null;

  const selected: SelectedDossier[] = [];
  const byCapability: Record<string, string[]> = {};

  for (const cap of capabilities) {
    const pick = pickForCapability(cap, promptText, pins.get(cap));
    if (!pick) continue;
    const entry: DossierEntry = {
      ...pick.entry,
      instructions:
        pick.entry.instructions || getDossierInstructions(pick.entry.class, pick.entry.id),
    };
    selected.push({
      entry,
      reason: pick.reason,
      configured: isConfigured(entry, opts.configuredEnvKeys),
    });
    (byCapability[cap] ??= []).push(entry.id);
  }

  return {
    selected,
    poolSize: all.length,
    byCapability,
  };
}

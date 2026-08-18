/**
 * Deterministic dossier selection.
 *
 * Algorithm:
 *   1. Read `requestedCapabilities` (from explicit option or `brief.requestedCapabilities`).
 *   2. For each capability, find matching dossiers via `getDossiersByCapability`.
 *   3. If multiple match: drop siblings negated in `promptText` («inte X»,
 *      «utan X», «byt från X», «not X», «without X», «switch from X») first.
 *      A single remaining keyword/provider hit overrides the default — e.g.
 *      "logga in med supabase" picks supabase-auth even though clerk-auth
 *      is the `auth` default (`relevance-keyword`). Ambiguous multi-hit,
 *      unknown provider, or every sibling negated falls to the capability
 *      default with `capability-match` so the pick never looks explicit.
 *      Otherwise pick `defaultForCapability=true`, else the first by id-sort.
 *   4. For hard dossiers, `configured` is true only when every required
 *      env key is in the caller-supplied `configuredEnvKeys` set. Omitted
 *      set → `configured: false` (never the host process environment).
 *      Hard+unconfigured still injects code; the system prompt tells the
 *      codegen LLM to render an "unconfigured" placeholder UI.
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
   * explicit "logga in med supabase" ask picks supabase-auth over the
   * clerk-auth default under `auth`). Absent → the `defaultForCapability` pick.
   */
  promptText?: string | null;
  /**
   * Env keys the CURRENT PROJECT has stored a real value for (from
   * `getStoredProjectEnvVarMap`). Drives the `configured` flag: a hard
   * dossier is `configured` only when all its required env keys are in this
   * set. Callers with a projectId must resolve this in the caller (the map is
   * async; `select.ts` stays sync) and pass it in.
   *
   * When omitted, hard dossiers with required env are `configured: false`
   * (a false negative). We never read the host process environment —
   * Sajtmaskin's own keys must not leak into a user project's signal.
   * Callers that consume `configured` must pass the project set.
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
 * EMPTY since 2026-08-06: the only entry ever needed was `subscriptions` ⇒
 * `auth` pinned to supabase-auth (paddle-billing's customer portal), and it
 * left with the parked paddle-billing dossier (2026-08-06; träd borttaget
 * 2026-08-10 — git-historik). The mechanism stays because
 * dossiers must remain self-sufficient in F2 — add an entry here only when a
 * dossier's F3 surface genuinely cannot work without a companion capability,
 * never as a convenience bundle.
 */
const DEPENDENT_CAPABILITIES: Record<
  string,
  readonly { capability: string; pinDossierId?: string }[]
> = {};

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
  // Alias-normalization + empty DEPENDENT_CAPABILITIES expansion only.
  // The former ai-tool-calling ⇒ drop ai-chat dedup died with etapp 4
  // (ai-tool-calling-chat / rag-chat parked 2026-08-06).
  return out;
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
 * (from `DEPENDENT_CAPABILITIES`, currently empty). Later sources never
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
  const required = entry.envVars.filter((ev) => ev.required);
  if (required.length === 0) return true;
  // No project set → false negative. Never read the host process environment.
  if (!configuredEnvKeys) return false;
  for (const ev of required) {
    if (!configuredEnvKeys.has(ev.key)) return false;
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
 * Markers that identify a sibling in prompt text: dossier id, manifest
 * `relevanceKeywords`, and `providers` (clerk-auth has no keywords, so
 * «inte Clerk» / «jämför clerk och …» resolve via `providers: ["clerk"]`).
 */
function collectDossierMarkers(entry: DossierEntry): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [entry.id, ...(entry.relevanceKeywords ?? []), ...(entry.providers ?? [])]) {
    const marker = raw.trim();
    if (!marker) continue;
    const key = marker.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(marker);
  }
  return out;
}

function markerSource(marker: string): string {
  return escapeRegExp(marker.trim()).replace(/ +/g, "[\\s-]+");
}

/**
 * Unicode-aware standalone-word match. Hyphen is part of the word so a
 * compound like "neon-skylt" does NOT hit a bare "neon" marker. Spaces
 * inside a multi-word marker match space-or-hyphen so "supabase-auth"
 * hits the same keyword as "supabase auth".
 */
function matchesMarker(promptText: string, marker: string): boolean {
  const source = markerSource(marker);
  if (!source) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}_-])${source}(?![\\p{L}\\p{N}_-])`, "iu");
  return re.test(promptText);
}

/**
 * True when the prompt contains one of the dossier's markers as a
 * standalone word/phrase. Precision over recall — a miss falls back to
 * the capability default, which is always a working implementation.
 *
 * The dossier's own `id` counts as an implicit keyword (Bugbot on #482): the
 * Byggblock catalog sends `Lägg till byggblocket "<label>" (id: <id>)`, and
 * an explicitly picked SIBLING (e.g. `plausible-analytics` when
 * `vercel-analytics` is the capability default) must win over the default
 * even when its manifest keywords don't appear in the label. Ids are unique
 * slugs, so a verbatim id in the prompt is always explicit intent.
 */
function matchesRelevanceKeyword(entry: DossierEntry, promptText: string): boolean {
  return collectDossierMarkers(entry).some((marker) => matchesMarker(promptText, marker));
}

/**
 * Immediate negation prefixes (sv/en). X is a sibling marker; only the
 * following whitespace-separated token/phrase is excluded — «inte använda
 * Clerk» does not count (X must follow the prefix directly).
 */
const NEGATION_PREFIX = String.raw`(?:inte|utan|not|without|byt\s+från|switch\s+from)`;

function isMarkerNegated(promptText: string, marker: string): boolean {
  const source = markerSource(marker);
  if (!source) return false;
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_-])${NEGATION_PREFIX}\\s+${source}(?![\\p{L}\\p{N}_-])`,
    "iu",
  );
  return re.test(promptText);
}

function isDossierNegated(entry: DossierEntry, promptText: string): boolean {
  return collectDossierMarkers(entry).some((marker) => isMarkerNegated(promptText, marker));
}

function pickCapabilityDefault(
  cap: string,
  pool: DossierEntry[],
  reason: "capability-match" | "default-fallback" = "capability-match",
): { entry: DossierEntry; reason: SelectedDossier["reason"] } {
  const defaults = pool.filter((c) => c.defaultForCapability);
  if (defaults.length > 1) {
    console.warn(
      `[dossiers] capability '${cap}' has ${defaults.length} dossiers with defaultForCapability=true: ${defaults
        .map((d) => d.id)
        .join(", ")}. Picking '${defaults[0].id}' deterministically.`,
    );
  }
  if (defaults[0]) return { entry: defaults[0], reason: "capability-match" };
  return { entry: pool[0], reason };
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
  // A dependency/alias pin beats everything — the pinned request only works
  // with this specific sibling (e.g. legacy `supabase-auth` ⇒ the Supabase
  // dossier under `auth`), so neither the capability default nor a prompt
  // keyword may override it.
  if (pinnedDossierId) {
    const pinned = sorted.find((c) => c.id === pinnedDossierId);
    if (pinned) return { entry: pinned, reason: "dependency-pin" };
  }
  // Explicit provider intent beats the capability default — but only when
  // the hit is unambiguous. Negated siblings leave the pool first; a single
  // remaining keyword hit keeps `relevance-keyword`. Two or more hits are
  // ambiguous and must NOT look explicit (`isExplicitDossierChoice`).
  if (promptText && sorted.length > 1) {
    const remaining = sorted.filter((c) => !isDossierNegated(c, promptText));
    if (remaining.length === 0) {
      // Every sibling negated: a working default over nothing. Selection
      // is a prompt signal, not a gate.
      return pickCapabilityDefault(cap, sorted);
    }
    const keywordMatches = remaining.filter((c) => matchesRelevanceKeyword(c, promptText));
    if (keywordMatches.length === 1) {
      return { entry: keywordMatches[0], reason: "relevance-keyword" };
    }
    if (keywordMatches.length > 1) {
      // Ambiguous — but never let a NEGATED default win the fallback: pick
      // from the non-negated pool («inte clerk; supabase eller authjs»).
      return pickCapabilityDefault(cap, remaining);
    }
    // Zero keyword hits. If negation removed someone («auth utan clerk»),
    // pick from the leftover pool so the excluded sibling cannot win.
    if (remaining.length < sorted.length) {
      return pickCapabilityDefault(cap, remaining);
    }
  }
  return pickCapabilityDefault(cap, sorted, "default-fallback");
}

/**
 * Sant när valet speglar ett faktiskt VAL, inte capability-defaulten.
 *
 * Anropare som PERSISTERAR syskonidentitet måste filtrera på detta. Ett
 * persisterat default-id går inte att skilja från "användaren valde det här
 * syskonet", så det skriver över ett tidigare uttryckligt val nästa gång
 * capability:n råkar följa med utan providerhint i prompten.
 */
export function isExplicitDossierChoice(reason: SelectedDossier["reason"]): boolean {
  return reason === "relevance-keyword" || reason === "dependency-pin";
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

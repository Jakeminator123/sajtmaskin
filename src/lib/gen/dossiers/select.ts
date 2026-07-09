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
}

/**
 * Dependent capabilities: selecting the KEY capability only produces a working
 * feature if the VALUE capabilities ship alongside it. Applied by BOTH
 * selection (`selectDossiersForRequest`) and the prompt-capability filter
 * (`filterDossierCapabilitiesForPrompt` in orchestrate.ts) so every selection
 * path — init, follow-up, snapshot re-selection, dep-completer — pulls the
 * full stack.
 *
 * `subscriptions` ⇒ `supabase-auth` (Codex P1 #475): paddle-billing's
 * customer-portal route requires a signed-in Supabase user; without the
 * supabase-auth dossier the generated app has no middleware/callback/sign-in
 * surface, so the portal path is unreachable (always 401). Collision-free by
 * construction: paddle-billing ships no root middleware and namespaces its
 * Supabase helpers under `lib/paddle/`.
 */
const DEPENDENT_CAPABILITIES: Record<string, readonly string[]> = {
  subscriptions: ["supabase-auth"],
};

/**
 * Returns `capabilities` plus any dependent capabilities (deduped, input order
 * preserved, dependencies appended), then resolves hard file conflicts:
 * `supabase-auth` and generic `auth` (clerk-auth) both emit a root
 * `middleware.ts`, so whenever the Supabase stack is present — explicitly or
 * via a dependency — generic `auth` is dropped (bugbot high, dossier-batch:
 * the orchestrate prompt-filter already had this dedup, but raw callers of
 * selectDossiersForRequest — snapshot re-selection, dossiers route — could
 * still pass both and select two colliding root middlewares).
 */
export function expandDependentCapabilities(capabilities: string[]): string[] {
  const out = [...capabilities];
  const seen = new Set(out);
  for (const cap of capabilities) {
    for (const dep of DEPENDENT_CAPABILITIES[cap] ?? []) {
      if (!seen.has(dep)) {
        seen.add(dep);
        out.push(dep);
      }
    }
  }
  if (seen.has("supabase-auth") && seen.has("auth")) {
    return out.filter((cap) => cap !== "auth");
  }
  return out;
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
  const capabilities = expandDependentCapabilities(normalizeCapabilities(opts));
  const promptText =
    typeof opts.promptText === "string" && opts.promptText.trim().length > 0
      ? opts.promptText
      : null;

  const selected: SelectedDossier[] = [];
  const byCapability: Record<string, string[]> = {};

  for (const cap of capabilities) {
    const pick = pickForCapability(cap, promptText);
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

/**
 * Search-driven UI Recipe candidate generation (Fas 4)
 * ====================================================
 *
 * Replaces the resolver's former hardcoded candidate lists (`login-03`,
 * `dashboard-01`, …) with Registry Discovery: capability signals + prompt
 * keywords become search queries that are fuzzy-matched (deterministically,
 * NO LLM calls — this runs in the orchestration critical path) against the
 * official registry INDEX and the community registries from `components.json`
 * (item catalog seeded by `config/community-registries.json`).
 *
 * Plan: docs/plans/avklarat/2026-07-22-shadcn-registry-beskriv-komposition.md.
 *
 * Guarantees:
 * - Deterministic: same capabilities + prompt + index → same candidates
 *   (stable sorts; community variation via the same DJB-hash
 *   `pickDeterministic` the legacy path used).
 * - Reversible: `SAJTMASKIN_SHADCN_RESOLVER_SEARCH` default ON in runtime
 *   (OFF under NODE_ENV=test); explicit `0`/`false` restores the legacy
 *   hardcoded candidates exactly.
 * - Degrading: index fetch failure/timeout → the caller falls back to the
 *   legacy hardcoded candidates. Network errors never produce empty output
 *   that the legacy path would have filled.
 */

import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";
import {
  loadCommunitySeedEntries,
  loadDescribeCommunityRegistries,
  matchOfficialIndex,
  scoreText,
  tokenize,
  withTimeout,
  type CommunityRegistryDescriptor,
  type CommunitySeedEntry,
} from "@/lib/shadcn/registry-search";
import {
  fetchRegistryIndex,
  type RegistryIndex,
  type RegistryIndexItem,
} from "@/lib/shadcn/registry-service";
import {
  buildRegistryCacheKey,
  getRegistryMemoryCache,
} from "@/lib/shadcn/registry-memory-cache";
import { debugLog } from "@/lib/utils/debug";
import type { InferredCapabilities } from "../capability-inference";

// ============================================================================
// FEATURE FLAG
// ============================================================================

const DISABLED_ENV_VALUES = new Set(["0", "false", "no", "n", "off"]);

/**
 * Fas 4 flag: search-driven candidate generation in `resolveShadcnUiRecipes`.
 *
 * Default ON in runtime environments; explicit `0`/`false` (or any disabled
 * token) restores the legacy hardcoded candidate lists exactly. Tests default
 * OFF (mirrors `FEATURES.useDossierPipeline`) so existing fixtures keep their
 * deterministic legacy behavior; search-path tests opt in via
 * `vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", "1")`.
 */
export function isShadcnResolverSearchEnabled(): boolean {
  const raw = sanitizeEnvString(
    process.env.SAJTMASKIN_SHADCN_RESOLVER_SEARCH,
  )?.toLowerCase();
  if (raw) {
    if (isAffirmativeEnvValue(raw)) return true;
    if (DISABLED_ENV_VALUES.has(raw)) return false;
  }
  return process.env.NODE_ENV !== "test";
}

// ============================================================================
// SHARED PRIMITIVES (used by both the search path and the legacy fallback)
// ============================================================================

export interface ShadcnUiRecipeCandidate {
  name: string;
  reason: string;
  priority: number;
}

/** De-duped push; a re-push keeps the highest priority + its reason. */
export function pushCandidate(
  candidates: ShadcnUiRecipeCandidate[],
  name: string,
  reason: string,
  priority: number,
): void {
  const existing = candidates.find((candidate) => candidate.name === name);
  if (existing) {
    existing.priority = Math.max(existing.priority, priority);
    existing.reason = existing.priority === priority ? reason : existing.reason;
    return;
  }
  candidates.push({ name, reason, priority });
}

export function promptIncludes(prompt: string, terms: readonly string[]): boolean {
  const lower = prompt.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

/** Section vocabulary → community section types (Swedish + English). */
export function detectSectionTypes(prompt: string): string[] {
  const sectionPatterns: Array<{ terms: string[]; sectionType: string }> = [
    { terms: ["hero", "hjälte", "banner", "splash"], sectionType: "hero" },
    { terms: ["feature", "funktion", "förmåga"], sectionType: "features" },
    { terms: ["pricing", "pris", "kostnad", "paket"], sectionType: "pricing" },
    { terms: ["testimonial", "omdöme", "recension", "review"], sectionType: "testimonials" },
    { terms: ["cta", "call to action", "uppman"], sectionType: "cta" },
    { terms: ["faq", "frågor", "vanliga frågor"], sectionType: "faq" },
    { terms: ["footer", "sidfot"], sectionType: "footer" },
    { terms: ["navbar", "navigation", "header", "meny"], sectionType: "navbar" },
    { terms: ["contact", "kontakt", "skicka meddelande"], sectionType: "contact" },
    { terms: ["stats", "statistik", "siffror", "metrics"], sectionType: "stats" },
  ];
  return sectionPatterns
    .filter(({ terms }) => promptIncludes(prompt, terms))
    .map(({ sectionType }) => sectionType);
}

function hashSeed(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
  }
  return hash >>> 0;
}

/** DJB-hash pick: same seed → same item; different prompts vary the pick. */
export function pickDeterministic<T>(items: readonly T[], seed: string): T {
  return items[hashSeed(seed) % items.length];
}

// ============================================================================
// SEARCH INTENTS (capabilities + prompt keywords → search queries)
// ============================================================================

/**
 * Intent classes:
 * - `capability`/`keyword` target the OFFICIAL registry index (shadcn
 *   component/block concepts like dialog/login/chart).
 * - `section`/`effect` are additionally community-eligible: they realize the
 *   legacy per-section/per-effect community picks (marketing sections + magicui
 *   effects). Official-concept intents never pull community items — a webshop's
 *   "card" query must not smuggle in a decorative magic-card effect.
 */
export type RecipeSearchIntentKind = "capability" | "keyword" | "section" | "effect";

/** One search query with the resolver-priority + reason it carries. */
export interface RecipeSearchIntent {
  query: string;
  reason: string;
  priority: number;
  kind: RecipeSearchIntentKind;
}

/**
 * Translate capability signals + prompt keywords into registry search
 * queries. This preserves the legacy candidate SEMANTICS (which concept
 * matters, and how strongly) while letting the live registry index decide
 * WHICH items realize each concept.
 */
export function buildRecipeSearchIntents(
  capabilities: InferredCapabilities,
  prompt: string,
): RecipeSearchIntent[] {
  const intents: RecipeSearchIntent[] = [];
  const add = (
    query: string,
    reason: string,
    priority: number,
    kind: RecipeSearchIntentKind = "capability",
  ) => {
    intents.push({ query, reason, priority, kind });
  };

  if (capabilities.needsPayments) {
    add("dialog", "payments need a focused modal/sheet surface", 100);
    add("form", "payments need validated inputs and clear submit states", 95);
    add("card", "payments/pricing need structured summary cards", 90);
    add("input group", "payments often need amount/coupon/input addons", 70);
  }
  if (capabilities.needsAuth) {
    add("login", "auth flow detected", 96);
    add("signup", "auth/signup flow detected", 80);
  }
  if (capabilities.needsAppShell) {
    add("dashboard", "app shell/dashboard detected", 95);
    add("sidebar", "app shell/sidebar detected", 90);
  }
  if (capabilities.needsCharts) {
    add("area chart interactive", "chart/analytics UI detected", 90);
    add("bar chart", "chart/analytics UI detected", 80);
  }
  if (capabilities.needsDataUI) {
    add("data table", "data table / CRUD UI detected", 92);
    add("table", "data table / CRUD UI detected", 78);
  }
  if (capabilities.needsForms) {
    add("form", "form capability detected", 82);
    add("input", "form capability detected", 78);
    add("field", "form capability detected", 72);
  }
  if (capabilities.needsCalendar) {
    add("date picker", "calendar/date picker detected", 86);
    add("calendar", "calendar/date picker detected", 75);
  }
  if (capabilities.needsCommandSearch) {
    add("command", "command/search UI detected", 84);
    add("combobox", "command/search UI detected", 80);
  }
  if (capabilities.needsCarousel) {
    add("carousel", "carousel/gallery UI detected", 82);
  }
  if (capabilities.needsEcommerce) {
    add("sheet", "cart/checkout drawer pattern for commerce", 80);
    add("drawer", "mobile cart/checkout surface for commerce", 75);
    add("carousel", "product gallery pattern for commerce", 70);
  }

  if (promptIncludes(prompt, ["modal", "popup", "dialog", "betalningsmodal", "payment modal"])) {
    add("dialog", "prompt explicitly asks for modal/dialog UI", 98, "keyword");
  }
  if (promptIncludes(prompt, ["dashboard", "kontrollpanel", "admin", "analytics"])) {
    add("dashboard", "prompt explicitly asks for dashboard UI", 98, "keyword");
  }
  if (promptIncludes(prompt, ["login", "inloggning", "signup", "registrering"])) {
    add("login", "prompt explicitly asks for auth UI", 94, "keyword");
  }
  if (promptIncludes(prompt, ["pricing", "pris", "paket", "abonnemang"])) {
    add("card", "prompt explicitly asks for pricing/package UI", 88, "keyword");
    add("tabs", "pricing often benefits from billing-cycle tabs", 65, "keyword");
  }

  // Visual-effect vocabulary matches @magicui's seeded section keys
  // (animation/premium) — the legacy `effectTypes` path, as search queries.
  // Premium slightly above animation so a both-set prompt keeps the legacy
  // premium-first pick order.
  if (capabilities.needsPremiumVisuals) {
    add("premium", "premium visual effects requested", 62, "effect");
  }
  if (capabilities.needsMotion) {
    add("animation", "motion/animation requested", 60, "effect");
  }

  // Marketing section vocabulary (hero/pricing/faq/…) — primarily realized by
  // the community registries whose seeded section keys carry these terms.
  for (const sectionType of detectSectionTypes(prompt)) {
    add(sectionType, `${sectionType} section requested`, 55, "section");
  }

  return intents;
}

// ============================================================================
// OFFICIAL CANDIDATES (search over the registry index)
// ============================================================================

/**
 * Index item types the resolver may surface as recipes. Excludes fonts,
 * themes, styles, hooks, lib and internal entries — a keyword query must not
 * pull a font family into the prompt context.
 */
const SEARCHABLE_INDEX_TYPES = new Set([
  "registry:ui",
  "registry:block",
  "registry:example",
]);

/** Top hits kept per search intent (legacy pushed ~2 names per signal). */
const MAX_HITS_PER_INTENT = 2;
/** Priority step between an intent's ranked hits (legacy used ~4-5). */
const INTENT_RANK_PENALTY = 5;
/**
 * Raw matches considered per intent before name-bonus re-ranking. Generous:
 * base scores tie a lot (many items only category/description-match), and the
 * decisive name/exact bonuses are applied AFTER this cut.
 */
const MATCHES_PER_INTENT = 20;

/** `"input group"` → `"input-group"` for exact-name comparison. */
function queryAsItemName(query: string): string {
  return tokenize(query).join("-");
}

/**
 * Search the official registry index for each intent and assemble the
 * resolver's ranked candidate list. A name-token bonus keeps items whose NAME
 * realizes the query (e.g. `data-table-demo` for "data table") ahead of items
 * that merely mention it in their description, and an exact-name bonus keeps
 * the canonical item (`dialog`, `form`, `input-group`) ahead of composed
 * variants (`alert-dialog`, `card-with-form`).
 */
export function buildOfficialSearchCandidates(
  indexItems: RegistryIndexItem[],
  intents: RecipeSearchIntent[],
): ShadcnUiRecipeCandidate[] {
  const searchable = indexItems.filter(
    (item) =>
      typeof item?.name === "string" &&
      item.name.length > 0 &&
      SEARCHABLE_INDEX_TYPES.has((item.type ?? "").toLowerCase()),
  );
  if (searchable.length === 0) return [];

  const candidates: ShadcnUiRecipeCandidate[] = [];
  for (const intent of intents) {
    const queryTokens = tokenize(intent.query);
    const exactName = queryAsItemName(intent.query);
    const hits = matchOfficialIndex(searchable, [intent.query], MATCHES_PER_INTENT)
      .map((ref) => {
        const nameTokens = new Set(tokenize(ref.name));
        const nameBonus =
          queryTokens.filter((token) => nameTokens.has(token)).length * 2;
        const exactBonus = ref.name.toLowerCase() === exactName ? 3 : 0;
        return { ref, score: ref.score + nameBonus + exactBonus };
      })
      .sort((a, b) => b.score - a.score || a.ref.name.localeCompare(b.ref.name))
      .slice(0, MAX_HITS_PER_INTENT);

    hits.forEach((hit, rank) => {
      pushCandidate(
        candidates,
        hit.ref.name,
        `registry search "${intent.query}" — ${intent.reason}`,
        intent.priority - rank * INTENT_RANK_PENALTY,
      );
    });
  }

  return candidates.sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
  );
}

// ============================================================================
// COMMUNITY CANDIDATES (search over components.json registries + seed catalog)
// ============================================================================

/** A verified-later community fetch target chosen by the search. */
export interface CommunitySearchPlan {
  namespace: string;
  /** URL template with `{name}` placeholder (from components.json). */
  urlTemplate: string;
  itemName: string;
  reason: string;
}

/**
 * Match the community registries against the community-eligible intents
 * (`section`/`effect` — official-concept queries like "card" or "bar chart"
 * must never smuggle in a decorative community item) and plan which items to
 * hydrate. Per registry, intents are visited in priority order and each intent
 * picks ONE item deterministically (prompt-seeded DJB hash), capped by the
 * seed's `maxPerGeneration` (default 1):
 *
 * 1. If the intent query IS a seeded section key (`hero`, `pricing`,
 *    `animation`, …) the pick pool is that section's seeded items with the
 *    LEGACY seed string — byte-for-byte the legacy per-section pick.
 * 2. Otherwise items whose NAME matches the query form the pool (top score
 *    tier only) — a real keyword hit, e.g. query "pricing1" → `pricing1`.
 */
export function buildCommunitySearchPlans(
  registries: CommunityRegistryDescriptor[],
  intents: RecipeSearchIntent[],
  prompt: string,
  seedEntries: CommunitySeedEntry[],
): CommunitySearchPlan[] {
  if (registries.length === 0 || intents.length === 0) return [];
  const seedByNamespace = new Map(
    seedEntries.filter((entry) => entry?.namespace).map((entry) => [entry.namespace, entry]),
  );
  const orderedIntents = intents
    .filter((intent) => intent.kind === "section" || intent.kind === "effect")
    .sort((a, b) => b.priority - a.priority);

  const plans: CommunitySearchPlan[] = [];
  for (const registry of registries) {
    const seed = seedByNamespace.get(registry.namespace);
    const cap = Math.max(1, seed?.maxPerGeneration ?? 1);
    const chosen = new Set<string>();
    let picked = 0;

    for (const intent of orderedIntents) {
      if (picked >= cap) break;
      const queryTokens = tokenize(intent.query);

      // Legacy seed string: `${prompt}::${sectionType}::${namespace}`.
      let pool: string[] | null = null;
      let seedKey = `${prompt}::${intent.query}::${registry.namespace}`;

      const sectionPool = seed?.sectionMappings?.[intent.query];
      if (sectionPool?.length) {
        // Legacy-identical: section key → seeded items + legacy seed string.
        pool = sectionPool;
      } else {
        const scored = registry.itemNames
          .map((name) => ({ name, score: scoreText(name, queryTokens) }))
          .filter((entry) => entry.score > 0);
        if (scored.length > 0) {
          const top = Math.max(...scored.map((entry) => entry.score));
          pool = scored
            .filter((entry) => entry.score === top)
            .map((entry) => entry.name)
            .sort();
          seedKey = `${prompt}::${intent.query}::${registry.namespace}::name`;
        }
      }

      if (!pool || pool.length === 0) continue;
      const available = pool.filter((name) => !chosen.has(name));
      if (available.length === 0) continue;
      const itemName = pickDeterministic(available, seedKey);
      chosen.add(itemName);
      plans.push({
        namespace: registry.namespace,
        urlTemplate: registry.urlTemplate,
        itemName,
        reason: `community ${intent.query} match from ${registry.namespace}`,
      });
      picked++;
    }
  }
  return plans;
}

export { loadCommunitySeedEntries, loadDescribeCommunityRegistries };
export type { CommunityRegistryDescriptor, CommunitySeedEntry };

// ============================================================================
// OFFICIAL INDEX FETCH (bounded, negatively cached)
// ============================================================================

/**
 * Ceiling for the index fetch in the orchestration critical path. On timeout
 * the resolver degrades to the legacy hardcoded candidates instead of
 * blocking the generation.
 */
const INDEX_FETCH_TIMEOUT_MS = 3_500;
/** After a failed index fetch, skip re-trying for this long (per process). */
const INDEX_FAILURE_TTL_MS = 60_000;

let indexFailureAt: number | null = null;

/** @internal Test helper. */
export function _clearShadcnRecipeSearchStateForTests(): void {
  indexFailureAt = null;
}

/**
 * Probe `registry-service`'s shared memory cache for an already-fetched
 * official index (same key `fetchRegistryIndex()` writes: default style,
 * official source) without touching the network.
 */
function probeSharedIndexCache(): RegistryIndexItem[] | null {
  const cached = getRegistryMemoryCache<RegistryIndex>(
    buildRegistryCacheKey("index", { source: "official" }),
  );
  const items = cached && Array.isArray(cached.items) ? cached.items : null;
  return items && items.length > 0 ? items : null;
}

/**
 * Fetch the official registry index for the resolver. Success is cached by
 * `registry-service`'s shared bounded memory cache (5 min TTL — same spirit
 * as the resolver's per-item CACHE_TTL_MS). Returns `null` on failure/timeout
 * so the caller can fall back to the legacy candidates; failures are
 * negatively cached briefly so offline environments don't pay the timeout on
 * every generation. While the failure TTL is active the shared cache is still
 * probed, so an index warmed meanwhile (e.g. by an abandoned-but-successful
 * fetch or another consumer) ends the legacy degradation immediately.
 */
export async function fetchOfficialIndexForResolver(): Promise<
  RegistryIndexItem[] | null
> {
  if (indexFailureAt !== null && Date.now() - indexFailureAt < INDEX_FAILURE_TTL_MS) {
    const warmed = probeSharedIndexCache();
    if (warmed) {
      indexFailureAt = null;
      return warmed;
    }
    return null;
  }
  try {
    const pending = fetchRegistryIndex();
    // The fetch keeps running if the timeout wins the race below; absorb a
    // late rejection so an abandoned fetch can't raise an unhandled promise
    // rejection inside the orchestration path.
    pending.catch(() => {});
    const index = await withTimeout(pending, INDEX_FETCH_TIMEOUT_MS, null);
    const items = index && Array.isArray(index.items) ? index.items : null;
    if (!items || items.length === 0) {
      indexFailureAt = Date.now();
      return null;
    }
    indexFailureAt = null;
    return items;
  } catch (err) {
    debugLog("shadcn-recipes", "official index fetch failed — legacy fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    indexFailureAt = Date.now();
    return null;
  }
}

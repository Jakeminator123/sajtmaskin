import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InferredCapabilities } from "../capability-inference";
import { rewriteRegistryImports } from "@/lib/shadcn/registry-utils";
import {
  getRegistryBaseUrl,
  getStyleFallbackChain,
} from "@/lib/shadcn/registry-url";
import {
  buildCommunitySearchPlans,
  buildOfficialSearchCandidates,
  buildRecipeSearchIntents,
  detectSectionTypes,
  fetchOfficialIndexForResolver,
  isShadcnResolverSearchEnabled,
  loadCommunitySeedEntries,
  loadDescribeCommunityRegistries,
  pickDeterministic,
  promptIncludes,
  pushCandidate,
  type CommunitySearchPlan,
  type ShadcnUiRecipeCandidate,
} from "./shadcn-recipe-search";

const FETCH_TIMEOUT_MS = 2_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_REMOTE_CANDIDATES = 8;
const COMMUNITY_REGISTRIES_PATH = join(process.cwd(), "config", "community-registries.json");

export interface ShadcnUiRecipeFile {
  path: string;
  target?: string;
  type?: string;
  content: string;
}

export type ShadcnUiRecipeSource = "official" | "community";

export interface ShadcnUiRecipe {
  name: string;
  source: ShadcnUiRecipeSource;
  itemType: "component" | "block" | "example" | "community";
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: ShadcnUiRecipeFile[];
  reason: string;
}

interface RegistryFile {
  path: string;
  target?: string;
  type?: string;
  content?: string;
}

interface RegistryItemResponse {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files?: RegistryFile[];
}

interface CommunityRegistry {
  namespace: string;
  url: string;
  maxPerGeneration: number;
  sectionMappings: Record<string, string[]>;
}

interface CacheEntry {
  recipe: ShadcnUiRecipe | null;
  ts: number;
}

const remoteCache = new Map<string, CacheEntry>();
let communityRegistriesCache: CommunityRegistry[] | null = null;

/** @internal Test helper. */
export function _clearShadcnUiRecipeCachesForTests(): void {
  remoteCache.clear();
  communityRegistriesCache = null;
}

function getCached(key: string): ShadcnUiRecipe | null | undefined {
  const entry = remoteCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    remoteCache.delete(key);
    return undefined;
  }
  return entry.recipe;
}

function setCached(key: string, recipe: ShadcnUiRecipe | null): void {
  remoteCache.set(key, { recipe, ts: Date.now() });
}

function registryItemType(rawType: string | undefined, source: ShadcnUiRecipeSource): ShadcnUiRecipe["itemType"] {
  const type = (rawType ?? "").toLowerCase();
  if (source === "community") return "community";
  if (type.includes("block")) return "block";
  if (type.includes("example")) return "example";
  return "component";
}

function selectUsefulFiles(files: RegistryFile[] | undefined, style: string): ShadcnUiRecipeFile[] {
  if (!Array.isArray(files)) return [];
  const useful = files
    .filter((file) => file.content && /\.(tsx?|jsx?|json)$/.test(file.path))
    .sort((a, b) => {
      const score = (file: RegistryFile) =>
        (file.target?.includes("page.tsx") ? 80 : 0) +
        (file.path.includes("/page.") ? 60 : 0) +
        (file.type?.includes("component") ? 30 : 0) +
        (file.path.endsWith(".json") ? -10 : 0);
      return score(b) - score(a);
    })
    .slice(0, 3);

  return useful.map((file) => ({
    path: file.path,
    target: file.target,
    type: file.type,
    content: rewriteRegistryImports(file.content ?? "", style),
  }));
}

function selectUsefulCommunityFiles(files: RegistryFile[] | undefined): ShadcnUiRecipeFile[] {
  const selected = selectUsefulFiles(files, "");
  return selected.map((file) => ({
    ...file,
    content: file.content
      .replace(/@\/registry\/[^/]+\/lib\/utils/g, "@/lib/utils")
      .replace(/@\/registry\/[^/]+\/hooks\//g, "@/lib/hooks/")
      .replace(/@\/registry\/[^/]+\//g, "@/components/"),
  }));
}

async function fetchOfficialRecipe(
  name: string,
  reason: string,
): Promise<ShadcnUiRecipe | null> {
  const cached = getCached(`official/${name}`);
  if (cached !== undefined) return cached;

  const base = getRegistryBaseUrl();
  for (const style of getStyleFallbackChain()) {
    const url = `${base}/r/styles/${encodeURIComponent(style)}/${encodeURIComponent(name)}.json`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) continue;
      const data = (await response.json()) as RegistryItemResponse;
      const files = selectUsefulFiles(data.files, style);
      if (files.length === 0) continue;
      const recipe: ShadcnUiRecipe = {
        name: data.name || name,
        title: data.title,
        description: data.description,
        source: "official",
        itemType: registryItemType(data.type, "official"),
        dependencies: data.dependencies,
        registryDependencies: data.registryDependencies,
        files,
        reason,
      };
      setCached(`official/${name}`, recipe);
      return recipe;
    } catch {
      continue;
    }
  }

  setCached(`official/${name}`, null);
  return null;
}

function loadCommunityRegistries(): CommunityRegistry[] {
  if (communityRegistriesCache) return communityRegistriesCache;
  if (!existsSync(COMMUNITY_REGISTRIES_PATH)) {
    communityRegistriesCache = [];
    return communityRegistriesCache;
  }
  try {
    communityRegistriesCache = JSON.parse(
      readFileSync(COMMUNITY_REGISTRIES_PATH, "utf-8"),
    ) as CommunityRegistry[];
    return communityRegistriesCache;
  } catch {
    communityRegistriesCache = [];
    return communityRegistriesCache;
  }
}

async function fetchCommunityRecipe(
  registry: { namespace: string; url: string },
  itemName: string,
  reason: string,
): Promise<ShadcnUiRecipe | null> {
  const cacheKey = `${registry.namespace}/${itemName}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const url = registry.url.replace("{name}", encodeURIComponent(itemName));
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      setCached(cacheKey, null);
      return null;
    }
    const data = (await response.json()) as RegistryItemResponse;
    const files = selectUsefulCommunityFiles(data.files);
    if (files.length === 0) {
      setCached(cacheKey, null);
      return null;
    }
    const recipe: ShadcnUiRecipe = {
      name: `${registry.namespace}/${data.name || itemName}`,
      title: data.title,
      description: data.description,
      source: "community",
      itemType: "community",
      dependencies: data.dependencies,
      registryDependencies: data.registryDependencies,
      files,
      reason,
    };
    setCached(cacheKey, recipe);
    return recipe;
  } catch {
    setCached(cacheKey, null);
    return null;
  }
}

async function fetchCommunityRecipes(
  capabilities: InferredCapabilities,
  prompt: string,
  remainingSlots: number,
): Promise<ShadcnUiRecipe[]> {
  if (remainingSlots <= 0) return [];
  const registries = loadCommunityRegistries();
  if (registries.length === 0) return [];

  const sectionTypes = detectSectionTypes(prompt);
  const effectTypes = [
    capabilities.needsPremiumVisuals ? "premium" : null,
    capabilities.needsMotion ? "animation" : null,
  ].filter((type): type is string => Boolean(type));

  const recipes: ShadcnUiRecipe[] = [];
  for (const registry of registries) {
    const relevantTypes = registry.namespace === "@magicui" ? effectTypes : sectionTypes;
    let perRegistryCount = 0;
    for (const sectionType of relevantTypes) {
      if (recipes.length >= remainingSlots || perRegistryCount >= registry.maxPerGeneration) break;
      const items = registry.sectionMappings[sectionType];
      if (!items?.length) continue;
      const itemName = pickDeterministic(items, `${prompt}::${sectionType}::${registry.namespace}`);
      const recipe = await fetchCommunityRecipe(
        registry,
        itemName,
        `community ${sectionType} match from ${registry.namespace}`,
      );
      if (recipe && !recipes.some((existing) => existing.name === recipe.name)) {
        recipes.push(recipe);
        perRegistryCount++;
      }
    }
  }
  return recipes.slice(0, remainingSlots);
}

/**
 * Legacy hardcoded candidate lists — the pre-Fas 4 behavior. Kept as the
 * exact fallback when `SAJTMASKIN_SHADCN_RESOLVER_SEARCH` is off AND as the
 * automatic degradation when the registry-index fetch fails (offline/timeout
 * must never empty the candidate set). Exported for regression tests.
 */
export function buildLegacyCandidates(
  capabilities: InferredCapabilities,
  prompt: string,
): ShadcnUiRecipeCandidate[] {
  const candidates: ShadcnUiRecipeCandidate[] = [];

  if (capabilities.needsPayments) {
    pushCandidate(candidates, "dialog", "payments need a focused modal/sheet surface", 100);
    pushCandidate(candidates, "form", "payments need validated inputs and clear submit states", 95);
    pushCandidate(candidates, "card", "payments/pricing need structured summary cards", 90);
    pushCandidate(candidates, "input-group", "payments often need amount/coupon/input addons", 70);
  }
  if (capabilities.needsAuth) {
    pushCandidate(candidates, "login-03", "auth flow detected", 96);
    pushCandidate(candidates, "login-04", "auth flow detected", 92);
    pushCandidate(candidates, "signup-01", "auth/signup flow detected", 80);
  }
  if (capabilities.needsAppShell) {
    pushCandidate(candidates, "dashboard-01", "app shell/dashboard detected", 95);
    pushCandidate(candidates, "sidebar-07", "app shell/sidebar detected", 90);
  }
  if (capabilities.needsCharts) {
    pushCandidate(candidates, "chart-area-interactive", "chart/analytics UI detected", 90);
    pushCandidate(candidates, "chart-bar-default", "chart/analytics UI detected", 80);
  }
  if (capabilities.needsDataUI) {
    pushCandidate(candidates, "data-table-demo", "data table / CRUD UI detected", 92);
    pushCandidate(candidates, "table", "data table / CRUD UI detected", 78);
  }
  if (capabilities.needsForms) {
    pushCandidate(candidates, "form", "form capability detected", 82);
    pushCandidate(candidates, "input-form", "form capability detected", 78);
    pushCandidate(candidates, "field", "form capability detected", 72);
  }
  if (capabilities.needsCalendar) {
    pushCandidate(candidates, "date-picker-demo", "calendar/date picker detected", 86);
    pushCandidate(candidates, "calendar", "calendar/date picker detected", 75);
  }
  if (capabilities.needsCommandSearch) {
    pushCandidate(candidates, "command", "command/search UI detected", 84);
    pushCandidate(candidates, "combobox-demo", "command/search UI detected", 80);
  }
  if (capabilities.needsCarousel) {
    pushCandidate(candidates, "carousel-demo", "carousel/gallery UI detected", 82);
  }
  if (capabilities.needsEcommerce) {
    pushCandidate(candidates, "sheet", "cart/checkout drawer pattern for commerce", 80);
    pushCandidate(candidates, "drawer", "mobile cart/checkout surface for commerce", 75);
    pushCandidate(candidates, "carousel-demo", "product gallery pattern for commerce", 70);
  }

  if (promptIncludes(prompt, ["modal", "popup", "dialog", "betalningsmodal", "payment modal"])) {
    pushCandidate(candidates, "dialog", "prompt explicitly asks for modal/dialog UI", 98);
  }
  if (promptIncludes(prompt, ["dashboard", "kontrollpanel", "admin", "analytics"])) {
    pushCandidate(candidates, "dashboard-01", "prompt explicitly asks for dashboard UI", 98);
  }
  if (promptIncludes(prompt, ["login", "inloggning", "signup", "registrering"])) {
    pushCandidate(candidates, "login-03", "prompt explicitly asks for auth UI", 94);
  }
  if (promptIncludes(prompt, ["pricing", "pris", "paket", "abonnemang"])) {
    pushCandidate(candidates, "card", "prompt explicitly asks for pricing/package UI", 88);
    pushCandidate(candidates, "tabs", "pricing often benefits from billing-cycle tabs", 65);
  }

  return candidates.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
}

/**
 * Fas 4: search-driven candidate generation. Returns `null` when the search
 * path cannot produce official candidates (flag off is handled by the caller;
 * here: index fetch failed OR search matched nothing) — the caller then runs
 * the exact legacy path so network errors never shrink the candidate set.
 */
async function buildSearchCandidates(
  capabilities: InferredCapabilities,
  prompt: string,
): Promise<{
  candidates: ShadcnUiRecipeCandidate[];
  communityPlans: CommunitySearchPlan[] | null;
} | null> {
  const indexItems = await fetchOfficialIndexForResolver();
  if (!indexItems) return null;

  const intents = buildRecipeSearchIntents(capabilities, prompt);
  if (intents.length === 0) return null;

  const candidates = buildOfficialSearchCandidates(indexItems, intents);
  if (candidates.length === 0) return null;

  const plans = buildCommunitySearchPlans(
    loadDescribeCommunityRegistries(),
    intents,
    prompt,
    loadCommunitySeedEntries(),
  );
  // Empty plans → the caller uses the legacy community flow for the fill so
  // community coverage never regresses below the pre-search behavior.
  return { candidates, communityPlans: plans.length > 0 ? plans : null };
}

async function fetchCommunityRecipesFromPlans(
  plans: CommunitySearchPlan[],
  remainingSlots: number,
): Promise<ShadcnUiRecipe[]> {
  if (remainingSlots <= 0) return [];
  const recipes: ShadcnUiRecipe[] = [];
  for (const plan of plans) {
    if (recipes.length >= remainingSlots) break;
    const recipe = await fetchCommunityRecipe(
      { namespace: plan.namespace, url: plan.urlTemplate },
      plan.itemName,
      plan.reason,
    );
    if (recipe && !recipes.some((existing) => existing.name === recipe.name)) {
      recipes.push(recipe);
    }
  }
  return recipes;
}

export async function resolveShadcnUiRecipes(params: {
  capabilities: InferredCapabilities;
  prompt: string;
  maxRecipes?: number;
}): Promise<ShadcnUiRecipe[]> {
  const maxRecipes = params.maxRecipes ?? 3;
  if (maxRecipes <= 0) return [];

  let candidates: ShadcnUiRecipeCandidate[] | null = null;
  let communityPlans: CommunitySearchPlan[] | null = null;

  if (isShadcnResolverSearchEnabled()) {
    const searched = await buildSearchCandidates(params.capabilities, params.prompt);
    if (searched) {
      candidates = searched.candidates;
      communityPlans = searched.communityPlans;
    }
  }

  // Flag off, index unreachable or zero search hits → exact legacy behavior.
  if (!candidates) {
    candidates = buildLegacyCandidates(params.capabilities, params.prompt);
  }

  const recipes: ShadcnUiRecipe[] = [];
  for (const candidate of candidates.slice(0, MAX_REMOTE_CANDIDATES)) {
    if (recipes.length >= maxRecipes) break;
    const recipe = await fetchOfficialRecipe(candidate.name, candidate.reason);
    if (!recipe) continue;
    if (!recipes.some((existing) => existing.name === recipe.name)) {
      recipes.push(recipe);
    }
  }

  if (recipes.length < maxRecipes) {
    const community = communityPlans
      ? await fetchCommunityRecipesFromPlans(
          communityPlans,
          maxRecipes - recipes.length,
        )
      : await fetchCommunityRecipes(
          params.capabilities,
          params.prompt,
          maxRecipes - recipes.length,
        );
    for (const recipe of community) {
      if (!recipes.some((existing) => existing.name === recipe.name)) {
        recipes.push(recipe);
      }
    }
  }

  return recipes.slice(0, maxRecipes);
}

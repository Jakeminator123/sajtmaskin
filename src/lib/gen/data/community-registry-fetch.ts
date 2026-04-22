import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InferredCapabilities } from "../capability-inference";
import type { ComponentReference } from "./shadcn-example-loader";

const FETCH_TIMEOUT_MS = 2000;
const MAX_COMMUNITY_BLOCKS = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface SectionMappings {
  [sectionType: string]: string[];
}

interface CommunityRegistry {
  namespace: string;
  url: string;
  description: string;
  maxPerGeneration: number;
  sectionMappings: SectionMappings;
}

interface CacheEntry {
  ref: ComponentReference | null;
  ts: number;
}

const cache = new Map<string, CacheEntry>();

/** @internal Exposed for tests only. */
export function _clearCache(): void {
  cache.clear();
}

function getCached(key: string): ComponentReference | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.ref;
}

function setCache(key: string, ref: ComponentReference | null): void {
  cache.set(key, { ref, ts: Date.now() });
}

let registriesCache: CommunityRegistry[] | null = null;

function loadRegistries(): CommunityRegistry[] {
  if (registriesCache) return registriesCache;
  try {
    const raw = readFileSync(
      join(process.cwd(), "config", "community-registries.json"),
      "utf-8",
    );
    registriesCache = JSON.parse(raw) as CommunityRegistry[];
    return registriesCache;
  } catch {
    return [];
  }
}

function buildItemUrl(registry: CommunityRegistry, itemName: string): string {
  return registry.url.replace("{name}", encodeURIComponent(itemName));
}

function rewriteCommunityImports(content: string): string {
  if (!content) return content;
  let result = content.replace(/@\/registry\/[^/]+\/lib\/utils/g, "@/lib/utils");
  result = result.replace(/@\/registry\/[^/]+\/hooks\//g, "@/lib/hooks/");
  result = result.replace(/@\/registry\/[^/]+\//g, "@/components/");
  return result;
}

interface RegistryItemResponse {
  name: string;
  title?: string;
  files?: Array<{ path: string; content?: string }>;
}

async function fetchOneBlock(
  registry: CommunityRegistry,
  itemName: string,
): Promise<ComponentReference | null> {
  const cacheKey = `${registry.namespace}/${itemName}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const url = buildItemUrl(registry, itemName);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      setCache(cacheKey, null);
      return null;
    }
    const data = (await res.json()) as RegistryItemResponse;
    const tsxFile = data.files?.find(
      (f) => f.content && (f.path.endsWith(".tsx") || f.path.endsWith(".ts")),
    );
    if (!tsxFile?.content) {
      setCache(cacheKey, null);
      return null;
    }
    const code = rewriteCommunityImports(tsxFile.content);
    const ref: ComponentReference = {
      name: `${registry.namespace}/${data.name || itemName}`,
      code,
    };
    setCache(cacheKey, ref);
    return ref;
  } catch {
    setCache(cacheKey, null);
    return null;
  }
}

const SECTION_KEYWORDS: Array<{ pattern: RegExp; sectionType: string }> = [
  { pattern: /\b(hero|hjälte|banner|splash)\b/i, sectionType: "hero" },
  { pattern: /\b(feature|funktion|capability|förmåga)\b/i, sectionType: "features" },
  { pattern: /\b(pricing|pris|kostnad|plan|paket)\b/i, sectionType: "pricing" },
  { pattern: /\b(testimonial|omdöme|recension|review|kund.?berättel)\b/i, sectionType: "testimonials" },
  { pattern: /\b(cta|call.?to.?action|uppman|knapp.?sektion)\b/i, sectionType: "cta" },
  { pattern: /\b(faq|frågor|vanliga frågor|frequently)\b/i, sectionType: "faq" },
  { pattern: /\b(footer|sidfot)\b/i, sectionType: "footer" },
  { pattern: /\b(navbar|navigation|header|meny|toppmeny)\b/i, sectionType: "navbar" },
  { pattern: /\b(contact|kontakt|hör av|skicka meddelande)\b/i, sectionType: "contact" },
  { pattern: /\b(about|om oss|om företag|om mig|historia)\b/i, sectionType: "about" },
  { pattern: /\b(stats|statistik|siffror|numbers|metrics)\b/i, sectionType: "stats" },
  { pattern: /\b(team|personal|medarbetare|vårt team)\b/i, sectionType: "team" },
];

function detectSectionTypes(prompt: string): string[] {
  const types: string[] = [];
  for (const { pattern, sectionType } of SECTION_KEYWORDS) {
    if (pattern.test(prompt)) types.push(sectionType);
  }
  return types;
}

function detectEffectTypes(caps: InferredCapabilities): string[] {
  const types: string[] = [];
  if (caps.needsPremiumVisuals) types.push("premium");
  if (caps.needsMotion) types.push("animation");
  return types;
}

interface BlockCandidate {
  registry: CommunityRegistry;
  itemName: string;
}

/**
 * Deterministic 32-bit string hash (DJB-style xor). Stable across processes
 * and Node versions — used here to pick registry blocks reproducibly per
 * (prompt, sectionType, namespace) instead of `Math.random()`. Same input
 * always yields the same item, so reruns of the same prompt never produce
 * different section recipes.
 */
function hashSeed(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
  }
  return hash >>> 0;
}

function pickDeterministic<T>(items: readonly T[], seed: string): T {
  return items[hashSeed(seed) % items.length];
}

function selectCandidates(
  caps: InferredCapabilities,
  prompt: string,
): BlockCandidate[] {
  const registries = loadRegistries();
  if (registries.length === 0) return [];

  const sectionTypes = detectSectionTypes(prompt);
  const effectTypes = detectEffectTypes(caps);
  const candidates: BlockCandidate[] = [];
  const perRegistryCount = new Map<string, number>();

  for (const registry of registries) {
    const limit = registry.maxPerGeneration;
    const count = () => perRegistryCount.get(registry.namespace) ?? 0;
    const inc = () => perRegistryCount.set(registry.namespace, count() + 1);

    const relevantTypes =
      registry.namespace === "@magicui" ? effectTypes : sectionTypes;

    for (const sType of relevantTypes) {
      if (count() >= limit || candidates.length >= MAX_COMMUNITY_BLOCKS) break;
      const items = registry.sectionMappings[sType];
      if (!items?.length) continue;
      const pick = pickDeterministic(items, `${prompt}::${sType}::${registry.namespace}`);
      if (candidates.some((c) => c.itemName === pick && c.registry.namespace === registry.namespace)) continue;
      candidates.push({ registry, itemName: pick });
      inc();
    }
  }

  return candidates.slice(0, MAX_COMMUNITY_BLOCKS);
}

/**
 * Fetch community registry blocks relevant to the current generation.
 * Returns ComponentReference[] with rewritten imports.
 * Silent fallback to empty on any error.
 */
export async function fetchCommunityBlocks(
  caps: InferredCapabilities,
  prompt: string,
): Promise<ComponentReference[]> {
  const candidates = selectCandidates(caps, prompt);
  if (candidates.length === 0) return [];

  const results: ComponentReference[] = [];
  for (const { registry, itemName } of candidates) {
    const ref = await fetchOneBlock(registry, itemName);
    if (ref) results.push(ref);
  }
  return results;
}

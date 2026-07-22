import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRegistryCacheKey,
  clearRegistryMemoryCache,
  setRegistryMemoryCache,
} from "@/lib/shadcn/registry-memory-cache";
import type { RegistryIndexItem } from "@/lib/shadcn/registry-service";
import type { InferredCapabilities } from "../capability-inference";
import {
  _clearShadcnRecipeSearchStateForTests,
  buildCommunitySearchPlans,
  buildOfficialSearchCandidates,
  buildRecipeSearchIntents,
  fetchOfficialIndexForResolver,
  isShadcnResolverSearchEnabled,
  type CommunityRegistryDescriptor,
  type CommunitySeedEntry,
} from "./shadcn-recipe-search";

function caps(overrides: Partial<InferredCapabilities> = {}): InferredCapabilities {
  return {
    needsMotion: false,
    needs3D: false,
    needsPhysics: false,
    needsParallax: false,
    needsPayments: false,
    needsCharts: false,
    needsDatabase: false,
    needsAuth: false,
    needsAppShell: false,
    needsDataUI: false,
    needsForms: false,
    needsGame: false,
    needsEcommerce: false,
    needsCarousel: false,
    needsPremiumVisuals: false,
    needsCalendar: false,
    needsCommandSearch: false,
    needsThemeToggle: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

describe("isShadcnResolverSearchEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults OFF under NODE_ENV=test", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(isShadcnResolverSearchEnabled()).toBe(false);
  });

  it("explicit affirmative turns it on", () => {
    vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", "1");
    expect(isShadcnResolverSearchEnabled()).toBe(true);
    vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", "true");
    expect(isShadcnResolverSearchEnabled()).toBe(true);
  });

  it("explicit disable turns it off", () => {
    for (const value of ["0", "false", "off", "no"]) {
      vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", value);
      expect(isShadcnResolverSearchEnabled()).toBe(false);
    }
  });

  it("defaults ON outside test env", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isShadcnResolverSearchEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Query building (capabilities + prompt keywords → search intents)
// ---------------------------------------------------------------------------

describe("buildRecipeSearchIntents", () => {
  it("maps capability signals to concept queries with legacy-tier priorities", () => {
    const intents = buildRecipeSearchIntents(
      caps({ needsAuth: true, needsCharts: true }),
      "bygg en medlemssida",
    );
    const byQuery = new Map(intents.map((intent) => [intent.query, intent]));
    expect(byQuery.get("login")?.priority).toBe(96);
    expect(byQuery.get("signup")?.priority).toBe(80);
    expect(byQuery.get("area chart interactive")?.priority).toBe(90);
    expect(byQuery.get("bar chart")?.priority).toBe(80);
  });

  it("detects Swedish prompt keywords as high-priority intents", () => {
    const intents = buildRecipeSearchIntents(caps(), "bygg en kontrollpanel för admin");
    const dashboard = intents.find((intent) => intent.query === "dashboard");
    expect(dashboard?.priority).toBe(98);
  });

  it("adds marketing section queries from the prompt", () => {
    const intents = buildRecipeSearchIntents(caps(), "en hero med pricing och faq");
    const queries = intents.map((intent) => intent.query);
    expect(queries).toContain("hero");
    expect(queries).toContain("pricing");
    expect(queries).toContain("faq");
  });

  it("adds effect queries for motion/premium capabilities", () => {
    const intents = buildRecipeSearchIntents(
      caps({ needsMotion: true, needsPremiumVisuals: true }),
      "en snygg sajt",
    );
    const queries = intents.map((intent) => intent.query);
    expect(queries).toContain("animation");
    expect(queries).toContain("premium");
  });

  it("returns no intents when nothing is detected", () => {
    expect(buildRecipeSearchIntents(caps(), "gör något fint")).toEqual([]);
  });

  it("is deterministic for the same input", () => {
    const a = buildRecipeSearchIntents(caps({ needsAuth: true }), "bygg login");
    const b = buildRecipeSearchIntents(caps({ needsAuth: true }), "bygg login");
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Official candidate ranking over the index
// ---------------------------------------------------------------------------

const INDEX: RegistryIndexItem[] = [
  { name: "login-01", type: "registry:block", description: "A simple login form.", categories: ["authentication", "login"] },
  { name: "login-02", type: "registry:block", description: "A two column login page.", categories: ["authentication", "login"] },
  { name: "signup-01", type: "registry:block", description: "A simple signup form.", categories: ["authentication", "signup"] },
  { name: "dashboard-01", type: "registry:block", description: "A dashboard with sidebar, charts and data table.", categories: ["dashboard"] },
  { name: "data-table-demo", type: "registry:example", description: "" },
  { name: "table", type: "registry:ui", description: "" },
  { name: "dialog", type: "registry:ui", description: "" },
  // Non-searchable types must never surface as candidates:
  { name: "login-font", type: "registry:font", description: "A login-themed font" },
  { name: "dashboard-theme", type: "registry:theme", description: "dashboard theme" },
];

describe("buildOfficialSearchCandidates", () => {
  it("resolves auth capability to real login/signup blocks from the index", () => {
    const intents = buildRecipeSearchIntents(caps({ needsAuth: true }), "bygg login");
    const candidates = buildOfficialSearchCandidates(INDEX, intents);
    const names = candidates.map((candidate) => candidate.name);
    expect(names[0]).toBe("login-01");
    expect(names).toContain("signup-01");
    expect(candidates[0]?.reason).toContain("auth");
    expect(candidates[0]?.priority).toBe(96);
  });

  it("prefers name-token matches over description-only matches", () => {
    const intents = buildRecipeSearchIntents(caps({ needsDataUI: true }), "hantera kunder");
    const candidates = buildOfficialSearchCandidates(INDEX, intents);
    // dashboard-01 mentions "data table" in its description, but the item that
    // REALIZES the query by name must win.
    expect(candidates[0]?.name).toBe("data-table-demo");
  });

  it("never surfaces fonts/themes even when they match the query", () => {
    const intents = buildRecipeSearchIntents(
      caps({ needsAuth: true, needsAppShell: true }),
      "login dashboard",
    );
    const names = buildOfficialSearchCandidates(INDEX, intents).map((c) => c.name);
    expect(names).not.toContain("login-font");
    expect(names).not.toContain("dashboard-theme");
  });

  it("returns an empty list when no intent matches the index", () => {
    const intents = buildRecipeSearchIntents(caps({ needsCalendar: true }), "boka tid");
    expect(buildOfficialSearchCandidates(INDEX, intents)).toEqual([]);
  });

  it("is deterministic (same input → same candidate order)", () => {
    const intents = buildRecipeSearchIntents(
      caps({ needsAuth: true, needsAppShell: true, needsDataUI: true }),
      "bygg en admin med login",
    );
    const a = buildOfficialSearchCandidates(INDEX, intents);
    const b = buildOfficialSearchCandidates(INDEX, intents);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Community search plans
// ---------------------------------------------------------------------------

const COMMUNITY: CommunityRegistryDescriptor[] = [
  {
    namespace: "@shadcnblocks",
    urlTemplate: "https://shadcnblocks.com/r/{name}.json",
    description: "hero features pricing testimonials cta faq footer navbar contact about stats",
    itemNames: ["hero1", "hero3", "hero5", "pricing1", "pricing3", "faq1"],
  },
  {
    namespace: "@magicui",
    urlTemplate: "https://magicui.design/r/{name}",
    description: "animation background premium",
    itemNames: ["marquee", "shimmer-button", "magic-card", "meteors"],
  },
];

const SEED: CommunitySeedEntry[] = [
  {
    namespace: "@shadcnblocks",
    url: "https://shadcnblocks.com/r/{name}.json",
    maxPerGeneration: 2,
    sectionMappings: {
      hero: ["hero1", "hero3", "hero5"],
      pricing: ["pricing1", "pricing3"],
      faq: ["faq1"],
    },
  },
  {
    namespace: "@magicui",
    url: "https://magicui.design/r/{name}",
    maxPerGeneration: 1,
    sectionMappings: {
      animation: ["marquee", "shimmer-button"],
      premium: ["magic-card", "meteors"],
    },
  },
];

describe("buildCommunitySearchPlans", () => {
  it("resolves section queries to the LEGACY seeded pick (same pool, same seed string)", () => {
    const prompt = "en hero med pricing";
    const intents = buildRecipeSearchIntents(caps(), prompt);
    const plans = buildCommunitySearchPlans(COMMUNITY, intents, prompt, SEED);
    const blocks = plans.filter((plan) => plan.namespace === "@shadcnblocks");
    expect(blocks.length).toBe(2);
    // Same DJB pick as the legacy per-section path: pool + seed are identical.
    for (const plan of blocks) {
      expect(COMMUNITY[0].itemNames).toContain(plan.itemName);
    }
  });

  it("surfaces @magicui items via effect queries", () => {
    const prompt = "en sajt med animationer";
    const intents = buildRecipeSearchIntents(caps({ needsMotion: true }), prompt);
    const plans = buildCommunitySearchPlans(COMMUNITY, intents, prompt, SEED);
    const magic = plans.filter((plan) => plan.namespace === "@magicui");
    expect(magic).toHaveLength(1);
    expect(SEED[1].sectionMappings?.animation).toContain(magic[0].itemName);
  });

  it("falls back to name-matching for queries that are not seeded section keys", () => {
    const intents = [
      { query: "pricing1", reason: "test", priority: 50, kind: "section" as const },
    ];
    const plans = buildCommunitySearchPlans(COMMUNITY, intents, "x", SEED);
    expect(plans.some((plan) => plan.itemName === "pricing1")).toBe(true);
  });

  it("official-concept intents (capability/keyword) never produce community plans", () => {
    // "card" (keyword) name-matches @magicui's magic-card — must be ignored.
    const intents = [
      { query: "card", reason: "pricing UI", priority: 88, kind: "keyword" as const },
    ];
    expect(buildCommunitySearchPlans(COMMUNITY, intents, "pricing", SEED)).toEqual([]);
  });

  it("never plans items from a registry the queries do not speak to", () => {
    // Auth queries match neither section keys nor item names of these registries.
    const intents = buildRecipeSearchIntents(caps({ needsAuth: true }), "bygg login");
    expect(buildCommunitySearchPlans(COMMUNITY, intents, "bygg login", SEED)).toEqual([]);
  });

  it("respects per-namespace maxPerGeneration caps", () => {
    const prompt = "hero pricing faq footer";
    const intents = buildRecipeSearchIntents(caps(), prompt);
    const plans = buildCommunitySearchPlans(COMMUNITY, intents, prompt, [
      { ...SEED[0], maxPerGeneration: 1 },
      SEED[1],
    ]);
    expect(plans.filter((plan) => plan.namespace === "@shadcnblocks")).toHaveLength(1);
  });

  it("is stable for the same prompt", () => {
    const intents = buildRecipeSearchIntents(caps(), "en hero");
    const a = buildCommunitySearchPlans(COMMUNITY, intents, "en hero", SEED);
    const b = buildCommunitySearchPlans(COMMUNITY, intents, "en hero", SEED);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Index fetch: bounded + negatively cached, degrades to null (legacy fallback)
// ---------------------------------------------------------------------------

describe("fetchOfficialIndexForResolver", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    _clearShadcnRecipeSearchStateForTests();
    clearRegistryMemoryCache();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the index items on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ name: "login-01", type: "registry:block" }] }),
    });
    const items = await fetchOfficialIndexForResolver();
    expect(items).toHaveLength(1);
    expect(items?.[0]?.name).toBe("login-01");
  });

  it("returns null on network failure and negatively caches the failure", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    await expect(fetchOfficialIndexForResolver()).resolves.toBeNull();
    const callsAfterFirst = mockFetch.mock.calls.length;
    // Second call within the failure TTL must NOT re-fetch.
    await expect(fetchOfficialIndexForResolver()).resolves.toBeNull();
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
  });

  it("returns null for an empty/invalid index payload", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    await expect(fetchOfficialIndexForResolver()).resolves.toBeNull();
  });

  it("recovers within the failure TTL when the shared memory cache is warmed", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    await expect(fetchOfficialIndexForResolver()).resolves.toBeNull();
    const callsAfterFailure = mockFetch.mock.calls.length;

    // Another consumer (or an abandoned-but-successful fetch) warms the shared
    // registry-service cache while the negative TTL is still active.
    setRegistryMemoryCache(buildRegistryCacheKey("index", { source: "official" }), {
      items: [{ name: "login-01", type: "registry:block" }],
    });

    const items = await fetchOfficialIndexForResolver();
    expect(items?.[0]?.name).toBe("login-01");
    // Served from the shared cache — no new network call.
    expect(mockFetch.mock.calls.length).toBe(callsAfterFailure);
  });

  it("absorbs a late rejection from a fetch abandoned by the timeout", async () => {
    vi.useFakeTimers();
    try {
      let rejectLate: ((err: Error) => void) | undefined;
      mockFetch.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectLate = reject;
          }),
      );
      const resultPromise = fetchOfficialIndexForResolver();
      await vi.advanceTimersByTimeAsync(3_500);
      await expect(resultPromise).resolves.toBeNull();
      // The abandoned fetch rejects AFTER the timeout — must not produce an
      // unhandled promise rejection (vitest fails the test run on those).
      rejectLate?.(new Error("late upstream failure"));
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

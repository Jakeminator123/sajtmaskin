import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _clearShadcnUiRecipeCachesForTests,
  buildLegacyCandidates,
  resolveShadcnUiRecipes,
} from "./shadcn-ui-recipes";
import { _clearShadcnRecipeSearchStateForTests } from "./shadcn-recipe-search";
import { clearRegistryMemoryCache } from "@/lib/shadcn/registry-memory-cache";
import type { InferredCapabilities } from "../capability-inference";

const mockFetch = vi.fn();

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

/**
 * The registry INDEX is fetched as `.../registry.json` on the server and via
 * the `/api/shadcn/registry/index` proxy in browser-like envs (vitest = jsdom).
 */
function isIndexUrl(url: string): boolean {
  return url.includes("registry.json") || url.includes("/api/shadcn/registry/index");
}

function registryResponse(name: string, style: string, type = "registry:ui") {
  return {
    ok: true,
    json: async () => ({
      name,
      type,
      description: `${name} description`,
      registryDependencies: ["button"],
      dependencies: ["zod"],
      files: [
        {
          path: `registry/${style}/ui/${name}.tsx`,
          target: `components/ui/${name}.tsx`,
          type: "registry:ui",
          content: `import { cn } from "@/registry/${style}/lib/utils";\nexport function ${name.replace(/(^|-)(\w)/g, (_, _dash, char) => String(char).toUpperCase())}Demo() { return null }\n`,
        },
      ],
    }),
  };
}

beforeEach(() => {
  _clearShadcnUiRecipeCachesForTests();
  _clearShadcnRecipeSearchStateForTests();
  clearRegistryMemoryCache();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("resolveShadcnUiRecipes", () => {
  it("selects payment UI recipes from official registry candidates", async () => {
    mockFetch.mockResolvedValue(registryResponse("dialog", "new-york-v4"));

    const result = await resolveShadcnUiRecipes({
      capabilities: caps({ needsPayments: true }),
      prompt: "bygg pricing med betalningsmodal",
      maxRecipes: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("dialog");
    expect(result[0]?.reason).toContain("payments");
    expect(result[0]?.files[0]?.content).toContain("@/lib/utils");
    expect(result[0]?.files[0]?.content).not.toContain("@/registry/");
  });

  it("falls back through shadcn styles when primary style is empty", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce(registryResponse("form", "new-york"));

    const result = await resolveShadcnUiRecipes({
      capabilities: caps({ needsForms: true }),
      prompt: "bygg ett kontaktformulär",
      maxRecipes: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("form");
    expect(result[0]?.files[0]?.content).toContain("@/lib/utils");
  });

  it("uses official registry for auth blocks instead of local example cache", async () => {
    mockFetch.mockResolvedValue(registryResponse("login-03", "new-york-v4", "registry:block"));

    const result = await resolveShadcnUiRecipes({
      capabilities: caps({ needsAuth: true }),
      prompt: "bygg login",
      maxRecipes: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("official");
    expect(result[0]?.name).toBe("login-03");
  });

  // -------------------------------------------------------------------------
  // Fas 4: search-driven candidate generation (flag-gated, legacy fallback)
  // -------------------------------------------------------------------------

  it("P1: flag OFF preserves the exact legacy behavior (no index fetch, legacy candidate order)", async () => {
    vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", "0");
    mockFetch.mockResolvedValue(registryResponse("login-03", "new-york-v4", "registry:block"));

    const result = await resolveShadcnUiRecipes({
      capabilities: caps({ needsAuth: true }),
      prompt: "bygg login",
      maxRecipes: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("login-03");
    // The registry INDEX must never be fetched on the legacy path.
    const fetchedUrls = mockFetch.mock.calls.map((call) => String(call[0]));
    expect(fetchedUrls.some((url) => isIndexUrl(url))).toBe(false);
    expect(fetchedUrls[0]).toContain("/login-03.json");
    // And the candidate list itself matches the pre-Fas 4 hardcoded order.
    const legacy = buildLegacyCandidates(caps({ needsAuth: true }), "bygg login");
    expect(legacy.map((candidate) => candidate.name)).toEqual([
      "login-03",
      "login-04",
      "signup-01",
    ]);
  });

  it("P1: flag ON with unreachable index degrades to legacy candidates (never empty on network failure)", async () => {
    vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", "1");
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (isIndexUrl(url)) throw new Error("offline");
      return registryResponse("login-03", "new-york-v4", "registry:block");
    });

    const result = await resolveShadcnUiRecipes({
      capabilities: caps({ needsAuth: true }),
      prompt: "bygg login",
      maxRecipes: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("login-03");
    expect(result[0]?.source).toBe("official");
  });

  it("flag ON resolves candidates via index search (auth → real login block from the index)", async () => {
    vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", "1");
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (isIndexUrl(url)) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                name: "login-01",
                type: "registry:block",
                description: "A simple login form.",
                categories: ["authentication", "login"],
              },
              {
                name: "dashboard-01",
                type: "registry:block",
                description: "A dashboard with sidebar, charts and data table.",
                categories: ["dashboard"],
              },
            ],
          }),
        };
      }
      if (url.includes("/login-01.json")) {
        return registryResponse("login-01", "new-york-v4", "registry:block");
      }
      return { ok: false, status: 404, text: async () => "" };
    });

    const result = await resolveShadcnUiRecipes({
      capabilities: caps({ needsAuth: true }),
      prompt: "bygg login",
      maxRecipes: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("login-01");
    expect(result[0]?.source).toBe("official");
    expect(result[0]?.reason).toContain("auth");
    // Import rewrite contract preserved on the search path.
    expect(result[0]?.files[0]?.content).toContain("@/lib/utils");
    expect(result[0]?.files[0]?.content).not.toContain("@/registry/");
  });

  it("flag ON with zero search hits falls back to legacy candidates", async () => {
    vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", "1");
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (isIndexUrl(url)) {
        // Index reachable but contains nothing matching auth queries.
        return {
          ok: true,
          json: async () => ({
            items: [{ name: "spinner", type: "registry:ui", description: "" }],
          }),
        };
      }
      if (url.includes("/login-03.json")) {
        return registryResponse("login-03", "new-york-v4", "registry:block");
      }
      return { ok: false, status: 404, text: async () => "" };
    });

    const result = await resolveShadcnUiRecipes({
      capabilities: caps({ needsAuth: true }),
      prompt: "bygg login",
      maxRecipes: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("login-03");
  });

  it("reserves one default slot for a richer planned community section", async () => {
    vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", "1");
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (isIndexUrl(url)) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { name: "card", type: "registry:ui", title: "Card" },
              { name: "card-demo", type: "registry:example", title: "Card Demo" },
              { name: "tabs", type: "registry:ui", title: "Tabs" },
            ],
          }),
        };
      }
      if (
        url.includes("shadcnblocks.com") ||
        url.includes("tailark.com") ||
        url.includes("sajtmaskin.vercel.app")
      ) {
        const itemName = url.split("/").pop()?.replace(/\.json$/, "") ?? "pricing";
        return {
          ok: true,
          json: async () => ({
            name: itemName,
            type: "registry:block",
            files: [
              {
                path: `registry/community/${itemName}.tsx`,
                type: "registry:component",
                content: "export function PricingSection() { return null }",
              },
            ],
          }),
        };
      }
      const itemName = url.split("/").pop()?.replace(/\.json$/, "") ?? "card";
      return registryResponse(itemName, "new-york-v4");
    });

    const result = await resolveShadcnUiRecipes({
      capabilities: caps(),
      prompt: "bygg en pricing-sektion med tre paket",
      maxRecipes: 3,
    });

    expect(result).toHaveLength(3);
    expect(result.slice(0, 2).every((recipe) => recipe.source === "official")).toBe(true);
    expect(result[2]?.source).toBe("community");
    expect(
      mockFetch.mock.calls.some(([input]) =>
        /shadcnblocks\.com|tailark\.com/.test(String(input)),
      ),
    ).toBe(true);
  });

  it("backfills the reserved slot from official candidates when community fetches fail", async () => {
    vi.stubEnv("SAJTMASKIN_SHADCN_RESOLVER_SEARCH", "1");
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (isIndexUrl(url)) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { name: "card", type: "registry:ui", title: "Card" },
              { name: "card-demo", type: "registry:example", title: "Card Demo" },
              { name: "tabs", type: "registry:ui", title: "Tabs" },
            ],
          }),
        };
      }
      if (url.includes("shadcnblocks.com") || url.includes("tailark.com")) {
        return { ok: false, status: 503, text: async () => "" };
      }
      const itemName = url.split("/").pop()?.replace(/\.json$/, "") ?? "card";
      return registryResponse(itemName, "new-york-v4");
    });

    const result = await resolveShadcnUiRecipes({
      capabilities: caps(),
      prompt: "bygg en pricing-sektion med tre paket",
      maxRecipes: 3,
    });

    expect(result).toHaveLength(3);
    expect(result.every((recipe) => recipe.source === "official")).toBe(true);
    expect(result.map((recipe) => recipe.name)).toContain("tabs");
  });

  it("uses community registries when no official candidate matched", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        name: "hero1",
        type: "registry:block",
        files: [
          {
            path: "registry/community/hero1.tsx",
            type: "registry:component",
            content: `import { cn } from "@/registry/community/lib/utils";\nexport function Hero1() { return null }\n`,
          },
        ],
      }),
    });

    const result = await resolveShadcnUiRecipes({
      capabilities: caps(),
      prompt: "bygg en hero med tydlig CTA",
      maxRecipes: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("community");
    expect(result[0]?.files[0]?.content).toContain("@/lib/utils");
  });
});

import { describe, expect, it } from "vitest";
import type { RegistryIndexItem } from "@/lib/shadcn/registry-service";
import type { ShadcnRegistryItem } from "@/lib/shadcn/registry-types";
import {
  buildAddCommand,
  describeComponents,
  fallbackQueriesFromDescription,
  heuristicRankCandidates,
  matchCommunityItems,
  matchOfficialIndex,
  mergeCommunityRegistries,
  OFFICIAL_REGISTRY,
  simplifyQueries,
  simplifyQuery,
  type CommunityRegistryDescriptor,
  type DescribeCandidate,
  type DescribeDeps,
} from "@/lib/shadcn/describe";

// ---------------------------------------------------------------------------
// Query generation (deterministic fallback)
// ---------------------------------------------------------------------------

describe("fallbackQueriesFromDescription", () => {
  it("extracts lowercase keyword queries and drops Swedish/English stopwords", () => {
    const queries = fallbackQueriesFromDescription(
      "En stapelbar med tre staplar som mäter försäljning",
    );
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.length).toBeLessThanOrEqual(3);
    // stopwords must never appear as a standalone query
    expect(queries).not.toContain("en");
    expect(queries).not.toContain("med");
    expect(queries).not.toContain("som");
    // everything is lowercase
    for (const q of queries) expect(q).toBe(q.toLowerCase());
    // the most specific keyword is surfaced
    expect(queries.some((q) => q.includes("försäljning"))).toBe(true);
  });

  it("returns 1-3 de-duplicated queries", () => {
    const queries = fallbackQueriesFromDescription("login login login form dialog");
    expect(queries.length).toBeGreaterThanOrEqual(1);
    expect(queries.length).toBeLessThanOrEqual(3);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it("returns an empty array for an empty description", () => {
    expect(fallbackQueriesFromDescription("   ")).toEqual([]);
  });

  it("falls back to the raw text when there are no content tokens", () => {
    // Only stopwords -> no content tokens -> raw lowercase text.
    expect(fallbackQueriesFromDescription("en och med")).toEqual(["en och med"]);
  });
});

// ---------------------------------------------------------------------------
// No-results fallback (query simplification)
// ---------------------------------------------------------------------------

describe("simplifyQuery / simplifyQueries", () => {
  it("reduces a sentence to its single most specific keyword", () => {
    const simplified = simplifyQuery("a pricing table with three tiers");
    expect(simplified).toBe("pricing");
    expect(simplified.split(" ")).toHaveLength(1);
  });

  it("returns an empty string when the query has no content token", () => {
    expect(simplifyQuery("a the of")).toBe("");
  });

  it("keeps a simplified query only when it is new, else derives from description", () => {
    // "login form" simplifies to "login" which IS new vs the original query set.
    expect(simplifyQueries(["login form"], "login form")).toEqual(["login"]);
  });

  it("falls back to description keywords when simplification adds nothing new", () => {
    // A single-token query simplifies to itself (not new) -> description fallback.
    const out = simplifyQueries(["zzzznomatch"], "login form please");
    expect(out).not.toEqual(["zzzznomatch"]);
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Search (fuzzy over provided registry data)
// ---------------------------------------------------------------------------

const OFFICIAL_INDEX: RegistryIndexItem[] = [
  { name: "login-03", type: "registry:block", description: "A login form with image" },
  { name: "chart-bar-default", type: "registry:block", description: "A bar chart" },
  { name: "dialog", type: "registry:ui", description: "A modal dialog" },
  { name: "table", type: "registry:ui", description: "A data table" },
];

describe("matchOfficialIndex", () => {
  it("returns matching items sorted by score", () => {
    const matches = matchOfficialIndex(OFFICIAL_INDEX, ["login"], 5);
    expect(matches[0]?.name).toBe("login-03");
    expect(matches[0]?.registry).toBe(OFFICIAL_REGISTRY);
    expect(matches.every((m) => m.score > 0)).toBe(true);
  });

  it("returns nothing when no item matches the queries", () => {
    expect(matchOfficialIndex(OFFICIAL_INDEX, ["zzzznomatch"], 5)).toEqual([]);
  });

  it("respects the max cap", () => {
    const matches = matchOfficialIndex(OFFICIAL_INDEX, ["a"], 1);
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});

describe("matchCommunityItems", () => {
  const registries: CommunityRegistryDescriptor[] = [
    {
      namespace: "@tailark",
      urlTemplate: "https://tailark.com/r/{name}.json",
      description: "hero features pricing",
      itemNames: ["hero-section-1", "pricing-1"],
    },
  ];

  it("scores seeded item names + namespace description", () => {
    const matches = matchCommunityItems(registries, ["pricing"], 5);
    expect(matches.some((m) => m.name === "pricing-1")).toBe(true);
    expect(matches.every((m) => m.registry === "@tailark")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Candidate assembly
// ---------------------------------------------------------------------------

describe("buildAddCommand", () => {
  it("builds an unqualified command for the built-in official registry", () => {
    expect(buildAddCommand(OFFICIAL_REGISTRY, "login-03")).toBe(
      "npx shadcn@latest add login-03",
    );
  });

  it("namespace-qualifies community registries", () => {
    expect(buildAddCommand("@tailark", "hero-section-1")).toBe(
      "npx shadcn@latest add @tailark/hero-section-1",
    );
  });
});

describe("mergeCommunityRegistries", () => {
  it("reads registry list from components.json and item names from the seed", () => {
    const merged = mergeCommunityRegistries(
      {
        "@tailark": "https://tailark.com/r/{name}.json",
        "@magicui": "https://magicui.design/r/{name}",
      },
      [
        {
          namespace: "@tailark",
          url: "https://tailark.com/r/{name}.json",
          sectionMappings: { hero: ["hero-section-1"], pricing: ["pricing-1"] },
        },
      ],
    );
    const tailark = merged.find((r) => r.namespace === "@tailark");
    expect(tailark?.itemNames.sort()).toEqual(["hero-section-1", "pricing-1"]);
    // A namespace without a seed still appears (from components.json) with no items.
    expect(merged.find((r) => r.namespace === "@magicui")?.itemNames).toEqual([]);
  });

  it("drops registry URLs missing the mandatory {name} placeholder", () => {
    const merged = mergeCommunityRegistries({ "@bad": "https://x.com/registry.json" }, []);
    expect(merged).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ranking (heuristic fallback)
// ---------------------------------------------------------------------------

describe("heuristicRankCandidates", () => {
  const candidates: DescribeCandidate[] = [
    {
      name: "login-03",
      registry: OFFICIAL_REGISTRY,
      description: "A login form with image",
      addCommand: "npx shadcn@latest add login-03",
    },
    {
      name: "table",
      registry: OFFICIAL_REGISTRY,
      description: "A data table",
      addCommand: "npx shadcn@latest add table",
    },
  ];

  it("orders by description token overlap and clamps to the limit", () => {
    const ranked = heuristicRankCandidates("I need a login form", candidates, 1);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].name).toBe("login-03");
    expect(ranked[0].reason).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Orchestrator (dependency-injected, no network / no LLM)
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<DescribeDeps>): Partial<DescribeDeps> {
  const item: ShadcnRegistryItem = {
    name: "login-03",
    description: "A login form with image",
    dependencies: ["lucide-react"],
    registryDependencies: ["button", "input"],
    files: [{ path: "login-03.tsx", content: "export default function () {}" }],
  };
  return {
    generateQueries: async () => ["login"],
    rankCandidates: async (description, candidates, limit) => ({
      candidates: heuristicRankCandidates(description, candidates, limit),
      ranking: "heuristic",
    }),
    fetchOfficialIndex: async () => OFFICIAL_INDEX,
    fetchItem: async ({ registry, name }) =>
      registry === OFFICIAL_REGISTRY && name === "login-03" ? item : null,
    communityRegistries: [],
    ...overrides,
  };
}

describe("describeComponents (orchestrator)", () => {
  it("returns hydrated, ranked candidates for the happy path", async () => {
    const result = await describeComponents(
      { description: "a login form", limit: 5 },
      makeDeps({}),
    );
    expect(result.ranking).toBe("heuristic");
    expect(result.usedFallbackQueries).toBe(false);
    expect(result.candidates.length).toBeGreaterThan(0);
    const login = result.candidates.find((c) => c.name === "login-03");
    expect(login).toBeDefined();
    expect(login?.addCommand).toBe("npx shadcn@latest add login-03");
    expect(login?.registryDependencies).toEqual(["button", "input"]);
    // official candidates get preview PNG URLs
    expect(login?.previewLight).toContain("login-03");
    expect(login?.previewDark).toContain("login-03");
  });

  it("retries with simplified queries when the first search returns no hits", async () => {
    const result = await describeComponents(
      { description: "login form please" },
      makeDeps({ generateQueries: async () => ["zzzznomatch"] }),
    );
    expect(result.usedFallbackQueries).toBe(true);
    expect(result.candidates.some((c) => c.name === "login-03")).toBe(true);
  });

  it("clamps limit to 1..10", async () => {
    const result = await describeComponents(
      { description: "a login form", limit: 999 },
      makeDeps({
        // Return many candidates so the clamp is observable.
        fetchOfficialIndex: async () =>
          Array.from({ length: 20 }, (_, i) => ({
            name: `login-${i}`,
            type: "registry:block",
            description: "A login form",
          })),
        fetchItem: async ({ name }) => ({ name }),
      }),
    );
    expect(result.candidates.length).toBeLessThanOrEqual(10);
  });

  it("forwards the requested style to official item hydration", async () => {
    const seenStyles: (string | undefined)[] = [];
    await describeComponents(
      { description: "a login form", style: "new-york-v4" },
      makeDeps({
        fetchItem: async ({ registry, name, style }) => {
          seenStyles.push(style);
          return registry === OFFICIAL_REGISTRY && name === "login-03"
            ? { name: "login-03" }
            : null;
        },
      }),
    );
    expect(seenStyles).toContain("new-york-v4");
  });

  it("drops community candidates whose item cannot be verified", async () => {
    const result = await describeComponents(
      { description: "hero section" },
      makeDeps({
        generateQueries: async () => ["hero"],
        fetchOfficialIndex: async () => [],
        communityRegistries: [
          {
            namespace: "@tailark",
            urlTemplate: "https://tailark.com/r/{name}.json",
            description: "hero features",
            itemNames: ["hero-section-1"],
          },
        ],
        // community hydrate fails -> candidate dropped
        fetchItem: async () => null,
      }),
    );
    expect(result.candidates).toEqual([]);
  });
});

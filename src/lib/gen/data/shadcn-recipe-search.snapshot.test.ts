/**
 * Relevance contracts against the pinned offline registry index. Index updates
 * may change chosen items, but not requested concepts, eligible types, priority,
 * deterministic selection or configured community boundaries.
 * Actual resolver fallback/reservation/backfill: shadcn-ui-recipes.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCommunitySearchPlans,
  buildOfficialSearchCandidates,
  buildRecipeSearchIntents,
  loadCommunitySeedEntries,
  loadDescribeCommunityRegistries,
} from "./shadcn-recipe-search";
import type { RegistryIndexItem } from "@/lib/shadcn/registry-service";
import type { InferredCapabilities } from "../capability-inference";
import { buildLegacyCandidates } from "./shadcn-ui-recipes";

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

const fixture = JSON.parse(
  readFileSync(
    join(process.cwd(), "src/lib/gen/data/__fixtures__/shadcn-registry-index.snapshot.json"),
    "utf-8",
  ),
) as { items: RegistryIndexItem[] };

const SCENARIOS = [
  {
    id: "auth",
    prompt: "bygg en inloggningssida för medlemmar",
    capabilities: caps({ needsAuth: true, needsForms: true }),
    concepts: [/login/, /signup/, /form/, /input/, /field/],
    first: /^login(?:-|$)/,
    communitySection: null,
  },
  {
    id: "dashboard",
    prompt: "bygg en dashboard med statistik och tabeller för försäljning",
    capabilities: caps({ needsAppShell: true, needsCharts: true, needsDataUI: true }),
    concepts: [/dashboard/, /sidebar/, /data-table/, /chart-area/, /chart-bar/, /table/],
    first: /^dashboard(?:-|$)/,
    communitySection: "stats",
  },
  {
    id: "pricing",
    prompt: "en landningssida med pricing i tre paket",
    capabilities: caps(),
    concepts: [/card/, /tabs/],
    first: /^card(?:-|$)/,
    communitySection: "pricing",
  },
  {
    id: "charts",
    prompt: "visa försäljningsdata i interaktiva diagram",
    capabilities: caps({ needsCharts: true }),
    concepts: [/chart-area/, /chart-bar/],
    first: /^chart-area(?:-|$)/,
    communitySection: null,
  },
  {
    id: "ecommerce",
    prompt: "en webbshop med produktgalleri och kassa",
    capabilities: caps({ needsEcommerce: true, needsCarousel: true, needsPayments: true }),
    concepts: [/dialog/, /form/, /card/, /carousel/, /sheet/, /drawer/, /input-group/],
    first: /^dialog(?:-|$)/,
    communitySection: null,
  },
  {
    id: "forms",
    prompt: "kontaktformulär med bokningskalender",
    capabilities: caps({ needsForms: true, needsCalendar: true }),
    concepts: [/date-picker/, /form/, /calendar/, /input/, /field/],
    first: /^date-picker(?:-|$)/,
    communitySection: "contact",
  },
];

describe("recipe relevance and boundaries against the offline index", () => {
  for (const scenario of SCENARIOS) {
    describe(scenario.id, () => {
      it("preserves the requested concepts when search falls back to legacy candidates", () => {
        const candidates = buildLegacyCandidates(scenario.capabilities, scenario.prompt);
        const names = candidates.map((candidate) => candidate.name);
        expect(names.length).toBeGreaterThan(0);
        expect(new Set(names).size).toBe(names.length);
        expect(names[0]).toMatch(scenario.first);
        for (const concept of scenario.concepts) {
          expect(
            names.some((name) => concept.test(name)),
            "missing fallback " + concept,
          ).toBe(true);
        }
        expect(candidates.map((candidate) => candidate.priority)).toEqual(
          candidates.map((candidate) => candidate.priority).sort((a, b) => b - a),
        );
        expect(buildLegacyCandidates(scenario.capabilities, scenario.prompt)).toEqual(candidates);
      });

      it("selects real eligible items covering the requested concepts in priority order", () => {
        const intents = buildRecipeSearchIntents(scenario.capabilities, scenario.prompt);
        const search = buildOfficialSearchCandidates(fixture.items, intents);
        const names = search.map((candidate) => candidate.name);
        expect(search.length).toBeGreaterThan(0);
        expect(search.length).toBeLessThanOrEqual(intents.length * 2);
        expect(new Set(names).size).toBe(names.length);
        expect(names[0]).toMatch(scenario.first);
        for (const concept of scenario.concepts) {
          expect(
            names.some((name) => concept.test(name)),
            "missing " + concept,
          ).toBe(true);
        }
        for (const candidate of search) {
          const item = fixture.items.find((entry) => entry.name === candidate.name);
          expect(item, candidate.name + " missing from index").toBeDefined();
          expect(["registry:ui", "registry:block", "registry:example"]).toContain(item?.type);
          expect(Number.isFinite(candidate.priority)).toBe(true);
        }
        expect(search.map((candidate) => candidate.priority)).toEqual(
          search.map((candidate) => candidate.priority).sort((a, b) => b - a),
        );
        expect(buildOfficialSearchCandidates(fixture.items, intents)).toEqual(search);
      });

      it("selects deterministic community items only from configured relevant pools", () => {
        const intents = buildRecipeSearchIntents(scenario.capabilities, scenario.prompt);
        const registries = loadDescribeCommunityRegistries();
        const seeds = loadCommunitySeedEntries();
        const plans = buildCommunitySearchPlans(registries, intents, scenario.prompt, seeds);
        if (scenario.communitySection === null) {
          expect(plans).toEqual([]);
        } else {
          const section = scenario.communitySection;
          const eligible = registries.filter((registry) =>
            seeds.some(
              (seed) =>
                seed.namespace === registry.namespace && seed.sectionMappings?.[section]?.length,
            ),
          );
          expect(eligible.length).toBeGreaterThan(0);
          expect(new Set(plans.map((plan) => plan.namespace))).toEqual(
            new Set(eligible.map((registry) => registry.namespace)),
          );
          for (const registry of eligible) {
            const seed = seeds.find((entry) => entry.namespace === registry.namespace)!;
            const selected = plans.filter((plan) => plan.namespace === registry.namespace);
            expect(selected.length).toBeLessThanOrEqual(Math.max(1, seed.maxPerGeneration ?? 1));
            expect(new Set(selected.map((plan) => plan.itemName)).size).toBe(selected.length);
            for (const plan of selected) {
              expect(plan.urlTemplate).toBe(registry.urlTemplate);
              expect(seed.sectionMappings![section]).toContain(plan.itemName);
              expect(registry.itemNames).toContain(plan.itemName);
            }
          }
        }
        expect(buildCommunitySearchPlans(registries, intents, scenario.prompt, seeds)).toEqual(
          plans,
        );
      });
    });
  }
});

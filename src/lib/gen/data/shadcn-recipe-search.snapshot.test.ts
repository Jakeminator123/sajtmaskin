/**
 * Fas 4 regression evidence: candidate sets for six typical prompt classes,
 * search-driven (new) vs legacy hardcoded, computed against a pinned snapshot
 * of the official registry index
 * (`__fixtures__/shadcn-registry-index.snapshot.json`, fetched 2026-07-22)
 * and the repo's real community config (`components.json` +
 * `config/community-registries.json`).
 *
 * This is the eval-compensation gate from the plan
 * (2026-07-22-shadcn-registry-beskriv-komposition.md, Fas 4): the search path
 * must produce candidates at least as relevant as the legacy lists. Notable
 * deltas, reviewed 2026-07-22:
 * - auth: legacy pinned `login-03`/`login-04`/`input-form`; search resolves
 *   `login-01`/`login-02` (equivalent login blocks) and drops `input-form`,
 *   which NO LONGER EXISTS in the live index (legacy fetches it → 404 → dead
 *   candidate slot).
 * - dashboard: same top block (`dashboard-01`) + same data-table/chart
 *   coverage; `sidebar-01` replaces `sidebar-07` (both real sidebar blocks).
 * - community plans for section prompts are byte-identical to the legacy
 *   per-section picks (same seeded pool + same DJB seed string).
 *
 * If the pinned index fixture is refreshed, re-review the lists below for
 * relevance parity — do not blind-update.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildLegacyCandidates } from "./shadcn-ui-recipes";
import {
  buildCommunitySearchPlans,
  buildOfficialSearchCandidates,
  buildRecipeSearchIntents,
  loadCommunitySeedEntries,
  loadDescribeCommunityRegistries,
} from "./shadcn-recipe-search";
import type { RegistryIndexItem } from "@/lib/shadcn/registry-service";
import type { InferredCapabilities } from "../capability-inference";

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
    join(
      process.cwd(),
      "src/lib/gen/data/__fixtures__/shadcn-registry-index.snapshot.json",
    ),
    "utf-8",
  ),
) as { items: RegistryIndexItem[] };

interface Scenario {
  id: string;
  prompt: string;
  capabilities: InferredCapabilities;
  expectedLegacy: string[];
  expectedSearch: string[];
  expectedCommunityPlans: string[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "auth",
    prompt: "bygg en inloggningssida för medlemmar",
    capabilities: caps({ needsAuth: true, needsForms: true }),
    expectedLegacy: ["login-03", "login-04", "form", "signup-01", "input-form", "field"],
    expectedSearch: [
      "login-01",
      "login-02",
      "form",
      "signup-01",
      "input",
      "card-with-form",
      "signup-02",
      "button-group-input",
      "field",
      "field-checkbox",
    ],
    expectedCommunityPlans: [],
  },
  {
    id: "dashboard",
    prompt: "bygg en dashboard med statistik och tabeller för försäljning",
    capabilities: caps({ needsAppShell: true, needsCharts: true, needsDataUI: true }),
    expectedLegacy: [
      "dashboard-01",
      "data-table-demo",
      "chart-area-interactive",
      "sidebar-07",
      "chart-bar-default",
      "table",
    ],
    expectedSearch: [
      "dashboard-01",
      "sidebar-01",
      "data-table-demo",
      "chart-area-interactive",
      "sidebar",
      "chart-area-axes",
      "chart-bar-active",
      "table",
      "chart-bar-default",
    ],
    // Identical to the legacy per-section picks (stats section, same DJB seed).
    expectedCommunityPlans: ["@shadcnblocks/stats1", "@tailark/stats-1"],
  },
  {
    id: "pricing",
    prompt: "en landningssida med pricing i tre paket",
    capabilities: caps(),
    expectedLegacy: ["card", "tabs"],
    expectedSearch: ["card", "card-demo", "tabs", "tabs-demo"],
    // Identical to the legacy per-section picks (pricing section, same DJB seed).
    expectedCommunityPlans: ["@shadcnblocks/pricing3", "@tailark/pricing-3"],
  },
  {
    id: "charts",
    prompt: "visa försäljningsdata i interaktiva diagram",
    capabilities: caps({ needsCharts: true }),
    expectedLegacy: ["chart-area-interactive", "chart-bar-default"],
    expectedSearch: [
      "chart-area-interactive",
      "chart-area-axes",
      "chart-bar-active",
      "chart-bar-default",
    ],
    expectedCommunityPlans: [],
  },
  {
    id: "ecommerce",
    prompt: "en webbshop med produktgalleri och kassa",
    capabilities: caps({ needsEcommerce: true, needsCarousel: true, needsPayments: true }),
    expectedLegacy: [
      "dialog",
      "form",
      "card",
      "carousel-demo",
      "sheet",
      "drawer",
      "input-group",
    ],
    expectedSearch: [
      "dialog",
      "alert-dialog",
      "form",
      "card",
      "card-with-form",
      "card-demo",
      "carousel",
      "sheet",
      "carousel-api",
      "drawer",
      "sheet-demo",
      "drawer-demo",
      "input-group",
      "button-group-input",
    ],
    expectedCommunityPlans: [],
  },
  {
    id: "forms",
    prompt: "kontaktformulär med bokningskalender",
    capabilities: caps({ needsForms: true, needsCalendar: true }),
    expectedLegacy: ["date-picker-demo", "form", "input-form", "calendar", "field"],
    expectedSearch: [
      "date-picker-demo",
      "form",
      "date-picker-with-presets",
      "input",
      "card-with-form",
      "calendar",
      "button-group-input",
      "field",
      "calendar-demo",
      "field-checkbox",
    ],
    // Identical to the legacy per-section picks (contact section, same DJB seed).
    expectedCommunityPlans: ["@shadcnblocks/contact1", "@tailark/contact-2"],
  },
];

describe("Fas 4 candidate snapshot: search-driven vs legacy (pinned index)", () => {
  for (const scenario of SCENARIOS) {
    describe(scenario.id, () => {
      it("legacy candidates are unchanged (fallback contract)", () => {
        const legacy = buildLegacyCandidates(scenario.capabilities, scenario.prompt);
        expect(legacy.map((candidate) => candidate.name)).toEqual(
          scenario.expectedLegacy,
        );
      });

      it("search candidates match the reviewed snapshot", () => {
        const intents = buildRecipeSearchIntents(scenario.capabilities, scenario.prompt);
        const search = buildOfficialSearchCandidates(fixture.items, intents);
        expect(search.map((candidate) => candidate.name)).toEqual(
          scenario.expectedSearch,
        );
      });

      it("community plans match the reviewed snapshot", () => {
        const intents = buildRecipeSearchIntents(scenario.capabilities, scenario.prompt);
        const plans = buildCommunitySearchPlans(
          loadDescribeCommunityRegistries(),
          intents,
          scenario.prompt,
          loadCommunitySeedEntries(),
        );
        expect(plans.map((plan) => `${plan.namespace}/${plan.itemName}`)).toEqual(
          scenario.expectedCommunityPlans,
        );
      });
    });
  }

  it("every search-selected official candidate exists in the pinned index", () => {
    const validNames = new Set(fixture.items.map((item) => item.name));
    for (const scenario of SCENARIOS) {
      for (const name of scenario.expectedSearch) {
        expect(validNames.has(name), `${name} missing from index`).toBe(true);
      }
    }
  });

  it("legacy list contains dead upstream candidates that search eliminates (input-form)", () => {
    const validNames = new Set(fixture.items.map((item) => item.name));
    // Documents WHY search-driven wins: the legacy hardcoded name drifted out
    // of the live registry and burned a candidate slot on a guaranteed 404.
    expect(validNames.has("input-form")).toBe(false);
    expect(
      SCENARIOS.find((scenario) => scenario.id === "auth")?.expectedLegacy,
    ).toContain("input-form");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _clearShadcnUiRecipeCachesForTests,
  resolveShadcnUiRecipes,
} from "./shadcn-ui-recipes";
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
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
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

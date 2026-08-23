import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  briefGenerateObjectProviderOptions,
  briefRequestSchema,
  buildBriefTrace,
  resolveServerAutoBriefPreferredModel,
  simplifiedBriefSchema,
  siteBriefSchema,
} from "./site-brief-generation";
import { getTemperatureConfig } from "./direct-model";
import { getDefaultPromptAssistModel } from "./defaults";

/**
 * Alla objektnycklar i JSON-schemat som INTE ligger i sitt `required` — exakt
 * det OpenAI:s strikta läge avvisar. Går igenom nästlade objekt och arrayer, så
 * `bullets` inne i ett sektionsobjekt hittas också.
 */
function optionalJsonSchemaPaths(schema: z.ZodType): string[] {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<
    string,
    unknown
  >;
  const found: string[] = [];

  const walk = (node: unknown, path: string): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const properties = record.properties as Record<string, unknown> | undefined;
    if (properties) {
      const required = new Set(Array.isArray(record.required) ? (record.required as string[]) : []);
      for (const key of Object.keys(properties)) {
        if (!required.has(key)) found.push(path ? `${path}.${key}` : key);
        walk(properties[key], path ? `${path}.${key}` : key);
      }
    }
    if (record.items) walk(record.items, `${path}[]`);
  };

  walk(json, "");
  return found;
}

describe("siteBriefSchema", () => {
  it("accepts canonical init signals consumed by orchestration", () => {
    const parsed = siteBriefSchema.parse({
      projectTitle: "Kafé Sol",
      brandName: "Kafé Sol",
      oneSentencePitch: "Ett varmt kafé med bokningar och lokala råvaror.",
      targetAudience: "Malmöbor som vill fika nära jobbet",
      primaryCallToAction: "Boka bord",
      toneAndVoice: ["varm", "lokal"],
      domainProfile: "restaurant",
      motionLevel: "moderate",
      qualityBar: "premium",
      seasonalHints: ["vår"],
      requestedCapabilities: ["booking", "map-display"],
      pages: [
        {
          name: "Hem",
          path: "/",
          purpose: "Presentera kaféet",
          sections: [
            {
              type: "hero",
              heading: "Välkommen till Kafé Sol",
              bullets: ["Lokalt kaffe", "Boka bord online"],
            },
          ],
        },
      ],
      visualDirection: {
        styleKeywords: ["varm", "editorial"],
        colorPalette: {
          primary: "#8B4513",
          secondary: "#F4A460",
          accent: "#FFD700",
          background: "#FFF8F0",
          text: "#2B1B10",
        },
        typography: {
          headings: "Fraunces",
          body: "Source Sans 3",
        },
      },
      imagery: {
        needsImages: true,
        styleKeywords: ["kaffe", "lokal"],
        suggestedSubjects: ["espresso", "innergård"],
        altTextRules: ["Beskriv mat och miljö", "Undvik generisk alt-text"],
      },
      uiNotes: {
        components: ["hero", "booking CTA", "menu cards"],
        interactions: ["hover states", "smooth scroll"],
        accessibility: ["kontrast", "tangentbord", "labels"],
      },
      seo: {
        titleTemplate: "{page} | Kafé Sol",
        metaDescription: "Kafé Sol i Malmö med lokalt kaffe och bokning.",
        keywords: ["kafé", "malmö", "kaffe"],
      },
    });

    expect(parsed.domainProfile).toBe("restaurant");
    expect(parsed.motionLevel).toBe("moderate");
    expect(parsed.qualityBar).toBe("premium");
    expect(parsed.seasonalHints).toEqual(["vår"]);
    expect(parsed.requestedCapabilities).toEqual(["booking", "map-display"]);
  });

  it("defaults canonical init signals in simplified fallback schema", () => {
    const parsed = simplifiedBriefSchema.parse({
      projectTitle: "Enkel sajt",
      oneSentencePitch: "En enkel sajt för ett lokalt företag.",
    });
    expect(parsed.domainProfile).toBe("general");
    expect(parsed.motionLevel).toBe("minimal");
    expect(parsed.qualityBar).toBe("clean");
    expect(parsed.seasonalHints).toEqual([]);
    expect(parsed.requestedCapabilities).toEqual([]);
  });

  // Prod 2026-07-27: /api/ai/brief svarade 422 "Missing 'bullets'" när
  // fallbacken användes. OpenAI:s strikta structured outputs kräver att
  // `required` listar varje nyckel i `properties`, och `.default()` gör fältet
  // optional — så fallbacken kunde aldrig lyckas mot OpenAI.
  it("dokumenterar att toleransen gör schemat oförenligt med strikt läge", () => {
    const optional = optionalJsonSchemaPaths(simplifiedBriefSchema);

    expect(optional).toContain("pages[].sections[].bullets");
    expect(optional).toContain("requestedCapabilities");
  });

  it("håller fallbacken användbar: antingen alla fält required, eller icke-strikt läge", () => {
    // Invarianten överlever båda framtida riktningar — gör man schemat
    // helt-required får flaggan tas bort, och tar man bort flaggan måste
    // schemat först göras strict-safe. Ett enda villkor, alltid utvärderat.
    const strictSafe = optionalJsonSchemaPaths(simplifiedBriefSchema).length === 0;
    // Vakta vägen som faktiskt anropar generateObject, inte konstanten vid
    // sidan om: en inlinead flagga i helpern skulle annars göra testet ihåligt.
    const sentNonStrict = (
      [
        ["openai", "gpt-5.6-sol"],
        ["openai", "gpt-4o"],
        ["anthropic", "claude-sonnet-4-5"],
      ] as const
    ).every(
      ([provider, modelId]) =>
        briefGenerateObjectProviderOptions(provider, modelId, true).providerOptions?.openai
          .strictJsonSchema === false,
    );

    expect(strictSafe || sentNonStrict).toBe(true);
  });

  it("keeps request defaults for the HTTP brief entrypoint", () => {
    const parsed = briefRequestSchema.parse({ prompt: "Bygg en sajt" });
    expect(parsed.imageGenerations).toBe(true);
  });
});

describe("buildBriefTrace", () => {
  it("creates stable trace ids for equivalent brief inputs", () => {
    const a = buildBriefTrace({
      source: "dynamic_instructions",
      prompt: "  En sajt för pizzaälskare  ",
      modelId: "openai/gpt-5.4",
      imageGenerations: true,
      temperature: 0.2,
      maxTokens: 8000,
    });
    const b = buildBriefTrace({
      source: "dynamic_instructions",
      prompt: "En sajt för pizzaälskare",
      modelId: "openai/gpt-5.4",
      imageGenerations: true,
      temperature: 0.2,
      maxTokens: 8000,
    });

    expect(a).toEqual(b);
    expect(a.promptHash).toHaveLength(24);
    expect(a.traceId).toBe(`brief:dynamic_instructions:openai/gpt-5.4:${a.promptHash}`);
  });

  it("separates client and server auto brief sources for GPT-log correlation", () => {
    const base = {
      prompt: "En sajt för pizzaälskare",
      modelId: "openai/gpt-5.4",
      imageGenerations: true,
      temperature: 0.2,
      maxTokens: 8000,
    };

    const client = buildBriefTrace({ ...base, source: "dynamic_instructions" });
    const server = buildBriefTrace({ ...base, source: "server_auto_brief" });

    expect(client.promptHash).toBe(server.promptHash);
    expect(client.traceId).not.toBe(server.traceId);
    expect(client.source).toBe("dynamic_instructions");
    expect(server.source).toBe("server_auto_brief");
  });
});

describe("resolveServerAutoBriefPreferredModel", () => {
  it("uses the active build tier when no explicit or env model overrides it", () => {
    const previousOpenAI = process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
    const previousAnthropic = process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_ANTHROPIC;
    delete process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
    delete process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_ANTHROPIC;
    try {
      expect(resolveServerAutoBriefPreferredModel({ modelTier: "premium" })).toBe(
        "openai/gpt-5.6-sol",
      );
      expect(resolveServerAutoBriefPreferredModel({ modelTier: "max" })).toBe(
        "openai/gpt-5.5",
      );
      expect(resolveServerAutoBriefPreferredModel({ modelTier: "anthropic" })).toBe(
        "anthropic/claude-opus-4.8",
      );
      // `pro` är DEFAULT_MODEL_TIER och pekar mot en kodmodell — den nivån
      // hade ingen täckning, trots att den bär mest trafik den dag prioritets-
      // ordningen nedan ändras.
      expect(resolveServerAutoBriefPreferredModel({ modelTier: "pro" })).toBe(
        "openai/gpt-5.3-codex",
      );
      expect(resolveServerAutoBriefPreferredModel({ modelTier: "codex" })).toBe(
        "openai/gpt-5.5",
      );
    } finally {
      if (previousOpenAI === undefined) delete process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
      else process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI = previousOpenAI;
      if (previousAnthropic === undefined) {
        delete process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_ANTHROPIC;
      } else {
        process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_ANTHROPIC = previousAnthropic;
      }
    }
  });

  it("keeps explicit request selection above env and per-tier defaults", () => {
    const previous = process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
    process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI = "openai/gpt-5.5";
    try {
      expect(
        resolveServerAutoBriefPreferredModel({
          modelTier: "premium",
          assistModelHint: "openai/gpt-5.6-terra",
        }),
      ).toBe("openai/gpt-5.6-terra");
    } finally {
      if (previous === undefined) delete process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
      else process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI = previous;
    }
  });

  // Karaktäriseringstest, inte en önskad ordning: buildern skickar ALLTID
  // `meta.promptAssistModel` (`useBuilderState` initierar det från
  // `getDefaultPromptAssistModel()`), så hint-grenen vinner för all UI-trafik
  // och `perTierBriefing` blir aldrig avgörande där. Raden finns för att den
  // dagen någon vill att nivån ska styra måste den här förväntan ändras
  // medvetet — inte upptäckas i produktion.
  it("lets a default-valued assist hint bypass per-tier briefing (today's behaviour)", () => {
    const previousOpenAI = process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
    delete process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
    try {
      expect(
        resolveServerAutoBriefPreferredModel({
          modelTier: "pro",
          assistModelHint: getDefaultPromptAssistModel(),
        }),
      ).toBe(getDefaultPromptAssistModel());
      expect(
        resolveServerAutoBriefPreferredModel({
          modelTier: "pro",
          assistModelHint: getDefaultPromptAssistModel(),
        }),
      ).not.toBe("openai/gpt-5.3-codex");
    } finally {
      if (previousOpenAI === undefined) delete process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
      else process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI = previousOpenAI;
    }
  });

  it("lets the selected provider's auto-brief env override its tier default", () => {
    const previous = process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
    process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI = "openai/gpt-5.6-luna";
    try {
      expect(resolveServerAutoBriefPreferredModel({ modelTier: "premium" })).toBe(
        "openai/gpt-5.6-luna",
      );
    } finally {
      if (previous === undefined) delete process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI;
      else process.env.SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI = previous;
    }
  });
});

describe("getTemperatureConfig (brief sampling, MB-2)", () => {
  it("strips temperature for Claude Opus across every id form", () => {
    // The brief path posts temperature: 0.2 (useInitBrief) and forwards it into
    // generateSiteBriefObject → getTemperatureConfig. Opus rejects custom
    // sampling, so every Opus id variant must yield no temperature.
    expect(getTemperatureConfig("anthropic/claude-opus-4.8", 0.2)).toEqual({});
    expect(getTemperatureConfig("anthropic-direct/claude-opus-4-8", 0.2)).toEqual({});
    expect(getTemperatureConfig("claude-opus-4-8", 0.2)).toEqual({});
    // Back-compat Opus id retained for MB-1 is also stripped.
    expect(getTemperatureConfig("anthropic/claude-opus-4.6", 0.7)).toEqual({});
  });

  it("still strips temperature for OpenAI reasoning models", () => {
    expect(getTemperatureConfig("openai/gpt-5.5", 0.2)).toEqual({});
    expect(getTemperatureConfig("openai/gpt-5.4", 0.2)).toEqual({});
  });

  it("keeps temperature for non-reasoning, non-Opus models (e.g. Haiku)", () => {
    expect(getTemperatureConfig("anthropic-direct/claude-haiku-4-5-20251001", 0.2)).toEqual({
      temperature: 0.2,
    });
    expect(getTemperatureConfig("anthropic-direct/claude-haiku-4-5-20251001", 0.5)).toEqual({
      temperature: 0.5,
    });
  });

  it("omits temperature when the caller provided none", () => {
    expect(getTemperatureConfig("anthropic/claude-opus-4.8")).toEqual({});
    expect(getTemperatureConfig("anthropic-direct/claude-haiku-4-5-20251001")).toEqual({});
  });
});

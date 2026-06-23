import { describe, expect, it } from "vitest";
import {
  briefRequestSchema,
  buildBriefTrace,
  simplifiedBriefSchema,
  siteBriefSchema,
} from "./site-brief-generation";
import { getTemperatureConfig } from "./direct-model";

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
      requestedCapabilities: ["booking", "parallax-scroll"],
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
    expect(parsed.requestedCapabilities).toEqual(["booking", "parallax-scroll"]);
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

  it("keeps temperature for non-reasoning, non-Opus models (e.g. Sonnet)", () => {
    expect(getTemperatureConfig("anthropic/claude-sonnet-4.6", 0.2)).toEqual({
      temperature: 0.2,
    });
    expect(getTemperatureConfig("anthropic-direct/claude-haiku-4-5-20251001", 0.5)).toEqual({
      temperature: 0.5,
    });
  });

  it("omits temperature when the caller provided none", () => {
    expect(getTemperatureConfig("anthropic/claude-opus-4.8")).toEqual({});
    expect(getTemperatureConfig("anthropic/claude-sonnet-4.6")).toEqual({});
  });
});

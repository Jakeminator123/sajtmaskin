import { describe, expect, it } from "vitest";
import { briefRequestSchema, simplifiedBriefSchema, siteBriefSchema } from "./site-brief-generation";

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

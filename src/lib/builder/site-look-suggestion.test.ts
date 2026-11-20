import { describe, expect, it } from "vitest";

import {
  DEFAULT_SITE_LOOK_THEMES,
  inferBuildTargetFromDescription,
  normalizeDescription,
  suggestSiteLook,
} from "./site-look-suggestion";
import { THEME_CLUSTERS, type ThemeClusterId } from "./theme-presets";

const CAFE_BRIEF =
  "Skapa en hemsida för Café Lindgren, ett litet kafé i Uppsala. Varm, ljus och modern känsla.";

describe("suggestSiteLook", () => {
  it("ger tre neutrala utgångslägen utan beskrivning", () => {
    for (const empty of ["", "   ", null, undefined]) {
      const suggestion = suggestSiteLook(empty);
      expect(suggestion.themes).toEqual(DEFAULT_SITE_LOOK_THEMES);
      expect(suggestion.matched).toBe(false);
      expect(suggestion.basis).toBeNull();
      expect(suggestion.colorMode).toBeNull();
    }
  });

  /**
   * Testets egen brief (Café Lindgren). Förslaget ska vara varmt först och sedan
   * två tydligt andra stämningar — inte tre nyanser av samma orange.
   */
  it("föreslår en varm palett för ett kafé och läser ut ljust", () => {
    const suggestion = suggestSiteLook(CAFE_BRIEF);
    expect(suggestion.themes).toEqual(["orange", "green", "slate"]);
    expect(suggestion.matched).toBe(true);
    expect(suggestion.basis).toBe("mat och fika");
    expect(suggestion.colorMode).toBe("light");
  });

  it("låter en nämnd färg gå före branschgissningen", () => {
    expect(suggestSiteLook("Ett bageri med mörkgröna knappar").themes[0]).toBe("green");
    expect(suggestSiteLook("Advokatbyrå, gärna vinröd").themes[0]).toBe("red");
    expect(suggestSiteLook("Frisörsalong i lila toner").themes[0]).toBe("violet");
    expect(suggestSiteLook("Färgerna du nämner: marinblå").themes[0]).toBe("indigo");
  });

  it("matchar branscher via ordstam och böjning", () => {
    expect(suggestSiteLook("Tandläkarmottagning i Lund").themes[0]).toBe("teal");
    expect(suggestSiteLook("Frisörsalongen Klipp & Fön").themes[0]).toBe("rose");
    expect(suggestSiteLook("Vår snickerifirma bygger kök").themes[0]).toBe("orange");
    expect(suggestSiteLook("Redovisningsbyrå för småföretag").themes[0]).toBe("indigo");
    expect(suggestSiteLook("Yogastudio med retreats").themes[0]).toBe("green");
  });

  /** Stammar som krockar med vardagsord i nästan varje prompt. */
  it("triggas inte av vardagsord som liknar en bransch", () => {
    expect(suggestSiteLook("Jag vill bygga en modern sida").matched).toBe(false);
    expect(suggestSiteLook("Hundra nöjda kunder om året").basis).not.toBe("djur");
    expect(suggestSiteLook("Bra ekonomi och tydliga priser").basis).not.toBe("natur och hälsa");
    expect(suggestSiteLook("Ett gymnasiearbete om historia").basis).not.toBe("sport och energi");
  });

  it("läser ut mörkt bara som eget ord, inte ur en färgsammansättning", () => {
    expect(suggestSiteLook("En mörk och elegant sida").colorMode).toBe("dark");
    expect(suggestSiteLook("Mörkt tema, tack").colorMode).toBe("dark");
    expect(suggestSiteLook("Mörkgröna knappar").colorMode).toBeNull();
    expect(suggestSiteLook("Ljusblå accenter").colorMode).toBeNull();
    // Säger beskrivningen båda väljer förslaget inget läge.
    expect(suggestSiteLook("Ljus text på mörk bakgrund").colorMode).toBeNull();
  });

  it("returnerar alltid tre olika, giltiga teman", () => {
    const briefs = [
      CAFE_BRIEF,
      "Nattklubb med DJ varje fredag, mörkt och lekfullt",
      "Startup inom AI som bygger en SaaS-plattform",
      "Grön, blå, röd, gul och lila",
      "x",
      "Barnkalas och lekland i Göteborg",
    ];
    for (const brief of briefs) {
      const { themes } = suggestSiteLook(brief);
      expect(new Set(themes).size, brief).toBe(3);
      for (const theme of themes) {
        expect(THEME_CLUSTERS[theme as ThemeClusterId], `${brief}: ${theme}`).toBeDefined();
      }
    }
  });

  it("normaliserar accent men behåller å, ä och ö", () => {
    expect(normalizeDescription("Café ÅÄÖ Rosé")).toBe("cafe åäö rose");
  });
});

describe("inferBuildTargetFromDescription", () => {
  it("är oklar utan beskrivning", () => {
    expect(inferBuildTargetFromDescription("")).toBeNull();
    expect(inferBuildTargetFromDescription(undefined)).toBeNull();
  });

  it("känner igen en hemsida, även via bransch", () => {
    expect(inferBuildTargetFromDescription(CAFE_BRIEF)).toBe("website");
    expect(inferBuildTargetFromDescription("Ett bageri i Malmö")).toBe("website");
  });

  it("känner igen en app", () => {
    expect(inferBuildTargetFromDescription("En app där kunder bokar tider")).toBe("app");
    expect(inferBuildTargetFromDescription("Dashboard för lagersaldo")).toBe("app");
  });

  /** Båda eller inget → valet stannar synligt på första nivån. */
  it("är oklar när beskrivningen pekar åt båda hållen eller inget", () => {
    expect(inferBuildTargetFromDescription("Hemsida med bokningssystem för salongen")).toBeNull();
    expect(inferBuildTargetFromDescription("Något snyggt")).toBeNull();
  });
});

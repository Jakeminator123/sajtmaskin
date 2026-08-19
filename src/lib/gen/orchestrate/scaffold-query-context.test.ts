import { describe, expect, it } from "vitest";

import { matchScaffoldAuto } from "../scaffolds/matcher";
import {
  buildScaffoldQueryContext,
  domainProfileToScaffoldHints,
} from "./scaffold-query-context";

describe("buildScaffoldQueryContext", () => {
  it("ignores dead businessType/industry fields that are not on siteBriefSchema", () => {
    expect(
      buildScaffoldQueryContext({
        businessType: "salon",
        industry: "hospitality",
      }),
    ).toBeUndefined();
  });

  it("maps domainProfile spa-salon to hospitality/landing keyword tokens", () => {
    const ctx = buildScaffoldQueryContext({
      domainProfile: "spa-salon",
      toneAndVoice: ["lugn", "professionell"],
    });
    expect(ctx?.domainHints).toEqual(domainProfileToScaffoldHints("spa-salon"));
    expect(ctx?.domainHints).toContain("spa");
    expect(ctx?.domainHints).toContain("salong");
  });

  it("keeps tone-only brief data out of scaffold selection", () => {
    expect(
      buildScaffoldQueryContext({
        toneAndVoice: ["personal", "creative"],
      }),
    ).toBeUndefined();
  });

  it("preserves explicit visual style as a scaffold-selection signal", () => {
    expect(
      buildScaffoldQueryContext({
        visualDirection: { styleKeywords: ["personal", "creative"] },
        toneAndVoice: ["lugn"],
      }),
    ).toEqual({
      briefPages: [],
      styleKeywords: ["personal", "creative"],
      domainHints: [],
    });
  });

  it("reads snapshot-shaped domainProfile objects", () => {
    const ctx = buildScaffoldQueryContext({
      domainProfile: { domain: "portfolio", industry: "photo" },
    });
    expect(ctx?.domainHints).toEqual(domainProfileToScaffoldHints("portfolio"));
  });

  it("returns undefined for general with no other brief signal", () => {
    expect(buildScaffoldQueryContext({ domainProfile: "general" })).toBeUndefined();
  });
});

describe("brief domainProfile in scaffold match", () => {
  it("lets a spa-salon brief pull a thin hemsida-prompt onto landing-page", async () => {
    const queryContext = buildScaffoldQueryContext({
      domainProfile: "spa-salon",
    });
    const result = await matchScaffoldAuto("En hemsida för min verksamhet", "website", {
      useEmbeddings: false,
      queryContext,
    });
    expect(result.scaffold?.id).toBe("landing-page");
    expect(result.scaffold?.id).not.toBe("ecommerce");
  });

  it("lets a portfolio brief win over a generic hemsida prompt", async () => {
    const queryContext = buildScaffoldQueryContext({
      domainProfile: "portfolio",
    });
    const result = await matchScaffoldAuto("Jag vill ha en hemsida", "website", {
      useEmbeddings: false,
      queryContext,
    });
    expect(result.scaffold?.id).toBe("portfolio");
  });

  it("does not let personal+creative tone alone make portfolio eligible", async () => {
    const queryContext = buildScaffoldQueryContext({
      toneAndVoice: ["personal", "creative"],
    });
    const result = await matchScaffoldAuto("Jag vill ha en hemsida", "website", {
      useEmbeddings: false,
      queryContext,
    });

    expect(queryContext).toBeUndefined();
    expect(result.meta.keywordScores.portfolio).toBe(0);
    expect(result.scaffold?.id).toBe("landing-page");
  });

  it("still lets personal+creative style select portfolio", async () => {
    const queryContext = buildScaffoldQueryContext({
      visualDirection: { styleKeywords: ["personal", "creative"] },
    });
    const result = await matchScaffoldAuto("Jag vill ha en hemsida", "website", {
      useEmbeddings: false,
      queryContext,
    });

    expect(result.meta.keywordScores.portfolio).toBeGreaterThanOrEqual(2);
    expect(result.scaffold?.id).toBe("portfolio");
  });

  it("lets a saas brief prefer saas-landing", async () => {
    const queryContext = buildScaffoldQueryContext({
      domainProfile: "saas",
    });
    const result = await matchScaffoldAuto("Bygg en hemsida för vårt verktyg", "website", {
      useEmbeddings: false,
      queryContext,
    });
    expect(result.scaffold?.id).toBe("saas-landing");
  });
});

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
    expect(ctx?.toneAndVoice).toEqual(["lugn", "professionell"]);
    expect(ctx?.domainHints).toContain("spa");
    expect(ctx?.domainHints).toContain("salong");
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

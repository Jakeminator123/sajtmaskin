import { describe, expect, it } from "vitest";

import { pickScaffoldVariant } from "./matcher";

describe("pickScaffoldVariant", () => {
  it("prefers the default variant when the prompt is underspecified", () => {
    const variant = pickScaffoldVariant({
      prompt: "Build a clean company website",
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "seed-1",
    });

    expect(variant?.id).toBe("corporate-grid");
  });

  it("matches scaffold-specific editorial blog signals", () => {
    const variant = pickScaffoldVariant({
      prompt: "Create a longform editorial blog for essays and magazine-style reading",
      scaffoldId: "blog",
      styleKeywords: ["editorial", "reading"],
      toneKeywords: ["thoughtful"],
      generationMode: "init",
      sessionSeed: "seed-2",
    });

    expect(variant?.id).toBe("editorial-serif");
  });

  it("does not escape the selected scaffold's variant pool", () => {
    const variant = pickScaffoldVariant({
      prompt: "Create a dark terminal-style developer product landing page",
      scaffoldId: "app-shell",
      styleKeywords: ["terminal", "developer"],
      toneKeywords: ["technical"],
      generationMode: "init",
      sessionSeed: "seed-3",
    });

    expect(variant?.scaffoldId).toBe("app-shell");
    expect(variant?.id).toBe("immersive-dark");
  });
});

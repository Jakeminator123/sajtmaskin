import { describe, expect, it } from "vitest";

import { SCAFFOLD_PROTECTED_PATHS } from "../scaffolds/protected-paths";
import { buildDynamicContext } from "./build-dynamic-context";

describe("buildDynamicContext", () => {
  it("tells the model not to emit scaffold-protected files", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Build a simple website",
      generationMode: "init",
    });

    expect(result.context).toContain("## Scaffold-default files");
    expect(result.blocks.find((block) => block.title === "Scaffold-default files")).toMatchObject({
      required: true,
    });
    for (const path of SCAFFOLD_PROTECTED_PATHS) {
      expect(result.context).toContain(`\`${path}\``);
    }
  });

  it("ignores invalid brief domainProfile values and falls back to canonical inference", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg en hemsida för en frisörsalong i Malmö",
      generationMode: "init",
      brief: {
        domainProfile: "hospitality",
        visualDirection: { styleKeywords: ["modern", "varm"] },
        toneAndVoice: ["professionell"],
      },
    });

    expect(result.context).toContain("Domain profile (inferred from prompt keywords): **spa-salon**.");
    expect(result.context).not.toContain("**hospitality**");
  });
});

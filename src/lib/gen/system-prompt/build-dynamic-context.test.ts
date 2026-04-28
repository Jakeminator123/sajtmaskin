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
});

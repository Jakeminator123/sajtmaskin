import { describe, expect, it } from "vitest";
import { mapRegistryFilePath, rewriteRegistryImports } from "./registry-utils";

describe("registry-utils", () => {
  it("rewrites radix-vega registry imports to local aliases", () => {
    const content = [
      'import { useIsMobile } from "@/registry/radix-vega/hooks/use-mobile";',
      'import { cn } from "@/registry/radix-vega/lib/utils";',
      'import { Button } from "@/registry/radix-vega/ui/button";',
    ].join("\n");

    expect(rewriteRegistryImports(content, "radix-vega")).toContain(
      'import { useIsMobile } from "@/lib/hooks/use-mobile";',
    );
    expect(rewriteRegistryImports(content, "radix-vega")).toContain(
      'import { cn } from "@/lib/utils";',
    );
    expect(rewriteRegistryImports(content, "radix-vega")).toContain(
      'import { Button } from "@/components/ui/button";',
    );
  });

  it("maps registry hook files into src/lib/hooks", () => {
    expect(mapRegistryFilePath("hooks/use-mobile.ts")).toBe("src/lib/hooks/use-mobile.ts");
    expect(mapRegistryFilePath("registry/radix-vega/hooks/use-mobile.ts")).toBe(
      "src/lib/hooks/use-mobile.ts",
    );
  });
});

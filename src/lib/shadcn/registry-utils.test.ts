import { describe, expect, it } from "vitest";
import { mapRegistryFilePath, rewriteRegistryImports } from "./registry-utils";

describe("registry-utils", () => {
  it("rewrites registry hook imports to the local lib/hooks alias", () => {
    const content = [
      'import { useIsMobile } from "@/registry/new-york-v4/hooks/use-mobile";',
      'import { cn } from "@/registry/new-york-v4/lib/utils";',
      'import { Button } from "@/registry/new-york-v4/ui/button";',
    ].join("\n");

    expect(rewriteRegistryImports(content, "new-york-v4")).toContain(
      'import { useIsMobile } from "@/lib/hooks/use-mobile";',
    );
    expect(rewriteRegistryImports(content, "new-york-v4")).toContain(
      'import { cn } from "@/lib/utils";',
    );
    expect(rewriteRegistryImports(content, "new-york-v4")).toContain(
      'import { Button } from "@/components/ui/button";',
    );
  });

  it("maps registry hook files into src/lib/hooks", () => {
    expect(mapRegistryFilePath("hooks/use-mobile.ts")).toBe("src/lib/hooks/use-mobile.ts");
    expect(mapRegistryFilePath("registry/new-york-v4/hooks/use-mobile.ts")).toBe(
      "src/lib/hooks/use-mobile.ts",
    );
  });
});

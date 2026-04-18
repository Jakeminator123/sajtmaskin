import { describe, expect, it } from "vitest";
import {
  fixTier3SdkImports,
  listTier3SdkModules,
} from "./tier3-sdk-guard-fixer";
import {
  loadTier3DenyList,
  renderTier3F2DenyBlockLines,
} from "@/lib/integrations/tier3-sdk-deny";

describe("fixTier3SdkImports", () => {
  it("returns the code unchanged when no tier-3 imports are present", () => {
    const code = `import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Page() {
  return <Button>Hi</Button>;
}`;
    const result = fixTier3SdkImports(code);
    expect(result.code).toBe(code);
    expect(result.removedModules).toEqual([]);
  });

  it("removes a Stripe import line", () => {
    const code = `import Stripe from "stripe";
import { Button } from "@/components/ui/button";`;
    const result = fixTier3SdkImports(code);
    expect(result.removedModules).toEqual(["stripe"]);
    expect(result.code).not.toContain('from "stripe"');
    expect(result.code).toContain('from "@/components/ui/button"');
  });

  it("removes scoped-subpath imports", () => {
    const code = `import { auth } from "@clerk/nextjs/server";
import { something } from "@stripe/stripe-js/pure";
import x from "next-auth";
const y = 1;`;
    const result = fixTier3SdkImports(code);
    expect(new Set(result.removedModules)).toEqual(
      new Set(["@clerk/nextjs/server", "@stripe/stripe-js/pure", "next-auth"]),
    );
    expect(result.code.trim()).toBe("const y = 1;");
  });

  it("preserves type-only tier-3 imports just like value imports (still tier-3)", () => {
    const code = `import type { Stripe as StripeType } from "stripe";
const x = 1;`;
    const result = fixTier3SdkImports(code);
    expect(result.removedModules).toEqual(["stripe"]);
    expect(result.code.trim()).toBe("const x = 1;");
  });

  it("does not remove first-party @/ imports or shadcn/ui imports that share words", () => {
    const code = `import { Card } from "@/components/ui/card";
import { stripeUtils } from "@/lib/stripe-helpers";
const x = 1;`;
    const result = fixTier3SdkImports(code);
    expect(result.removedModules).toEqual([]);
    expect(result.code).toBe(code);
  });

  it("listTier3SdkModules exposes the canonical list", () => {
    const modules = listTier3SdkModules();
    expect(modules).toContain("stripe");
    expect(modules).toContain("@clerk/nextjs");
    expect(modules).toContain("openai");
    expect(modules).toContain("redis");
  });

  it("autofix list and F2 prompt block render from the same SOT", () => {
    // Single-source-of-truth invariant: every module that the autofix can
    // strip MUST also be visible in the prompt block the LLM sees, and
    // vice versa. If they ever drift, generated code will reference an
    // SDK the LLM was not warned about (or the LLM gets warned about an
    // SDK the autofix doesn't actually strip).
    const fromAutofix = new Set(listTier3SdkModules());
    const denyList = loadTier3DenyList();
    const fromCategories = new Set(
      denyList.categories.flatMap((category) => [...category.modules]),
    );
    expect([...fromAutofix].sort()).toEqual([...fromCategories].sort());

    const promptLines = renderTier3F2DenyBlockLines();
    expect(promptLines.length).toBe(denyList.categories.length);
    for (const mod of fromCategories) {
      const mentioned = promptLines.some((line) => line.includes(`\`${mod}\``));
      expect(mentioned, `module '${mod}' missing from F2 prompt block`).toBe(true);
    }
  });
});

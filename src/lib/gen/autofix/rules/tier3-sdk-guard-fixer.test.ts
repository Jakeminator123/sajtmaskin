import { describe, expect, it } from "vitest";
import {
  fixTier3SdkImports,
  listTier3SdkModules,
} from "./tier3-sdk-guard-fixer";

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
});

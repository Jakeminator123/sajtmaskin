import { describe, expect, it } from "vitest";
import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import { creditPackageCopy } from "./landing-chat-data";

describe("creditPackageCopy", () => {
  it("covers every canonical credit package without listing prices", () => {
    for (const pkg of CREDIT_PACKAGES) {
      const copy = creditPackageCopy[pkg.id];
      expect(copy.description.length).toBeGreaterThan(0);
      expect(copy.cta).toContain(pkg.name);
      expect(JSON.stringify(copy)).not.toMatch(/\b(49|99|179)\b/);
    }
  });
});

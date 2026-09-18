import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A4: the audit entry must not promise a free analysis. `/api/audit` requires a
 * session and charges credits (basic 15 / advanced 25); the free run lives on
 * `/analys` with its own guest quota.
 */
describe("entry-modal audit copy", () => {
  const source = readFileSync(resolve("src/components/modals/entry-modal.tsx"), "utf8");

  it("does not promise a free audit in the entry modal", () => {
    expect(source).not.toMatch(/helt gratis/i);
    expect(source).not.toMatch(/kostnadsfri AI-analys/i);
  });

  it("says that the logged-in audit costs credits", () => {
    expect(source).toMatch(/credits/i);
  });
});

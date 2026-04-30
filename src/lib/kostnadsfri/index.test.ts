import { afterEach, describe, expect, it } from "vitest";
import { generatePassword, hasKostnadsfriPasswordSecret } from "./index";

afterEach(() => {
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
  delete process.env.KOSTNADSFRI_API_KEY;
});

describe("generatePassword", () => {
  it("requires a configured secret instead of falling back to a predictable seed", () => {
    expect(hasKostnadsfriPasswordSecret()).toBe(false);
    expect(() => generatePassword("acme-ab")).toThrow(/KOSTNADSFRI_PASSWORD_SEED/);
  });

  it("derives deterministic passwords from the configured seed", () => {
    process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";

    expect(hasKostnadsfriPasswordSecret()).toBe(true);
    expect(generatePassword("acme-ab")).toBe(generatePassword("acme-ab"));
    expect(generatePassword("acme-ab")).not.toBe(generatePassword("other-ab"));
  });
});

import { describe, expect, it } from "vitest";
import { isAffirmativeEnvValue, sanitizeEnvString } from "./env-affirmative";

describe("sanitizeEnvString", () => {
  it("trims and strips matching quotes", () => {
    expect(sanitizeEnvString('  "yes"  ')).toBe("yes");
    expect(sanitizeEnvString("'on'")).toBe("on");
  });

  it("returns undefined for empty", () => {
    expect(sanitizeEnvString("")).toBeUndefined();
    expect(sanitizeEnvString("   ")).toBeUndefined();
    expect(sanitizeEnvString(undefined)).toBeUndefined();
  });
});

describe("isAffirmativeEnvValue", () => {
  it("is true only for explicit affirmative tokens", () => {
    expect(isAffirmativeEnvValue("y")).toBe(true);
    expect(isAffirmativeEnvValue("Y")).toBe(true);
    expect(isAffirmativeEnvValue("yes")).toBe(true);
    expect(isAffirmativeEnvValue("true")).toBe(true);
    expect(isAffirmativeEnvValue("1")).toBe(true);
    expect(isAffirmativeEnvValue("on")).toBe(true);
  });

  it("treats n, no, false, off, arbitrary text as off", () => {
    expect(isAffirmativeEnvValue("n")).toBe(false);
    expect(isAffirmativeEnvValue("no")).toBe(false);
    expect(isAffirmativeEnvValue("false")).toBe(false);
    expect(isAffirmativeEnvValue("0")).toBe(false);
    expect(isAffirmativeEnvValue("off")).toBe(false);
    expect(isAffirmativeEnvValue("maybe")).toBe(false);
    expect(isAffirmativeEnvValue("")).toBe(false);
    expect(isAffirmativeEnvValue(undefined)).toBe(false);
  });
});

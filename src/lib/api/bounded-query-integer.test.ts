import { describe, expect, it } from "vitest";
import { parseBoundedPositiveInteger } from "./bounded-query-integer";

describe("parseBoundedPositiveInteger", () => {
  const options = { fallback: 20, max: 100 };

  it.each([null, "", "0", "-1", "1.5", "2rows", " 2", "9007199254740992"])(
    "uses the fallback for %j",
    (raw) => {
      expect(parseBoundedPositiveInteger(raw, options)).toBe(20);
    },
  );

  it("accepts canonical positive integers and clamps the maximum", () => {
    expect(parseBoundedPositiveInteger("1", options)).toBe(1);
    expect(parseBoundedPositiveInteger("42", options)).toBe(42);
    expect(parseBoundedPositiveInteger("101", options)).toBe(100);
  });
});

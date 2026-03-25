import { describe, expect, it } from "vitest";
import { integrationRegistry } from "./registry";

describe("integrationRegistry parity", () => {
  it("has unique definition keys", () => {
    const keys = integrationRegistry.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique provider identity (provider ?? key) for detection map", () => {
    const ids = integrationRegistry.map((d) => d.provider ?? d.key);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { describe, expect, it } from "vitest";

import { resolveScaffoldSerializeMode } from "./resolve-base";

describe("resolveScaffoldSerializeMode", () => {
  it("keeps heavy website init inspirational", () => {
    expect(
      resolveScaffoldSerializeMode({
        generationMode: "init",
        changeScope: "redesign",
        buildIntent: "website",
        contextPolicy: "heavy",
      }),
    ).toBe("inspirational");
  });

  it("keeps heavy app init structural", () => {
    expect(
      resolveScaffoldSerializeMode({
        generationMode: "init",
        changeScope: "redesign",
        buildIntent: "app",
        contextPolicy: "heavy",
      }),
    ).toBe("structural");
  });

  it("keeps ordinary follow-ups structural", () => {
    expect(
      resolveScaffoldSerializeMode({
        generationMode: "followUp",
        changeScope: "local-layout",
        buildIntent: "website",
        contextPolicy: "normal",
      }),
    ).toBe("structural");
  });

  it("uses inspirational context for explicit follow-up redesign", () => {
    expect(
      resolveScaffoldSerializeMode({
        generationMode: "followUp",
        changeScope: "redesign",
        buildIntent: "website",
        contextPolicy: "heavy",
      }),
    ).toBe("inspirational");
  });
});

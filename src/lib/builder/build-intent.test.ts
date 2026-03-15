import { describe, expect, it } from "vitest";
import {
  normalizeBuildIntent,
  normalizeBuildMethod,
  resolveBuildIntentForMethod,
} from "./build-intent";

describe("build-intent", () => {
  it("normalizes supported build methods and rejects UI-only aliases", () => {
    expect(normalizeBuildMethod("freeform")).toBe("freeform");
    expect(normalizeBuildMethod("FREEFORM")).toBe("freeform");
    expect(normalizeBuildMethod("fritext")).toBeNull();
  });

  it("normalizes invalid intents back to website", () => {
    expect(normalizeBuildIntent("app")).toBe("app");
    expect(normalizeBuildIntent("other")).toBe("website");
  });

  it("forces template and website intents for method-specific flows", () => {
    expect(resolveBuildIntentForMethod("category", "website")).toBe("template");
    expect(resolveBuildIntentForMethod("audit", "template")).toBe("website");
    expect(resolveBuildIntentForMethod("kostnadsfri", "app")).toBe("website");
    expect(resolveBuildIntentForMethod("freeform", "app")).toBe("app");
  });
});

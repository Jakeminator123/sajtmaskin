import { describe, expect, it } from "vitest";
import {
  isTemplateEntryMode,
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

  it("recognizes the template aliases used by the landing UI", () => {
    expect(isTemplateEntryMode("template")).toBe(true);
    expect(isTemplateEntryMode("kategori")).toBe(true);
    expect(isTemplateEntryMode("mall")).toBe(true);
    expect(isTemplateEntryMode("fritext")).toBe(false);
  });
});

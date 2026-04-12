import { describe, expect, it } from "vitest";
import {
  isAppScaffold,
  isTemplateEntryMode,
  normalizeBuildIntent,
  normalizeBuildMethod,
  resolveBuildIntentForMethod,
  resolveBuildIntentWithScaffold,
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

  it("identifies app scaffolds", () => {
    expect(isAppScaffold("dashboard")).toBe(true);
    expect(isAppScaffold("app-shell")).toBe(true);
    expect(isAppScaffold("landing-page")).toBe(false);
    expect(isAppScaffold("blog")).toBe(false);
    expect(isAppScaffold(null)).toBe(false);
    expect(isAppScaffold(undefined)).toBe(false);
  });

  it("coerces intent to app when manual dashboard scaffold is selected", () => {
    expect(resolveBuildIntentWithScaffold("freeform", "website", "manual", "dashboard")).toBe("app");
    expect(resolveBuildIntentWithScaffold("freeform", "website", "manual", "app-shell")).toBe("app");
  });

  it("does not coerce intent when scaffold mode is auto", () => {
    expect(resolveBuildIntentWithScaffold("freeform", "website", "auto", "dashboard")).toBe("website");
  });

  it("does not coerce intent for non-app scaffolds", () => {
    expect(resolveBuildIntentWithScaffold("freeform", "website", "manual", "landing-page")).toBe("website");
    expect(resolveBuildIntentWithScaffold("freeform", "website", "manual", "blog")).toBe("website");
  });

  it("preserves method-level overrides even with manual app scaffold", () => {
    expect(resolveBuildIntentWithScaffold("audit", "website", "manual", "dashboard")).toBe("website");
    expect(resolveBuildIntentWithScaffold("kostnadsfri", "website", "manual", "dashboard")).toBe("website");
    expect(resolveBuildIntentWithScaffold("category", "website", "manual", "dashboard")).toBe("template");
  });

  it("preserves explicit app intent regardless of scaffold", () => {
    expect(resolveBuildIntentWithScaffold("freeform", "app", "manual", "landing-page")).toBe("app");
    expect(resolveBuildIntentWithScaffold("freeform", "app", "off", null)).toBe("app");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  buildShadcnDocsUrl,
  getRegistryBaseUrl,
  LEGACY_STYLE_DEFAULT,
  resolveRegistryStyle,
} from "./registry-url";

describe("registry-url", () => {
  const prevBase = process.env.NEXT_PUBLIC_REGISTRY_BASE_URL;
  const prevStyle = process.env.NEXT_PUBLIC_REGISTRY_STYLE;

  afterEach(() => {
    if (prevBase === undefined) delete process.env.NEXT_PUBLIC_REGISTRY_BASE_URL;
    else process.env.NEXT_PUBLIC_REGISTRY_BASE_URL = prevBase;
    if (prevStyle === undefined) delete process.env.NEXT_PUBLIC_REGISTRY_STYLE;
    else process.env.NEXT_PUBLIC_REGISTRY_STYLE = prevStyle;
  });

  it("getRegistryBaseUrl defaults to ui.shadcn.com", () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_BASE_URL;
    expect(getRegistryBaseUrl()).toBe("https://ui.shadcn.com");
  });

  it("getRegistryBaseUrl normalizes env override to origin", () => {
    process.env.NEXT_PUBLIC_REGISTRY_BASE_URL = "https://registry.example.com/v1/";
    expect(getRegistryBaseUrl()).toBe("https://registry.example.com");
  });

  it("resolveRegistryStyle defaults to radix-vega", () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_STYLE;
    expect(resolveRegistryStyle(undefined, "https://ui.shadcn.com")).toBe("radix-vega");
  });

  it("resolveRegistryStyle coerces legacy new-york to radix-vega for official registry", () => {
    expect(resolveRegistryStyle("new-york", "https://ui.shadcn.com")).toBe("radix-vega");
  });

  it("resolveRegistryStyle keeps radix-vega as-is", () => {
    expect(resolveRegistryStyle("radix-vega", "https://ui.shadcn.com")).toBe("radix-vega");
  });

  it("resolveRegistryStyle skips coercion when allowLegacy is true", () => {
    expect(resolveRegistryStyle("new-york", "https://ui.shadcn.com", { allowLegacy: true })).toBe(
      "new-york",
    );
  });

  it("resolveRegistryStyle passes through non-standard styles for custom registries", () => {
    expect(resolveRegistryStyle("custom-style", "https://registry.example.com")).toBe(
      "custom-style",
    );
  });

  it("buildShadcnDocsUrl uses canonical /docs/components/{slug} path", () => {
    expect(buildShadcnDocsUrl("carousel")).toBe(
      "https://ui.shadcn.com/docs/components/carousel",
    );
    expect(buildShadcnDocsUrl("dialog")).toBe(
      "https://ui.shadcn.com/docs/components/dialog",
    );
    expect(buildShadcnDocsUrl("button")).toBe(
      "https://ui.shadcn.com/docs/components/button",
    );
  });

  it("buildShadcnDocsUrl lowercases and trims slug", () => {
    expect(buildShadcnDocsUrl("  Dialog ")).toBe(
      "https://ui.shadcn.com/docs/components/dialog",
    );
  });

  it("buildShadcnDocsUrl respects baseUrl override", () => {
    expect(buildShadcnDocsUrl("button", { baseUrl: "https://mirror.example.com" })).toBe(
      "https://mirror.example.com/docs/components/button",
    );
  });

  it("LEGACY_STYLE_DEFAULT is new-york", () => {
    expect(LEGACY_STYLE_DEFAULT).toBe("new-york");
  });
});

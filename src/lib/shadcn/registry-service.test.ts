import { afterEach, describe, expect, it } from "vitest";
import {
  buildAvailablePreviewImageUrl,
  buildPreviewImageUrl,
  buildRegistryIndexUrl,
  buildRegistryItemUrl,
} from "./registry-service";

/**
 * Locks the registry URL OUTPUT (not just the style resolver) to the canonical
 * `new-york-v4` set for the official ui.shadcn.com registry. These are the URLs
 * the picker uses to fetch block/component JSON (`buildRegistryItemUrl`), the
 * index (`buildRegistryIndexUrl`), and the preview PNGs (`buildPreviewImageUrl`).
 * The incompletely-populated `radix-vega` alias must never leak into a runtime
 * URL for the official registry, or the picker shows "Ingen preview" walls and
 * fetches empty payloads.
 */
describe("registry-service URL builders (official registry)", () => {
  const prevBase = process.env.NEXT_PUBLIC_REGISTRY_BASE_URL;
  const prevStyle = process.env.NEXT_PUBLIC_REGISTRY_STYLE;

  afterEach(() => {
    if (prevBase === undefined) delete process.env.NEXT_PUBLIC_REGISTRY_BASE_URL;
    else process.env.NEXT_PUBLIC_REGISTRY_BASE_URL = prevBase;
    if (prevStyle === undefined) delete process.env.NEXT_PUBLIC_REGISTRY_STYLE;
    else process.env.NEXT_PUBLIC_REGISTRY_STYLE = prevStyle;
  });

  it("buildRegistryItemUrl defaults to new-york-v4", () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_STYLE;
    expect(buildRegistryItemUrl("button")).toBe(
      "https://ui.shadcn.com/r/styles/new-york-v4/button.json",
    );
  });

  it("buildRegistryItemUrl coerces the incomplete radix-vega alias to new-york-v4", () => {
    expect(buildRegistryItemUrl("button", "radix-vega")).toBe(
      "https://ui.shadcn.com/r/styles/new-york-v4/button.json",
    );
  });

  it("buildRegistryItemUrl coerces the legacy new-york alias to new-york-v4", () => {
    expect(buildRegistryItemUrl("login-01", "new-york")).toBe(
      "https://ui.shadcn.com/r/styles/new-york-v4/login-01.json",
    );
  });

  it("buildRegistryItemUrl keeps new-york-v4 as-is", () => {
    expect(buildRegistryItemUrl("dialog", "new-york-v4")).toBe(
      "https://ui.shadcn.com/r/styles/new-york-v4/dialog.json",
    );
  });

  it("buildRegistryIndexUrl defaults to new-york-v4", () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_STYLE;
    expect(buildRegistryIndexUrl()).toBe(
      "https://ui.shadcn.com/r/styles/new-york-v4/registry.json",
    );
  });

  // The 2026-07 shadcn-site-redesign removed the preview PNGs from the
  // `new-york-v4` path (404) while the legacy `new-york` path still serves
  // them — image URLs therefore resolve to `new-york`, JSON stays on
  // `new-york-v4`. Verified live 2026-07-24.
  it("buildPreviewImageUrl builds light/dark PNGs against new-york (image-hosting style)", () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_STYLE;
    expect(buildPreviewImageUrl("login-01", "light")).toBe(
      "https://ui.shadcn.com/r/styles/new-york/login-01-light.png",
    );
    expect(buildPreviewImageUrl("login-01", "dark")).toBe(
      "https://ui.shadcn.com/r/styles/new-york/login-01-dark.png",
    );
  });

  it("buildPreviewImageUrl coerces every official style alias to new-york", () => {
    for (const style of ["radix-vega", "new-york-v4", "default", undefined]) {
      expect(buildPreviewImageUrl("login-01", "light", style)).toBe(
        "https://ui.shadcn.com/r/styles/new-york/login-01-light.png",
      );
    }
  });

  it("only exposes verified official preview PNGs and leaves missing blocks icon-backed", () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_BASE_URL;
    expect(buildAvailablePreviewImageUrl("login-01", "light")).toBe(
      "https://ui.shadcn.com/r/styles/new-york/login-01-light.png",
    );
    expect(buildAvailablePreviewImageUrl("sidebar-16", "dark")).toBe(
      "https://ui.shadcn.com/r/styles/new-york/sidebar-16-dark.png",
    );
    expect(buildAvailablePreviewImageUrl("signup-01", "light")).toBeUndefined();
    expect(buildAvailablePreviewImageUrl("chart-bar-default", "light")).toBeUndefined();
  });

  it("no official registry URL ever leaks the incomplete radix-vega style", () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_STYLE;
    const jsonUrls = [
      buildRegistryIndexUrl(),
      buildRegistryIndexUrl("radix-vega"),
      buildRegistryItemUrl("button", "radix-vega"),
    ];
    for (const url of jsonUrls) {
      expect(url).not.toContain("radix-vega");
      expect(url).toContain("new-york-v4");
    }
    const imageUrls = [
      buildPreviewImageUrl("login-01", "light", "radix-vega"),
      buildPreviewImageUrl("login-01", "dark", "new-york"),
    ];
    for (const url of imageUrls) {
      expect(url).not.toContain("radix-vega");
      expect(url).toContain("/r/styles/new-york/");
    }
  });

  it("buildPreviewImageUrl passes custom-registry styles through untouched", () => {
    process.env.NEXT_PUBLIC_REGISTRY_BASE_URL = "https://registry.example.com";
    expect(buildPreviewImageUrl("hero1", "light", "minimal")).toBe(
      "https://registry.example.com/r/styles/minimal/hero1-light.png",
    );
  });

  it("keeps the custom-registry preview convention untouched", () => {
    process.env.NEXT_PUBLIC_REGISTRY_BASE_URL = "https://registry.example.com";
    expect(buildAvailablePreviewImageUrl("hero1", "light", "minimal")).toBe(
      "https://registry.example.com/r/styles/minimal/hero1-light.png",
    );
  });

  it("passes a non-standard style through untouched for custom registries", () => {
    process.env.NEXT_PUBLIC_REGISTRY_BASE_URL = "https://registry.example.com";
    expect(buildRegistryItemUrl("button", "radix-vega")).toBe(
      "https://registry.example.com/r/styles/radix-vega/button.json",
    );
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
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

  it("buildPreviewImageUrl builds light/dark PNGs against new-york-v4", () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_STYLE;
    expect(buildPreviewImageUrl("login-01", "light")).toBe(
      "https://ui.shadcn.com/r/styles/new-york-v4/login-01-light.png",
    );
    expect(buildPreviewImageUrl("login-01", "dark")).toBe(
      "https://ui.shadcn.com/r/styles/new-york-v4/login-01-dark.png",
    );
  });

  it("buildPreviewImageUrl coerces radix-vega to new-york-v4", () => {
    expect(buildPreviewImageUrl("login-01", "light", "radix-vega")).toBe(
      "https://ui.shadcn.com/r/styles/new-york-v4/login-01-light.png",
    );
  });

  it("no official registry URL ever leaks the incomplete radix-vega style", () => {
    delete process.env.NEXT_PUBLIC_REGISTRY_STYLE;
    const urls = [
      buildRegistryIndexUrl(),
      buildRegistryIndexUrl("radix-vega"),
      buildRegistryItemUrl("button", "radix-vega"),
      buildPreviewImageUrl("login-01", "light", "radix-vega"),
      buildPreviewImageUrl("login-01", "dark", "new-york"),
    ];
    for (const url of urls) {
      expect(url).not.toContain("radix-vega");
      expect(url).toContain("new-york-v4");
    }
  });

  it("passes a non-standard style through untouched for custom registries", () => {
    process.env.NEXT_PUBLIC_REGISTRY_BASE_URL = "https://registry.example.com";
    expect(buildRegistryItemUrl("button", "radix-vega")).toBe(
      "https://registry.example.com/r/styles/radix-vega/button.json",
    );
  });
});

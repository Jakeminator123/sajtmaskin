import { afterEach, describe, expect, it } from "vitest";
import {
  buildRegistryCacheKey,
  clearRegistryMemoryCache,
  getRegistryMemoryCache,
  normalizeCacheKeyPart,
  registryMemoryCacheSize,
  REGISTRY_MEMORY_CACHE_MAX_ENTRIES,
  setRegistryMemoryCache,
} from "./registry-memory-cache";

afterEach(() => {
  clearRegistryMemoryCache();
});

describe("registry-memory-cache key normalization (G#62/U#34)", () => {
  it("collapses casing/whitespace variants to one key", () => {
    expect(normalizeCacheKeyPart(" New York ")).toBe("new york");
    const a = buildRegistryCacheKey("item", { name: "Button", style: "New York" });
    const b = buildRegistryCacheKey("item", { name: " button ", style: " new york " });
    expect(a).toBe(b);
    expect(a).toBe("item:button:new york:official");
  });

  it("applies default/official fallbacks for empty style/source", () => {
    expect(buildRegistryCacheKey("index", {})).toBe("index:default:official");
    expect(buildRegistryCacheKey("index", { style: "", source: "" })).toBe(
      "index:default:official",
    );
  });

  it("dedupes a cached value across casing variants", () => {
    const keyA = buildRegistryCacheKey("index", { style: "Default", source: "Official" });
    const keyB = buildRegistryCacheKey("index", { style: "default", source: "official" });
    setRegistryMemoryCache(keyA, { items: [] });
    expect(getRegistryMemoryCache(keyB)).toEqual({ items: [] });
    expect(registryMemoryCacheSize()).toBe(1);
  });
});

describe("registry-memory-cache bounding (G#61/U#33)", () => {
  it("never exceeds the max-entries bound", () => {
    const total = REGISTRY_MEMORY_CACHE_MAX_ENTRIES + 50;
    for (let i = 0; i < total; i++) {
      setRegistryMemoryCache(`index:style-${i}:official`, { i });
    }
    expect(registryMemoryCacheSize()).toBe(REGISTRY_MEMORY_CACHE_MAX_ENTRIES);
  });

  it("evicts oldest entries first (FIFO)", () => {
    const total = REGISTRY_MEMORY_CACHE_MAX_ENTRIES + 1;
    for (let i = 0; i < total; i++) {
      setRegistryMemoryCache(`index:style-${i}:official`, { i });
    }
    // The very first inserted key should have been evicted.
    expect(getRegistryMemoryCache("index:style-0:official")).toBeNull();
    // The most recent key should still be present.
    expect(getRegistryMemoryCache(`index:style-${total - 1}:official`)).toEqual({
      i: total - 1,
    });
  });
});

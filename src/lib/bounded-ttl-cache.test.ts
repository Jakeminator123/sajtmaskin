import { describe, expect, it } from "vitest";
import { getFreshCacheEntry, setBoundedCacheEntry } from "./bounded-ttl-cache";

type Entry = { value: string; expiresAt: number };

describe("bounded TTL cache", () => {
  it("drops expired entries on read", () => {
    const store = new Map<string, Entry>([["old", { value: "old", expiresAt: 10 }]]);

    expect(getFreshCacheEntry(store, "old", 10)).toBeNull();
    expect(store.size).toBe(0);
  });

  it("prunes expired rows and evicts the oldest live key at the cap", () => {
    const store = new Map<string, Entry>([
      ["expired", { value: "expired", expiresAt: 9 }],
      ["first", { value: "first", expiresAt: 100 }],
      ["second", { value: "second", expiresAt: 100 }],
    ]);

    setBoundedCacheEntry(store, "third", { value: "third" }, { ttlMs: 20, maxEntries: 2, now: 10 });

    expect([...store.keys()]).toEqual(["second", "third"]);
    expect(store.get("third")?.expiresAt).toBe(30);
  });

  it("refreshes an existing key without evicting another entry", () => {
    const store = new Map<string, Entry>([
      ["first", { value: "first", expiresAt: 100 }],
      ["second", { value: "second", expiresAt: 100 }],
    ]);

    setBoundedCacheEntry(store, "first", { value: "fresh" }, { ttlMs: 20, maxEntries: 2, now: 10 });

    expect([...store.keys()]).toEqual(["second", "first"]);
    expect(store.get("first")).toEqual({ value: "fresh", expiresAt: 30 });
  });
});

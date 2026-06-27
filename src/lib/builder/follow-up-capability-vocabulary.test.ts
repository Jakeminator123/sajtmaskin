import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CAPABILITY_VOCABULARY } from "./follow-up-capability-vocabulary";

/**
 * Guards the follow-up capability vocabulary against the canonical capability
 * map. The vocabulary's doc comment used to hardcode a capability count
 * ("16 capabilities") that silently went stale when #242 grew the map to 24.
 * Instead of asserting a brittle number, we assert the real invariant: every
 * vocabulary entry maps to a capability id that actually exists in
 * `data/dossiers/_index/capability-map.json`. A typo or removed capability id
 * fails here instead of silently injecting no dossier at runtime.
 */
const capabilityMap = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "data", "dossiers", "_index", "capability-map.json"),
    "utf-8",
  ),
) as { capabilities: Record<string, string[]> };

const mapCapabilityIds = new Set(Object.keys(capabilityMap.capabilities));

describe("follow-up-capability-vocabulary ↔ capability-map sync", () => {
  it("references at least one capability (map is non-empty)", () => {
    expect(mapCapabilityIds.size).toBeGreaterThan(0);
    expect(CAPABILITY_VOCABULARY.length).toBeGreaterThan(0);
  });

  it("every vocabulary capability id exists in the capability map", () => {
    const unknown = CAPABILITY_VOCABULARY.map((entry) => entry.capability).filter(
      (id) => !mapCapabilityIds.has(id),
    );
    expect(unknown).toEqual([]);
  });

  it("has no duplicate capability entries", () => {
    const ids = CAPABILITY_VOCABULARY.map((entry) => entry.capability);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

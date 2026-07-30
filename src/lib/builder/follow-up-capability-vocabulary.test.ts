import { describe, expect, it } from "vitest";

import { getAllDossiers } from "@/lib/gen/dossiers/registry";

import { CAPABILITY_VOCABULARY } from "./follow-up-capability-vocabulary";

/**
 * Guards the follow-up capability vocabulary against the capabilities that
 * actually exist. The vocabulary's doc comment used to hardcode a capability
 * count ("16 capabilities") that silently went stale when #242 grew the pool
 * to 24. Instead of asserting a brittle number, we assert the real invariant:
 * every vocabulary entry maps to a capability id that a dossier on disk
 * declares. A typo or removed capability id fails here instead of silently
 * injecting no dossier at runtime.
 *
 * Read through the registry (the same walk runtime does), NOT through
 * `_index/capability-map.json`: that generated view has no freshness gate, so
 * a just-renamed capability could keep this test green while selection found
 * nothing.
 */
const liveCapabilityIds = new Set(getAllDossiers().map((entry) => entry.capability));

describe("follow-up-capability-vocabulary ↔ dossier pool sync", () => {
  it("references at least one capability (pool is non-empty)", () => {
    expect(liveCapabilityIds.size).toBeGreaterThan(0);
    expect(CAPABILITY_VOCABULARY.length).toBeGreaterThan(0);
  });

  it("every vocabulary capability id is declared by a dossier on disk", () => {
    const unknown = CAPABILITY_VOCABULARY.map((entry) => entry.capability).filter(
      (id) => !liveCapabilityIds.has(id),
    );
    expect(unknown).toEqual([]);
  });

  it("has no duplicate capability entries", () => {
    const ids = CAPABILITY_VOCABULARY.map((entry) => entry.capability);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

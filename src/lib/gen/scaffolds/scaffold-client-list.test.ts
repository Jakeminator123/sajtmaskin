import { describe, expect, it } from "vitest";

import { getAllScaffolds } from "./registry";
import {
  MANUALLY_SELECTABLE_SCAFFOLD_CLIENT_LIST,
  SCAFFOLD_CLIENT_LIST,
  SCAFFOLD_OFF_BASELINE_ID,
} from "./types";

const ALL_SCAFFOLDS = getAllScaffolds();

/**
 * `SCAFFOLD_CLIENT_LIST` is a hand-maintained projection of the registry, kept
 * separate so client bundles do not import every scaffold's `files`. That makes
 * silent drift the obvious failure mode: Byggval renders label/description and
 * filters its "Typ av sajt" chips on the mirrored `allowedBuildIntents`, so all
 * three fields must follow their manifest owner.
 */
describe("SCAFFOLD_CLIENT_LIST mirrors the registry", () => {
  it("covers exactly the registered scaffold ids", () => {
    expect([...SCAFFOLD_CLIENT_LIST].map((entry) => entry.id).sort()).toEqual(
      ALL_SCAFFOLDS.map((scaffold) => scaffold.id).sort(),
    );
  });

  it("mirrors label, description and allowedBuildIntents from each manifest", () => {
    for (const entry of SCAFFOLD_CLIENT_LIST) {
      const manifest = ALL_SCAFFOLDS.find((scaffold) => scaffold.id === entry.id);
      expect(manifest, `no manifest for ${entry.id}`).toBeDefined();
      expect(entry.label).toBe(manifest!.label);
      expect(entry.description).toBe(manifest!.description);
      expect([...entry.allowedBuildIntents].sort()).toEqual(
        [...manifest!.allowedBuildIntents].sort(),
      );
    }
  });
});

describe("MANUALLY_SELECTABLE_SCAFFOLD_CLIENT_LIST", () => {
  it("keeps registry-backed choices while excluding the internal Scaffold: Av baseline", () => {
    expect(MANUALLY_SELECTABLE_SCAFFOLD_CLIENT_LIST.map((entry) => entry.id)).toEqual(
      SCAFFOLD_CLIENT_LIST.filter(({ id }) => id !== SCAFFOLD_OFF_BASELINE_ID).map(
        (entry) => entry.id,
      ),
    );
    expect(MANUALLY_SELECTABLE_SCAFFOLD_CLIENT_LIST).not.toContainEqual(
      expect.objectContaining({ id: SCAFFOLD_OFF_BASELINE_ID }),
    );
  });
});

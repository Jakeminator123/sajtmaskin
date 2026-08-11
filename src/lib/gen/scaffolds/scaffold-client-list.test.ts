import { describe, expect, it } from "vitest";

import { getAllScaffolds } from "./registry";
import { SCAFFOLD_CLIENT_LIST } from "./types";

const ALL_SCAFFOLDS = getAllScaffolds();

/**
 * `SCAFFOLD_CLIENT_LIST` is a hand-maintained projection of the registry, kept
 * separate so client bundles do not import every scaffold's `files`. That makes
 * silent drift the obvious failure mode: Byggval filters its "Typ av sajt" chips
 * on the mirrored `allowedBuildIntents`, so a manifest that gains or loses an
 * intent without the mirror following would offer the user a scaffold the
 * matcher refuses to build.
 */
describe("SCAFFOLD_CLIENT_LIST mirrors the registry", () => {
  it("covers exactly the registered scaffold ids", () => {
    expect([...SCAFFOLD_CLIENT_LIST].map((entry) => entry.id).sort()).toEqual(
      ALL_SCAFFOLDS.map((scaffold) => scaffold.id).sort(),
    );
  });

  it("mirrors allowedBuildIntents from each manifest", () => {
    for (const entry of SCAFFOLD_CLIENT_LIST) {
      const manifest = ALL_SCAFFOLDS.find((scaffold) => scaffold.id === entry.id);
      expect(manifest, `no manifest for ${entry.id}`).toBeDefined();
      expect([...entry.allowedBuildIntents].sort()).toEqual(
        [...manifest!.allowedBuildIntents].sort(),
      );
    }
  });
});

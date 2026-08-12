import { describe, expect, it } from "vitest";

import { getAllScaffolds } from "./registry";
import { SCAFFOLD_CLIENT_LIST } from "./scaffold-client-list.generated";

const ALL_SCAFFOLDS = getAllScaffolds();

/**
 * `SCAFFOLD_CLIENT_LIST` is generated from the registry but kept in a standalone
 * literal module so client bundles do not import every scaffold's `files`.
 * This semantic parity test complements the generator's byte-exact check.
 */
describe("SCAFFOLD_CLIENT_LIST mirrors the registry", () => {
  it("covers exactly the registered scaffold ids", () => {
    expect([...SCAFFOLD_CLIENT_LIST].map((entry) => entry.id)).toEqual(
      ALL_SCAFFOLDS.map((scaffold) => scaffold.id),
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

  it("keeps the Scaffold: Av baseline client-selectable without making it an auto rule", () => {
    expect(SCAFFOLD_CLIENT_LIST.at(-1)).toMatchObject({
      id: "projekt-bas-app",
      allowedBuildIntents: ["app", "website"],
    });
  });
});

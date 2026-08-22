import { describe, expect, it } from "vitest";

import { resolvePreviousVersionId } from "./post-checks-diff";

describe("resolvePreviousVersionId", () => {
  it("uses the persisted exact parent when v3 was built from selected v1", () => {
    expect(
      resolvePreviousVersionId("v3", [
        { id: "v3", versionId: "v3", parentVersionId: "v1", createdAt: "2026-08-03" },
        { id: "v2", versionId: "v2", createdAt: "2026-08-02" },
        { id: "v1", versionId: "v1", createdAt: "2026-08-01" },
      ]),
    ).toBe("v1");
  });

  it("keeps chronological fallback for legacy rows without lineage", () => {
    expect(
      resolvePreviousVersionId("v3", [
        { id: "v3", createdAt: "2026-08-03" },
        { id: "v2", createdAt: "2026-08-02" },
        { id: "v1", createdAt: "2026-08-01" },
      ]),
    ).toBe("v2");
  });
});

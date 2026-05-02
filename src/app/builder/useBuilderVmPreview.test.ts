import { describe, expect, it } from "vitest";
import { hasMatchingPreviewSessionMeta } from "./useBuilderVmPreview";

describe("hasMatchingPreviewSessionMeta", () => {
  it("requires a session id bound to the active version", () => {
    expect(
      hasMatchingPreviewSessionMeta(
        { previewSessionId: "sbx_1", versionId: "ver_2" },
        "ver_2",
      ),
    ).toBe(true);

    expect(
      hasMatchingPreviewSessionMeta(
        { previewSessionId: "sbx_1", versionId: "ver_1" },
        "ver_2",
      ),
    ).toBe(false);

    expect(
      hasMatchingPreviewSessionMeta(
        { previewSessionId: "   ", versionId: "ver_2" },
        "ver_2",
      ),
    ).toBe(false);

    expect(hasMatchingPreviewSessionMeta(null, "ver_2")).toBe(false);
  });
});

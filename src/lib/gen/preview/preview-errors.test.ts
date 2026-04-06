import { describe, expect, it } from "vitest";
import { httpStatusForPreviewSessionFailure } from "./preview-errors";

describe("httpStatusForPreviewSessionFailure", () => {
  it("maps repair to 422", () => {
    expect(httpStatusForPreviewSessionFailure({ stage: "repair", message: "x" })).toBe(422);
  });

  it("maps preview-start to 503", () => {
    expect(
      httpStatusForPreviewSessionFailure({ stage: "preview-start", message: "host unavailable" }),
    ).toBe(503);
  });

  it("keeps preview-start failures on 503", () => {
    expect(
      httpStatusForPreviewSessionFailure({
        stage: "preview-start",
        message: "preview-host start failed",
      }),
    ).toBe(503);
  });
});
